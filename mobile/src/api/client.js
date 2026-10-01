// This used to call a separate Express API (see the old /backend folder in
// earlier versions of this starter). It now talks to Supabase directly —
// Postgres + Auth + Storage — with Row Level Security enforcing who can read
// or write what (see the project's migrations for the actual policies).
//
// The `api.*` method names and shapes are kept identical to the old REST
// client on purpose, so SearchScreen/CleanerProfileScreen/BookingScreen/
// CleanerHomeScreen didn't need to change at all.
import { supabase } from '../supabaseClient';
import { kmBetween } from '../googleMaps';

// Codes are delivered over plain SMS — set the "SMS Provider" in Supabase
// (Authentication > Providers > Phone) to Twilio with a Twilio phone number
// (not the WhatsApp sandbox number). `channel: 'sms'` is the default, but
// it's set explicitly here so it's obvious this is SMS, not WhatsApp.
// `type: 'sms'` on verify below is just Supabase's internal label for
// "phone OTP" — unrelated to which channel actually sent the code.
export async function requestOtp(phone) {
  const { error } = await supabase.auth.signInWithOtp({ phone, options: { channel: 'sms' } });
  if (error) throw error;
  return { ok: true };
}

export async function verifyOtp({ phone, token }) {
  const { data, error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' });
  if (error) throw error;
  return data;
}

// --- Email + password sign-in (testing-phase default) -----------------
// Used in place of phone/SMS OTP for now, to avoid Twilio costs while
// testing. Switching back to phone+SMS as the primary sign-in later is
// just a UI change — this doesn't touch the phone/OTP functions above,
// which stay intact and ready. `signUp` may or may not return a session
// depending on the Supabase project's "Confirm email" setting
// (Authentication > Providers > Email): if it's ON, no session comes back
// until the person clicks the confirmation link Supabase emails them; if
// it's OFF (simplest for testing), the session comes back immediately and
// they're signed in right away.
export async function signUpWithPassword(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data; // { user, session } — session is null if email confirmation is required
}

export async function signInWithPassword(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

// Email as an account-recovery path: once an email is attached and
// confirmed (see attachEmail), the same account can sign in with an email
// code instead of SMS — for someone who's lost access to their phone
// number. Supabase matches by email to the existing auth user, so this
// signs into the SAME account rather than creating a new one, as long as
// the email was actually confirmed when it was attached.
export async function requestEmailOtp(email) {
  const { error } = await supabase.auth.signInWithOtp({ email });
  if (error) throw error;
  return { ok: true };
}

export async function verifyEmailOtp({ email, token }) {
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw error;
  return data;
}

// Attaches/updates the email on the currently signed-in auth account.
// Supabase emails a confirmation link to the new address — the email only
// becomes usable for sign-in/recovery once that's clicked. Also mirrors it
// onto the public.users row immediately, for display/contact purposes.
export async function attachEmail(email) {
  const { error: authErr } = await supabase.auth.updateUser({ email });
  if (authErr) throw authErr;
  const { data: userData } = await supabase.auth.getUser();
  if (userData?.user?.id) {
    await supabase.from('users').update({ email }).eq('id', userData.user.id);
  }
  return { ok: true };
}

// Called once, right after a brand-new phone verifies for the first time.
// Creates the shared `users` row plus whichever profile row(s) the chosen
// role needs. `role` is 'client' | 'cleaner' | 'both'.
export async function completeSignup({ userId, phone, email, fullName, role, address, addressLat, addressLng }) {
  const { error: userErr } = await supabase.from('users').insert({
    id: userId,
    phone: phone ?? null,
    email: email ?? null,
    full_name: fullName,
    role,
    full_address: address ?? null,
    address_lat: addressLat ?? null,
    address_lng: addressLng ?? null,
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

// Saves the geocoded address from AuthScreen's sign-up step (or a later
// "update my address" screen) onto the shared users row.
async function updateMyAddress({ userId, address, lat, lng }) {
  const { error } = await supabase
    .from('users')
    .update({ full_address: address, address_lat: lat, address_lng: lng })
    .eq('id', userId);
  if (error) throw error;
  return { ok: true };
}

// Proximity search: geocode an address client-side (see googleMaps.js),
// then filter cleaners whose own address is within radiusKm — same
// haversine approach as the web prototype. There's no PostGIS index here
// yet, so this pulls candidate cleaners (optionally narrowed by city) and
// filters in JS; fine at MVP scale, worth moving server-side once the
// cleaner list gets big.
async function searchCleanersNearby({ lat, lng, radiusKm = 10, city } = {}) {
  let query = supabase
    .from('cleaner_profiles')
    .select(
      `user_id, hourly_rate, daily_rate, service_type, cleaner_rating_avg, cleaner_rating_count, anonymous_toggle,
       users!inner(full_name, languages_spoken, address_lat, address_lng)`
    );
  if (city) {
    query = supabase
      .from('cleaner_profiles')
      .select(
        `user_id, hourly_rate, daily_rate, service_type, cleaner_rating_avg, cleaner_rating_count, anonymous_toggle,
         users!inner(full_name, languages_spoken, address_lat, address_lng),
         cleaner_coverage_cities!inner(city_id, cities!inner(name))`
      )
      .eq('cleaner_coverage_cities.cities.name', city);
  }
  const { data, error } = await query;
  if (error) throw error;

  return data
    .filter((c) => c.users.address_lat != null && c.users.address_lng != null)
    .map((c) => ({
      id: c.user_id,
      displayName: c.anonymous_toggle ? `Anonymous #${c.user_id.slice(0, 4)}` : c.users.full_name,
      languages: c.users.languages_spoken || [],
      hourlyRate: c.hourly_rate,
      dailyRate: c.daily_rate,
      ratingAvg: c.cleaner_rating_avg,
      ratingCount: c.cleaner_rating_count,
      distanceKm: kmBetween({ lat, lng }, { lat: c.users.address_lat, lng: c.users.address_lng }),
    }))
    .filter((c) => c.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);
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

// The name/number clients are told to send Whish transfers to — set by an
// admin from AdminScreen's Settings section (admin_set_platform_config).
async function getWhishReceiveInfo() {
  const { data, error } = await supabase
    .from('platform_config')
    .select('whish_receive_name, whish_receive_number')
    .single();
  if (error) throw error;
  return { name: data.whish_receive_name, number: data.whish_receive_number };
}

// Records the client's claim that they sent a Whish transfer, with whatever
// reference/confirmation text they were given. This does NOT verify the
// money actually arrived — there's no Whish merchant API for that yet (see
// chat) — it just puts the payment in 'pending' for an admin to check
// against the real Whish account and clear with admin_mark_payment_cleared.
async function submitWhishPayment({ bookingId, payerId, amount, reference }) {
  const { data, error } = await supabase
    .from('payments')
    .insert({
      booking_id: bookingId,
      payer_id: payerId,
      amount,
      method: 'whish',
      type: 'full_payment',
      status: 'pending',
      payer_reference: reference || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ---- Admin (all gated server-side by is_admin() — see the migrations) ----

async function checkIsAdmin() {
  const { data, error } = await supabase.rpc('is_admin');
  if (error) return false;
  return !!data;
}

async function getAdminStats() {
  const { data, error } = await supabase.rpc('admin_get_stats');
  if (error) throw error;
  return data;
}

async function getPlatformConfig() {
  const { data, error } = await supabase.from('platform_config').select('*').single();
  if (error) throw error;
  return data;
}

async function setPlatformConfig({ laborRate, suppliesRate, prepay, whishName, whishNumber }) {
  const { data, error } = await supabase.rpc('admin_set_platform_config', {
    p_labor_rate: laborRate ?? null,
    p_supplies_rate: suppliesRate ?? null,
    p_prepay: prepay ?? null,
    p_whish_name: whishName ?? null,
    p_whish_number: whishNumber ?? null,
  });
  if (error) throw error;
  return data;
}

// Regions/cities with their recommended-rate rows joined in, for the admin
// "Regions & rates" section.
async function getRegionsWithRates() {
  const [{ data: regions, error: regionsErr }, { data: rates, error: ratesErr }] = await Promise.all([
    supabase.from('regions').select('id, name, cities(id, name)').order('name'),
    supabase.from('region_rate_config').select('region_id, recommended_hourly_rate'),
  ]);
  if (regionsErr) throw regionsErr;
  if (ratesErr) throw ratesErr;
  const rateByRegion = Object.fromEntries((rates ?? []).map((r) => [r.region_id, r.recommended_hourly_rate]));
  return regions.map((r) => ({
    ...r,
    cities: [...r.cities].sort((a, b) => a.name.localeCompare(b.name)),
    recommendedHourlyRate: rateByRegion[r.id] ?? null,
  }));
}

async function addRegion(name) {
  const { data, error } = await supabase.rpc('admin_add_region', { p_name: name });
  if (error) throw error;
  return data;
}

async function removeRegion(regionId) {
  const { error } = await supabase.rpc('admin_remove_region', { p_region_id: regionId });
  if (error) throw error;
  return { ok: true };
}

async function addCity(regionId, name) {
  const { data, error } = await supabase.rpc('admin_add_city', { p_region_id: regionId, p_name: name });
  if (error) throw error;
  return data;
}

async function removeCity(cityId) {
  const { error } = await supabase.rpc('admin_remove_city', { p_city_id: cityId });
  if (error) throw error;
  return { ok: true };
}

async function bulkImportCities(regionId, names, sourceFileName) {
  const { data, error } = await supabase.rpc('admin_bulk_import_cities', {
    p_region_id: regionId,
    p_names: names,
    p_source_file: sourceFileName ?? null,
  });
  if (error) throw error;
  return data;
}

async function setRecommendedRate(regionId, rate) {
  const { data, error } = await supabase.rpc('admin_set_recommended_rate', { p_region_id: regionId, p_rate: rate });
  if (error) throw error;
  return data;
}

async function listPendingPayments() {
  const { data, error } = await supabase
    .from('payments')
    .select('*, bookings(id, client_id, cleaner_id, total_price)')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

async function markPaymentCleared(paymentId, note) {
  const { data, error } = await supabase.rpc('admin_mark_payment_cleared', {
    p_payment_id: paymentId,
    p_note: note ?? null,
  });
  if (error) throw error;
  return data;
}

async function listDisputes() {
  const { data, error } = await supabase
    .from('disputes')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

// Direct table write, not an RPC — "disputes update by admin" RLS already
// permits it, and resolving a dispute doesn't carry the same
// financial-audit weight as the money-moving admin_* functions.
async function resolveDispute(disputeId, resolution) {
  const { data, error } = await supabase
    .from('disputes')
    .update({ status: 'resolved', resolution, resolved_by: (await supabase.auth.getUser()).data.user?.id })
    .eq('id', disputeId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function listAuditLog(limit = 100) {
  const { data, error } = await supabase
    .from('audit_log')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

async function listUsers() {
  const { data, error } = await supabase
    .from('users')
    .select('id, full_name, phone, email, role, is_suspended, id_verified, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

async function setUserSuspended(userId, suspended, reason) {
  const { data, error } = await supabase.rpc('admin_set_user_suspended', {
    p_user_id: userId,
    p_suspended: suspended,
    p_reason: reason ?? null,
  });
  if (error) throw error;
  return data;
}

export const api = {
  requestOtp,
  verifyOtp,
  signUpWithPassword,
  signInWithPassword,
  requestEmailOtp,
  verifyEmailOtp,
  attachEmail,
  completeSignup,
  getRegions,
  searchCleaners,
  searchCleanersNearby,
  updateMyAddress,
  getCleaner,
  updateCoverage,
  createBooking,
  getBooking,
  getWhishReceiveInfo,
  submitWhishPayment,
  checkIsAdmin,
  getAdminStats,
  getPlatformConfig,
  setPlatformConfig,
  getRegionsWithRates,
  addRegion,
  removeRegion,
  addCity,
  removeCity,
  bulkImportCities,
  setRecommendedRate,
  listPendingPayments,
  markPaymentCleared,
  listDisputes,
  resolveDispute,
  listAuditLog,
  listUsers,
  setUserSuspended,
};
