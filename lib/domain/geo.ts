/** Straight-line geodesic helpers. No routing provider is integrated. */

export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Estimated response time in minutes.
 * NOTE: straight-line distance divided by an assumed speed, adjusted by a
 * congestion factor. This is an ESTIMATE and is labelled as such in the UI.
 */
export function estimateEtaMinutes(
  distanceKm: number,
  speedKmh: number,
  congestionFactor = 1,
): number {
  if (speedKmh <= 0) return Number.POSITIVE_INFINITY;
  return (distanceKm / speedKmh) * 60 * congestionFactor;
}
