import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Command } from "commander";
import { input } from "@inquirer/prompts";
import { loadCredentials } from "../lib/credentials";
import { resolvePlaceIdFromUrl } from "../lib/maps-url";
import {
  fetchPlacePhoto,
  getPlaceDetails,
  photoExtensionFor,
  type PlaceDetails,
  type Review,
} from "../lib/places";
import { logger } from "../lib/logger";

interface DumpOptions {
  output: string;
  maxWidth?: string;
  maxHeight?: string;
  limit?: string;
}

export function registerDump(program: Command): void {
  program
    .command("dump")
    .description(
      "Resolve a Google Maps URL, write an ABOUT.md, and download its photos.",
    )
    .argument("[url]", "Google Maps place URL (prompted for if omitted)")
    .option("-o, --output <dir>", "directory to write the dump into", ".")
    .option("--max-width <px>", "max photo width in pixels (1-4800)")
    .option("--max-height <px>", "max photo height in pixels (1-4800)")
    .option("-n, --limit <count>", "maximum number of photos to download")
    .action(async (url: string | undefined, options: DumpOptions) => {
      const credentials = await loadCredentials();
      if (!credentials) {
        throw new Error('No credentials found. Run "gmaps init" first.');
      }

      const rawUrl = (
        url ??
        (await input({
          message: "Paste the Google Maps URL:",
          validate: (value) =>
            value.trim().length > 0 ? true : "A URL is required.",
        }))
      ).trim();

      if (rawUrl.length === 0) {
        throw new Error("A Google Maps URL is required.");
      }

      const maxWidthPx = parsePixels(options.maxWidth, "--max-width");
      const maxHeightPx = parsePixels(options.maxHeight, "--max-height");
      const limit = parseLimit(options.limit);

      logger.info("Resolving place_id from URL…");
      const placeId = await resolvePlaceIdFromUrl(credentials.apiKey, rawUrl);

      const { place } = await getPlaceDetails({
        apiKey: credentials.apiKey,
        placeId,
      });

      const outputDir = resolve(options.output);
      await mkdir(outputDir, { recursive: true });

      // Download photos first so we can reference the saved files in ABOUT.md.
      const photosDir = join(outputDir, "photos");
      const photoFiles = await downloadPhotos({
        apiKey: credentials.apiKey,
        place,
        photosDir,
        maxWidthPx,
        maxHeightPx,
        limit,
      });

      const aboutPath = join(outputDir, "ABOUT.md");
      const markdown = buildAboutMarkdown(place, rawUrl, photoFiles);
      await writeFile(aboutPath, markdown, "utf8");
      logger.success(`Wrote ${aboutPath}`);

      logger.success(
        `Dumped "${place.displayName?.text ?? placeId}" to ${outputDir}`,
      );
    });
}

interface DownloadPhotosParams {
  apiKey: string;
  place: PlaceDetails;
  photosDir: string;
  maxWidthPx?: number;
  maxHeightPx?: number;
  limit?: number;
}

