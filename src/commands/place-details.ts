import type { Command } from "commander";
import { input } from "@inquirer/prompts";
import pc from "picocolors";
import { loadCredentials } from "../lib/credentials";
import {
  getPlaceDetails,
  type PlaceDetails,
  type Photo,
  type Review,
} from "../lib/places";

interface PlaceDetailsOptions {
  json?: boolean;
}

export function registerPlaceDetails(program: Command): void {
  program
    .command("place-details")
    .description("Fetch detailed information (including reviews) for a place_id.")
    .argument("[place-id]", "Google place_id (prompted for if omitted)")
    .option("--json", "output the full raw API response as JSON")
    .action(async (placeId: string | undefined, options: PlaceDetailsOptions) => {
      const credentials = await loadCredentials();
      if (!credentials) {
        throw new Error('No credentials found. Run "gmaps init" first.');
      }

      // Accept the place_id as a positional argument (best for non-interactive
      // callers), otherwise prompt for it.
      const id = (
        placeId ??
        (await input({
          message: "Enter the place_id:",
          validate: (value) =>
            value.trim().length > 0 ? true : "A place_id is required.",
        }))
      ).trim();

      if (id.length === 0) {
        throw new Error("A place_id is required.");
      }

      const { place, raw } = await getPlaceDetails({
        apiKey: credentials.apiKey,
        placeId: id,
      });

      if (options.json) {
        console.log(JSON.stringify(raw, null, 2));
        return;
      }

      console.log(formatPlaceDetails(place));
    });
}

// Render a human-readable report of the place details.
function formatPlaceDetails(place: PlaceDetails): string {
  const lines: string[] = [];

  const name = place.displayName?.text ?? "(no name)";
  lines.push(pc.bold(name));

  const subtitle = place.primaryTypeDisplayName?.text ?? place.primaryType;
  if (subtitle) {
    lines.push(pc.dim(subtitle));
  }

  lines.push("");

  const field = (label: string, value: string | undefined): void => {
    if (value !== undefined && value !== "") {
      lines.push(`${pc.cyan(`${label}:`)} ${value}`);
    }
  };

  field("place_id", place.id);
  field("Address", place.formattedAddress ?? place.shortFormattedAddress);
  field("Phone", place.internationalPhoneNumber ?? place.nationalPhoneNumber);
  field("Website", place.websiteUri);
  field("Google Maps", place.googleMapsUri);
  field("Status", formatBusinessStatus(place.businessStatus));
  field("Price level", formatPriceLevel(place.priceLevel));

  if (place.rating !== undefined) {
    const count =
      place.userRatingCount !== undefined
        ? ` (${place.userRatingCount.toLocaleString()} reviews)`
        : "";
    field("Rating", `${place.rating.toFixed(1)} / 5${count}`);
  }

  if (place.location) {
    field(
      "Coordinates",
      `${place.location.latitude}, ${place.location.longitude}`,
    );
  }

  if (place.types?.length) {
    field("Types", place.types.join(", "));
  }

  if (place.editorialSummary?.text) {
    lines.push("");
    lines.push(pc.bold("Summary"));
    lines.push(place.editorialSummary.text);
  }

  const hours = place.regularOpeningHours ?? place.currentOpeningHours;
  if (hours?.weekdayDescriptions?.length) {
    lines.push("");
    lines.push(pc.bold("Opening hours"));
    for (const desc of hours.weekdayDescriptions) {
      lines.push(`  ${desc}`);
    }
  }

  if (place.photos?.length) {
    lines.push("");
    lines.push(pc.bold(`Photos (${place.photos.length})`));
    place.photos.forEach((photo, index) => {
      lines.push(`  ${index + 1}. ${formatPhoto(photo)}`);
    });
    lines.push(pc.dim('  Run "gmaps download-place-photos" to save these.'));
  }

  if (place.reviews?.length) {
    lines.push("");
    lines.push(pc.bold(`Reviews (${place.reviews.length})`));
    for (const review of place.reviews) {
      lines.push("");
      lines.push(formatReview(review));
    }
  }

  return lines.join("\n");
}

function formatPhoto(photo: Photo): string {
  const parts: string[] = [];

  if (photo.widthPx !== undefined && photo.heightPx !== undefined) {
    parts.push(`${photo.widthPx}x${photo.heightPx}`);
  }

  const author = photo.authorAttributions?.[0]?.displayName;
  if (author) {
    parts.push(`by ${author}`);
  }

  return parts.length > 0 ? parts.join(" ") : photo.name;
}

function formatReview(review: Review): string {
  const lines: string[] = [];

  const author = review.authorAttribution?.displayName ?? "Anonymous";
  const stars =
    review.rating !== undefined ? `${review.rating.toFixed(0)}/5` : "";
  const when = review.relativePublishTimeDescription
    ? pc.dim(` · ${review.relativePublishTimeDescription}`)
    : "";

  lines.push(`  ${pc.yellow(stars)} ${pc.bold(author)}${when}`);

  const body = review.text?.text ?? review.originalText?.text;
  if (body) {
    for (const line of body.split("\n")) {
      lines.push(`  ${line}`);
    }
  }

  return lines.join("\n");
}

function formatBusinessStatus(status: string | undefined): string | undefined {
  if (!status) return undefined;
  switch (status) {
    case "OPERATIONAL":
      return "Operational";
    case "CLOSED_TEMPORARILY":
      return "Temporarily closed";
    case "CLOSED_PERMANENTLY":
      return "Permanently closed";
    default:
      return status;
  }
}

function formatPriceLevel(level: string | undefined): string | undefined {
  if (!level) return undefined;
  switch (level) {
    case "PRICE_LEVEL_FREE":
      return "Free";
    case "PRICE_LEVEL_INEXPENSIVE":
      return "$";
    case "PRICE_LEVEL_MODERATE":
      return "$$";
    case "PRICE_LEVEL_EXPENSIVE":
      return "$$$";
    case "PRICE_LEVEL_VERY_EXPENSIVE":
      return "$$$$";
    default:
      return level;
  }
}
