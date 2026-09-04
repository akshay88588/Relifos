/**
 * REAL PLACES IN AND AROUND GHATKESAR, TELANGANA.
 *
 * The demo used to scatter incidents across generated coordinates on tidy
 * 4-decimal increments, which reads on a map as exactly what it was: a lattice
 * of invented points. These are actual named locations with their true
 * coordinates, so an incident card names somewhere a responder could drive to.
 *
 * Two entries are independently verified against primary sources:
 *   - Ghatkesar Bus Depot / town centre  17.4494, 78.6853  (Wikipedia infobox)
 *   - Ghatkesar Railway Station          17.452874, 78.678258 (Wikipedia infobox)
 * The remainder were supplied from Google Maps by the project owner.
 *
 * NOTE ON VERIFICATION: Wikipedia's own infobox for SNIST gives 17.385, 78.487,
 * which is central Hyderabad and roughly 20 km from the campus it describes.
 * That is why assertWithinOperatingArea() exists — a plausible-looking
 * coordinate from an authoritative-looking source can still be wrong, and a
 * responder dispatched to it would drive to the wrong city.
 */

export type PlaceKind =
  | "transport" | "education" | "medical" | "civic" | "worship" | "residential" | "road";

export interface Place {
  name: string;
  lat: number;
  lng: number;
  kind: PlaceKind;
}

export const GHATKESAR_PLACES: Place[] = [
  { name: "Ghatkesar Bus Depot",                          lat: 17.4494,   lng: 78.6853,   kind: "transport" },
  { name: "Ghatkesar Railway Station",                    lat: 17.452874, lng: 78.678258, kind: "transport" },
  { name: "Government Primary School, Aushapur",          lat: 17.4362,   lng: 78.7561,   kind: "education" },
  { name: "Sreenidhi Institute of Science & Technology",  lat: 17.4552,   lng: 78.6661,   kind: "education" },
  { name: "Ghatkesar Police Station",                     lat: 17.4475,   lng: 78.6872,   kind: "civic" },
  { name: "Government Junior College, Ghatkesar",         lat: 17.4489,   lng: 78.6841,   kind: "education" },
  { name: "Primary Health Centre, Ghatkesar",             lat: 17.4468,   lng: 78.6865,   kind: "medical" },
  { name: "Sri Hanuman Temple, Ghatkesar Main Road",      lat: 17.4502,   lng: 78.6828,   kind: "worship" },
  { name: "Vignan Institute of Technology, Deshmukhi Rd", lat: 17.3812,   lng: 78.7185,   kind: "education" },
  { name: "Anurag University, Venkatapur",                lat: 17.4208,   lng: 78.6562,   kind: "education" },
  { name: "Samskruti College of Engineering, Kondapur",   lat: 17.4725,   lng: 78.6948,   kind: "education" },
  { name: "Ghatkesar Mandal Revenue Office",              lat: 17.4478,   lng: 78.6870,   kind: "civic" },
  { name: "SBI Ghatkesar Branch",                         lat: 17.4491,   lng: 78.6838,   kind: "civic" },
  { name: "Shiva Temple, Yamnampet",                      lat: 17.4682,   lng: 78.6624,   kind: "worship" },
  { name: "NTR Colony, Ghatkesar",                        lat: 17.4431,   lng: 78.6812,   kind: "residential" },
  { name: "Ghatkesar Bypass Junction, NH-163",            lat: 17.4452,   lng: 78.6915,   kind: "road" },
  { name: "ZP High School, Ghatkesar",                    lat: 17.4510,   lng: 78.6805,   kind: "education" },
  { name: "KIMS Clinic, Ghatkesar Road",                  lat: 17.4445,   lng: 78.6798,   kind: "medical" },
  { name: "ORR Ghatkesar Exit 9",                         lat: 17.4392,   lng: 78.6658,   kind: "road" },
  { name: "Aushapur Junction, NH-163",                    lat: 17.4358,   lng: 78.7524,   kind: "road" },
];

/**
 * The envelope every operational coordinate must fall inside. Padded around the
 * real extent of the places above. Wikipedia's bad SNIST coordinate
 * (17.385, 78.487) fails this on longitude, which is the point.
 */
export const OPERATING_AREA = {
  minLat: 17.35, maxLat: 17.50,
  minLng: 78.60, maxLng: 78.80,
} as const;

export function isWithinOperatingArea(lat: number, lng: number) {
  return (
    lat >= OPERATING_AREA.minLat && lat <= OPERATING_AREA.maxLat &&
    lng >= OPERATING_AREA.minLng && lng <= OPERATING_AREA.maxLng
  );
}

/** Fails loudly at seed time rather than quietly dropping a pin in the sea. */
export function assertWithinOperatingArea(name: string, lat: number, lng: number) {
  if (!isWithinOperatingArea(lat, lng)) {
    throw new Error(
      `Coordinate for "${name}" (${lat}, ${lng}) is outside the Ghatkesar operating area. ` +
      `Check it on a map before seeding — a wrong coordinate sends a responder to the wrong place.`,
    );
  }
}

export function placeByName(name: string): Place {
  const p = GHATKESAR_PLACES.find((x) => x.name === name);
  if (!p) throw new Error(`Unknown place: ${name}`);
  return p;
}

/**
 * A small deterministic offset from a real anchor, so two incidents at the same
 * school do not stack into one pin. Bounded well under 150 m and derived from
 * the seed value, so the same input always produces the same point — no
 * lattice, no run-to-run drift.
 */
export function jitterAround(place: Place, seed: number, maxMetres = 120) {
  const golden = 2.399963229728653; // radians, keeps successive angles far apart
  const angle = seed * golden;
  const radius = ((Math.sin(seed * 12.9898) * 43758.5453) % 1 + 1) % 1; // 0..1, deterministic
  const metres = radius * maxMetres;
  const dLat = (metres * Math.cos(angle)) / 111_320;
  const dLng = (metres * Math.sin(angle)) / (111_320 * Math.cos((place.lat * Math.PI) / 180));
  return { lat: place.lat + dLat, lng: place.lng + dLng };
}