// Download a place's photos into `photosDir`, returning the basenames of the
// files that were actually saved (used to build the ABOUT.md gallery).
async function downloadPhotos(params: DownloadPhotosParams): Promise<string[]> {
  let photos = params.place.photos ?? [];
  if (photos.length === 0) {
    logger.warn("No photos available for this place.");
    return [];
  }

  if (params.limit !== undefined) {
    photos = photos.slice(0, params.limit);
  }

  await mkdir(params.photosDir, { recursive: true });

  const slug = slugify(params.place.displayName?.text) || "place";

  logger.info(
    `Downloading ${photos.length} photo${photos.length === 1 ? "" : "s"} to ${params.photosDir}`,
  );

  const saved: string[] = [];
  for (const [index, photo] of photos.entries()) {
    const position = String(index + 1).padStart(2, "0");
    try {
      const media = await fetchPlacePhoto({
        apiKey: params.apiKey,
        photoName: photo.name,
        maxWidthPx: params.maxWidthPx,
        maxHeightPx: params.maxHeightPx,
      });

      const ext = photoExtensionFor(media.contentType);
      const fileName = `${slug}-${position}.${ext}`;
      await writeFile(join(params.photosDir, fileName), media.data);
      saved.push(fileName);
    } catch (err) {
      logger.error(
        `Failed to download photo ${index + 1}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  if (saved.length > 0) {
    logger.success(
      `Saved ${saved.length} photo${saved.length === 1 ? "" : "s"} to ${params.photosDir}`,
    );
  }

  return saved;
}

// Build a Markdown summary of the place intended to be consumed by an AI agent.
function buildAboutMarkdown(
  place: PlaceDetails,
  sourceUrl: string,
  photoFiles: string[],
): string {
  const lines: string[] = [];
  const name = place.displayName?.text ?? "Unknown place";

  lines.push(`# ${name}`);
  lines.push("");

  const subtitle = place.primaryTypeDisplayName?.text ?? place.primaryType;
  if (subtitle) {
    lines.push(`_${subtitle}_`);
    lines.push("");
  }

  if (place.editorialSummary?.text) {
    lines.push("## About");
    lines.push("");
    lines.push(place.editorialSummary.text);
    lines.push("");
  }

  // Overview as a key/value table so structured fields are easy to parse.
  lines.push("## Overview");
  lines.push("");
  lines.push("| Field | Value |");
  lines.push("| --- | --- |");

  const row = (label: string, value: string | undefined): void => {
    if (value !== undefined && value !== "") {
      lines.push(`| ${label} | ${escapeCell(value)} |`);
    }
  };

  row("place_id", place.id);
  row("Address", place.formattedAddress ?? place.shortFormattedAddress);
  row("Phone", place.internationalPhoneNumber ?? place.nationalPhoneNumber);
  row("Website", place.websiteUri ? `<${place.websiteUri}>` : undefined);
  row("Google Maps", place.googleMapsUri ? `<${place.googleMapsUri}>` : undefined);
  row("Status", formatBusinessStatus(place.businessStatus));
  row("Price level", formatPriceLevel(place.priceLevel));

  if (place.rating !== undefined) {
    const count =
      place.userRatingCount !== undefined
        ? ` (${place.userRatingCount.toLocaleString()} reviews)`
        : "";
    row("Rating", `${place.rating.toFixed(1)} / 5${count}`);
  }

  if (place.location) {
    row("Coordinates", `${place.location.latitude}, ${place.location.longitude}`);
  }

  if (place.types?.length) {
    row("Types", place.types.join(", "));
  }

  row("Source URL", `<${sourceUrl}>`);
  lines.push("");

  const hours = place.regularOpeningHours ?? place.currentOpeningHours;
  if (hours?.weekdayDescriptions?.length) {
    lines.push("## Opening hours");
    lines.push("");
    for (const desc of hours.weekdayDescriptions) {
      lines.push(`- ${desc}`);
    }
    lines.push("");
  }

  if (place.reviews?.length) {
    lines.push(`## Reviews (${place.reviews.length})`);
    lines.push("");
    for (const review of place.reviews) {
      lines.push(formatReviewMarkdown(review));
      lines.push("");
    }
  }

  if (photoFiles.length > 0) {
    lines.push(`## Photos (${photoFiles.length})`);
    lines.push("");
    lines.push("Downloaded to the `photos/` subfolder:");
    lines.push("");
    for (const file of photoFiles) {
      lines.push(`- ![${name}](photos/${file})`);
    }
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function formatReviewMarkdown(review: Review): string {
  const author = review.authorAttribution?.displayName ?? "Anonymous";
  const stars = review.rating !== undefined ? `${review.rating.toFixed(0)}/5` : "";
  const when = review.relativePublishTimeDescription
    ? ` · ${review.relativePublishTimeDescription}`
    : "";

  const lines: string[] = [`### ${stars} — ${author}${when}`];

  const body = review.text?.text ?? review.originalText?.text;
  if (body) {
    lines.push("");
    // Render the review body as a blockquote.
    for (const line of body.split("\n")) {
      lines.push(`> ${line}`);
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

// Escape characters that would break a Markdown table cell.
function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function parsePixels(value: string | undefined, flag: string): number | undefined {
  if (value === undefined) return undefined;
  const num = Number(value);
  if (!Number.isInteger(num) || num < 1 || num > 4800) {
    throw new Error(`${flag} must be an integer between 1 and 4800.`);
  }
  return num;
}

function parseLimit(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const num = Number(value);
  if (!Number.isInteger(num) || num < 1) {
    throw new Error("--limit must be a positive integer.");
  }
  return num;
}

// Turn a place name into a filesystem-friendly slug.
function slugify(value: string | undefined): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
