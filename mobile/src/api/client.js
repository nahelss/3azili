// This used to call a separate Express API (see the old /backend folder in
// earlier versions of this starter). It now talks to Supabase directly —
// Postgres + Auth + Storage — with Row Level Security enforcing who can read
// or write what (see the project's migrations for the actual policies).
//
// The `api.*` method names and shapes are kept identical to the old REST
// client on purpose, so SearchScreen/CleanerProfileScreen/BookingScreen/
// CleanerHomeScreen didn't need to change at all.
import { supabase } from '../supabaseClient';

export async function requestOtp(phone) {
  const { error } = await supabase.auth.signInWithOtp({ phone });
  if (error) throw error;
  return { ok: true };
}

export async function verifyOtp({ phone, token }) {
  const { data, error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' });
  if (error) throw error;
  return data;
}

// Called once, right after a brand-new phone verifies for the first time.
// Creates the shared `users` row plus whichever profile row(s) the chosen
// role needs. `role` is 'client' | 'cleaner' | 'both'.
export async function completeSignup({ userId, phone, fullName, role }) {
  const { error: userErr } = await supabase.from('users').insert({
    id: userId,
    phone,
    full_name: fullName,
    role,
  });
  if (userErr) throw userErr;

  if (role === 'client' || role === 'both') {
    const { error } = await supabase.from('client_profiles').insert({ user_id: userId });
    if (error) throw error;
  }
  if (role === 'cleaner' || role === 'both') {
    const { error } = await supabase.from('cleaner_profiles').insert({ user_id: userId });
    if (error) throw error;
  }
  const { data, error } = await supabase.from('users').select('*').eq('id', userId).single();
  if (error) throw error;
  return data;
}

async function getRegions() {
  const { data, error } = await supabase
    .from('regions')
    .select('id, name, cities(id, name)')
    .order('name');
  if (error) throw error;
  // cities come back unsorted per region from the nested select; sort client-side
  return data.map((r) => ({ ...r, cities: [...r.cities].sort((a, b) => a.name.localeCompare(b.name)) }));
}

async function searchCleaners({ city } = {}) {
  let query = supabase
    .from('cleaner_profiles')
    .select(
      `user_id, hourly_rate, daily_rate, service_type, cleaner_rating_avg, cleaner_rating_count, anonymous_toggle,
       users!inner(full_name, languages_spoken),
       cleaner_coverage_cities!inner(city_id, cities!inner(name))`
    );
  if (city) {
    query = query.eq('cleaner_coverage_cities.cities.name', city);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data.map((c) => ({
    id: c.user_id,
    displayName: c.anonymous_toggle ? `Anonymous #${c.user_id.slice(0, 4)}` : c.users.full_name,
    languages: c.users.languages_spoken || [],
    hourlyRate: c.hourly_rate,
    dailyRate: c.daily_rate,
    ratingAvg: c.cleaner_rating_avg,
    ratingCount: c.cleaner_rating_count,
  }));
}

async function getCleaner(id) {
  const { data, error } = await supabase
    .from('cleaner_profiles')
    .select(
      `user_id, about_you, hourly_rate, daily_rate, service_type, min_booking_duration,
       cleaner_rating_avg, cleaner_rating_count, anonymous_toggle, member_since, hours_worked, days_worked,
       users!inner(full_name),
       cleaner_coverage_cities(cities(id, name, regions(name)))`
    )
    .eq('user_id', id)
    .single();
  if (error) throw error;
  return {
    id: data.user_id,
    anonymous: data.anonymous_toggle,
    user: { fullName: data.users.full_name },
    aboutYou: data.about_you,
    hourlyRate: data.hourly_rate,
    dailyRate: data.daily_rate,
    minBookingHours: data.min_booking_duration,
    serviceType: data.service_type,
    ratingAvg: data.cleaner_rating_avg,
    ratingCount: data.cleaner_rating_count,
    memberSince: data.member_since,
    hoursWorked: data.hours_worked,
    daysWorked: data.days_worked,
    coverageCities: data.cleaner_coverage_cities.map((c) => ({ id: c.cities.id, name: c.cities.name, region: c.cities.regions.name })),
  };
}

async function updateCoverage(cleanerId, cityIds) {
  // Replace-all semantics, same as the old PATCH /cleaners/:id/coverage.
  const { error: delErr } = await supabase.from('cleaner_coverage_cities').delete().eq('cleaner_id', cleanerId);
  if (delErr) throw delErr;
  if (cityIds.length) {
    const { error: insErr } = await supabase
      .from('cleaner_coverage_cities')
      .insert(cityIds.map((city_id) => ({ cleaner_id: cleanerId, city_id })));
    if (insErr) throw insErr;
  }
  return { ok: true };
}

async function createBooking(payload) {
  // payload: { clientId, cleanerId, pricingType, duration, cityId, pinLat?, pinLng?, serviceType,
  //            cleaningType, specialRequest, bookingMode, scheduledStart, scheduledEnd,
  //            paymentMethod, supplyItemIds, clientProvidesSupplies }
  // Pricing/commission math should ultimately be verified server-side (a Supabase Edge Function)
  // before charging anyone for real — this direct insert is fine for the demo/MVP stage.
  const { data: cleaner, error: cleanerErr } = await supabase
    .from('cleaner_profiles')
    .select('hourly_rate, daily_rate')
    .eq('user_id', payload.cleanerId)
    .single();
  if (cleanerErr) throw cleanerErr;

  const { data: config } = await supabase.from('platform_config').select('*').single();
  const laborRate = Number(config?.commission_rate_labor ?? 20) / 100;
  const suppliesRate = Number(config?.commission_rate_supplies ?? 7) / 100;

  const rate = payload.pricingType === 'hourly' ? cleaner.hourly_rate : cleaner.daily_rate;
  const base = rate * payload.duration;
  const commission = base * laborRate;

  let suppliesClientTotal = 0;
  let suppliesCleanerPayout = 0;
  if (!payload.clientProvidesSupplies && payload.supplyItemIds?.length) {
    const { data: items, error: itemsErr } = await supabase
      .from('supply_catalog_items')
      .select('id, cleaner_payout_price')
      .in('id', payload.supplyItemIds);
    if (itemsErr) throw itemsErr;
    suppliesCleanerPayout = items.reduce((s, i) => s + Number(i.cleaner_payout_price), 0);
    suppliesClientTotal = suppliesCleanerPayout * (1 + suppliesRate);
  }
  const suppliesCommission = suppliesClientTotal - suppliesCleanerPayout;
  const total = base + commission + suppliesClientTotal;

  const { data: booking, error } = await supabase
    .from('bookings')
    .insert({
      client_id: payload.clientId,
      cleaner_id: payload.cleanerId,
      pricing_type: payload.pricingType,
      scheduled_start: payload.scheduledStart,
      scheduled_end: payload.scheduledEnd,
      city_id: payload.cityId,
      pin_lat: payload.pinLat ?? null,
      pin_lng: payload.pinLng ?? null,
      cleaning_type: payload.cleaningType ?? 'standard',
      service_type: payload.serviceType,
      special_request: payload.specialRequest ?? null,
      booking_mode: payload.bookingMode ?? 'request_accept',
      supplies_client_provides: !!payload.clientProvidesSupplies,
      base_price: base,
      commission_amount: commission,
      supplies_client_total: suppliesClientTotal,
      supplies_cleaner_payout: suppliesCleanerPayout,
      supplies_commission: suppliesCommission,
      total_price: total,
      payment_method: payload.paymentMethod,
      status: 'requested',
    })
    .select()
    .single();
  if (error) throw error;

  if (!payload.clientProvidesSupplies && payload.supplyItemIds?.length) {
    await supabase
      .from('booking_supplies')
      .insert(payload.supplyItemIds.map((supply_item_id) => ({ booking_id: booking.id, supply_item_id })));
  }
  return booking;
}

async function getBooking(id) {
  const { data, error } = await supabase.from('bookings').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export const api = {
  requestOtp,
  verifyOtp,
  completeSignup,
  getRegions,
  searchCleaners,
  getCleaner,
  updateCoverage,
  createBooking,
  getBooking,
};
