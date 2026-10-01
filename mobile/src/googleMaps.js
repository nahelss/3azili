// Thin wrapper around the Google Geocoding API — turns a typed address into
// lat/lng (and a cleaned-up formatted address) so it can be stored (e.g.
// users.address_lat/address_lng) or used for a proximity search. Needs
// EXPO_PUBLIC_GOOGLE_MAPS_API_KEY set, with the Geocoding API enabled on
// that key (see the setup notes in the README).
const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

export async function geocodeAddress(query) {
  if (!API_KEY) {
    throw new Error('Missing EXPO_PUBLIC_GOOGLE_MAPS_API_KEY — copy .env.example to .env and fill it in.');
  }
  if (!query?.trim()) {
    throw new Error('Enter an address to search.');
  }
  // region=lb nudges ambiguous matches (e.g. a village name that also
  // exists elsewhere) toward Lebanon without hard-restricting results.
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
    query.trim()
  )}&region=lb&key=${API_KEY}`;

  const res = await fetch(url);
  const data = await res.json();

  if (data.status !== 'OK' || !data.results?.length) {
    if (data.status === 'ZERO_RESULTS') throw new Error('No address found for that search — try being more specific.');
    throw new Error(data.error_message || `Geocoding failed (${data.status})`);
  }

  const result = data.results[0];
  return {
    formattedAddress: result.formatted_address,
    lat: result.geometry.location.lat,
    lng: result.geometry.location.lng,
  };
}

// Haversine distance in km — same formula the web prototype uses, kept
// here so both the mobile app and any future server-side code agree on it.
export function kmBetween(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}
