// Thin client for the Google Places API (New) endpoints we need.
import { z } from "zod";

const PLACES_API_BASE = "https://places.googleapis.com/v1";
const PLACES_SEARCH_TEXT_URL = `${PLACES_API_BASE}/places:searchText`;
const PLACES_DETAILS_URL = `${PLACES_API_BASE}/places`;

const PlaceSchema = z.object({
  id: z.string(),
  displayName: z.object({ text: z.string() }).optional(),
  formattedAddress: z.string().optional(),
  location: z
    .object({ latitude: z.number(), longitude: z.number() })
    .optional(),
});

export type Place = z.infer<typeof PlaceSchema>;

const SearchTextResponseSchema = z.object({
  places: z.array(PlaceSchema).optional(),
});

export interface SearchTextParams {
  apiKey: string;
  // Free-text query, typically the business name.
  query: string;
  // Optional location bias to disambiguate places with the same name.
  location?: { latitude: number; longitude: number };
  // Bias radius in meters (defaults to 1000).
  radiusMeters?: number;
}

// Resolve the canonical place_id (and basic details) for a text query using
// the Places API Text Search endpoint. Returns the matched places ordered by
// relevance.
export async function searchPlaces(params: SearchTextParams): Promise<Place[]> {
  const body: Record<string, unknown> = { textQuery: params.query };

  if (params.location) {
    body.locationBias = {
      circle: {
        center: params.location,
        radius: params.radiusMeters ?? 1000,
      },
    };
  }

  const response = await fetch(PLACES_SEARCH_TEXT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": params.apiKey,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.location",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await safeErrorMessage(response);
    throw new Error(
      `Places API request failed (${response.status} ${response.statusText})${
        detail ? `: ${detail}` : ""
      }`,
    );
  }

  const json: unknown = await response.json();
  const parsed = SearchTextResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error("Unexpected response shape from the Places API.");
  }

  return parsed.data.places ?? [];
}

// --- Place Details ----------------------------------------------------------

const LocalizedTextSchema = z.object({
  text: z.string(),
  languageCode: z.string().optional(),
});

const AuthorAttributionSchema = z.object({
  displayName: z.string().optional(),
  uri: z.string().optional(),
  photoUri: z.string().optional(),
});

const ReviewSchema = z.object({
  name: z.string().optional(),
  relativePublishTimeDescription: z.string().optional(),
  rating: z.number().optional(),
  text: LocalizedTextSchema.optional(),
  originalText: LocalizedTextSchema.optional(),
  authorAttribution: AuthorAttributionSchema.optional(),
  publishTime: z.string().optional(),
  googleMapsUri: z.string().optional(),
});

export type Review = z.infer<typeof ReviewSchema>;

const OpeningHoursSchema = z.object({
  openNow: z.boolean().optional(),
  weekdayDescriptions: z.array(z.string()).optional(),
});

const PhotoSchema = z.object({
  // Resource name, e.g. "places/<id>/photos/<ref>". Used to fetch the media.
  name: z.string(),
  widthPx: z.number().optional(),
  heightPx: z.number().optional(),
  authorAttributions: z.array(AuthorAttributionSchema).optional(),
  googleMapsUri: z.string().optional(),
  flagContentUri: z.string().optional(),
});

export type Photo = z.infer<typeof PhotoSchema>;

const PlaceDetailsSchema = z.object({
  id: z.string(),
  displayName: LocalizedTextSchema.optional(),
  formattedAddress: z.string().optional(),
  shortFormattedAddress: z.string().optional(),
  location: z
    .object({ latitude: z.number(), longitude: z.number() })
    .optional(),
  types: z.array(z.string()).optional(),
  primaryType: z.string().optional(),
  primaryTypeDisplayName: LocalizedTextSchema.optional(),
  nationalPhoneNumber: z.string().optional(),
  internationalPhoneNumber: z.string().optional(),
  websiteUri: z.string().optional(),
  googleMapsUri: z.string().optional(),
  businessStatus: z.string().optional(),
  rating: z.number().optional(),
  userRatingCount: z.number().optional(),
  priceLevel: z.string().optional(),
  editorialSummary: LocalizedTextSchema.optional(),
  regularOpeningHours: OpeningHoursSchema.optional(),
  currentOpeningHours: OpeningHoursSchema.optional(),
  photos: z.array(PhotoSchema).optional(),
  reviews: z.array(ReviewSchema).optional(),
});

export type PlaceDetails = z.infer<typeof PlaceDetailsSchema>;

export interface PlaceDetailsResult {
  // Parsed/typed view used for human-readable formatting.
  place: PlaceDetails;
  // The original, unmodified API response so `--json` callers don't lose any
  // fields the schema doesn't explicitly model.
  raw: unknown;
}

export interface PlaceDetailsParams {
  apiKey: string;
  placeId: string;
}

