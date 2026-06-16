// Thin client for the Google Places API (New) endpoints we need.
import { z } from "zod";

const PLACES_SEARCH_TEXT_URL = "https://places.googleapis.com/v1/places:searchText";

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
