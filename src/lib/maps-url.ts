// Helpers for working with Google Maps place URLs.
//
// A typical "place" URL looks like:
//   https://www.google.com/maps/place/Some+Business/@34.17,-118.28,17z/
//     data=...!1s0x80c2c1adecdca0dd:0xb61c6d66c055010e!8m2!3d34.17!4d-118.27!16s...
//
// We extract the business name, the place coordinates, and the hex "feature
// id" so a downstream lookup (Places API text search) can resolve the
// canonical place_id.

export interface ParsedMapsUrl {
  // The decoded business / place name, if present in the URL path.
  name?: string;
  // The place's coordinates. Prefers the `!3d/!4d` data block (the marker
  // location) over the `@lat,lng` viewport center.
  latitude?: number;
  longitude?: number;
  // The hex feature id, e.g. "0x80c2c1adecdca0dd:0xb61c6d66c055010e".
  featureId?: string;
}

const SHORT_LINK_HOSTS = new Set([
  "maps.app.goo.gl",
  "goo.gl",
  "g.co",
]);

// Follow redirects for shortened Google Maps links (e.g. maps.app.goo.gl/...)
// and return the expanded URL. Non-short URLs are returned unchanged.
export async function resolveMapsUrl(url: string): Promise<string> {
  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    throw new Error(`Not a valid URL: ${url}`);
  }

  if (!SHORT_LINK_HOSTS.has(host)) {
    return url;
  }

  const response = await fetch(url, { method: "GET", redirect: "follow" });
  // `response.url` reflects the final URL after following redirects.
  return response.url || url;
}

// Parse a (already-expanded) Google Maps URL into its component parts.
export function parseMapsUrl(url: string): ParsedMapsUrl {
  const result: ParsedMapsUrl = {};

  const nameMatch = url.match(/\/place\/([^/@]+)/);
  if (nameMatch?.[1]) {
    try {
      result.name = decodeURIComponent(nameMatch[1].replace(/\+/g, " ")).trim();
    } catch {
      result.name = nameMatch[1].replace(/\+/g, " ").trim();
    }
  }

  // Marker coordinates from the data block: `!3d<lat>!4d<lng>`.
  const markerMatch = url.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (markerMatch?.[1] && markerMatch[2]) {
    result.latitude = Number(markerMatch[1]);
    result.longitude = Number(markerMatch[2]);
  } else {
    // Fall back to the viewport center: `@<lat>,<lng>,...`.
    const viewportMatch = url.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    if (viewportMatch?.[1] && viewportMatch[2]) {
      result.latitude = Number(viewportMatch[1]);
      result.longitude = Number(viewportMatch[2]);
    }
  }

  // Hex feature id from the data block: `!1s0x...:0x...`.
  const ftidMatch = url.match(/!1s(0x[0-9a-fA-F]+:0x[0-9a-fA-F]+)/);
  if (ftidMatch?.[1]) {
    result.featureId = ftidMatch[1];
  }

  return result;
}