// The field mask requested from the Place Details endpoint. We ask for as much
// information as the (New) API exposes, including up to five reviews. Fields
// are billed by SKU tier; requesting them all maximizes the data returned.
const PLACE_DETAILS_FIELD_MASK = [
  "id",
  "displayName",
  "formattedAddress",
  "shortFormattedAddress",
  "addressComponents",
  "plusCode",
  "location",
  "viewport",
  "types",
  "primaryType",
  "primaryTypeDisplayName",
  "nationalPhoneNumber",
  "internationalPhoneNumber",
  "websiteUri",
  "googleMapsUri",
  "googleMapsLinks",
  "businessStatus",
  "rating",
  "userRatingCount",
  "priceLevel",
  "priceRange",
  "editorialSummary",
  "regularOpeningHours",
  "currentOpeningHours",
  "regularSecondaryOpeningHours",
  "currentSecondaryOpeningHours",
  "utcOffsetMinutes",
  "adrFormatAddress",
  "iconMaskBaseUri",
  "iconBackgroundColor",
  "photos",
  "reviews",
  "paymentOptions",
  "parkingOptions",
  "accessibilityOptions",
  "fuelOptions",
  "evChargeOptions",
  "takeout",
  "delivery",
  "dineIn",
  "curbsidePickup",
  "reservable",
  "servesBreakfast",
  "servesLunch",
  "servesDinner",
  "servesBrunch",
  "servesBeer",
  "servesWine",
  "servesCocktails",
  "servesCoffee",
  "servesDessert",
  "servesVegetarianFood",
  "menuForChildren",
  "outdoorSeating",
  "liveMusic",
  "goodForChildren",
  "goodForGroups",
  "goodForWatchingSports",
  "allowsDogs",
  "restroom",
].join(",");

// Fetch full details for a single place by its place_id using the Places API
// (New) Place Details endpoint.
export async function getPlaceDetails(
  params: PlaceDetailsParams,
): Promise<PlaceDetailsResult> {
  const url = `${PLACES_DETAILS_URL}/${encodeURIComponent(params.placeId)}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "X-Goog-Api-Key": params.apiKey,
      "X-Goog-FieldMask": PLACE_DETAILS_FIELD_MASK,
    },
  });

  if (!response.ok) {
    const detail = await safeErrorMessage(response);
    throw new Error(
      `Places API request failed (${response.status} ${response.statusText})${
        detail ? `: ${detail}` : ""
      }`,
    );
  }

  const raw: unknown = await response.json();
  const parsed = PlaceDetailsSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("Unexpected response shape from the Places API.");
  }

  return { place: parsed.data, raw };
}

// --- Place Photos -----------------------------------------------------------

export interface PlacePhotoParams {
  apiKey: string;
  // The photo resource name, e.g. "places/<id>/photos/<ref>".
  photoName: string;
  // At least one of these should be set (1-4800). Defaults to maxWidthPx=1600.
  maxWidthPx?: number;
  maxHeightPx?: number;
}

export interface PlacePhotoMedia {
  data: Buffer;
  contentType: string | null;
}

// Fetch the binary image for a photo reference via the Place Photo (New)
// endpoint. The endpoint normally 302-redirects to the underlying image; we
// follow the redirect (the default) and return the raw bytes.
export async function fetchPlacePhoto(
  params: PlacePhotoParams,
): Promise<PlacePhotoMedia> {
  const url = new URL(`${PLACES_API_BASE}/${params.photoName}/media`);
  if (params.maxWidthPx !== undefined) {
    url.searchParams.set("maxWidthPx", String(params.maxWidthPx));
  }
  if (params.maxHeightPx !== undefined) {
    url.searchParams.set("maxHeightPx", String(params.maxHeightPx));
  }
  if (params.maxWidthPx === undefined && params.maxHeightPx === undefined) {
    url.searchParams.set("maxWidthPx", "1600");
  }

  const response = await fetch(url, {
    headers: { "X-Goog-Api-Key": params.apiKey },
  });

  if (!response.ok) {
    const detail = await safeErrorMessage(response);
    throw new Error(
      `Place Photo request failed (${response.status} ${response.statusText})${
        detail ? `: ${detail}` : ""
      }`,
    );
  }

  const data = Buffer.from(await response.arrayBuffer());
  return { data, contentType: response.headers.get("content-type") };
}

// Map a photo media content-type to a file extension (defaults to "jpg").
export function photoExtensionFor(contentType: string | null): string {
  switch (contentType?.split(";")[0]?.trim()) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/avif":
      return "avif";
    case "image/jpeg":
    default:
      return "jpg";
  }
}

// Try to pull a human-readable error message out of a failed API response.
async function safeErrorMessage(response: Response): Promise<string | null> {
  try {
    const data = (await response.json()) as {
      error?: { message?: string };
    };
    return data.error?.message ?? null;
  } catch {
    return null;
  }
}
