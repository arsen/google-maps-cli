import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Command } from "commander";
import { input } from "@inquirer/prompts";
import { loadCredentials } from "../lib/credentials";
import {
  fetchPlacePhoto,
  getPlaceDetails,
  photoExtensionFor,
} from "../lib/places";
import { logger } from "../lib/logger";

interface DownloadOptions {
  output: string;
  maxWidth?: string;
  maxHeight?: string;
  limit?: string;
}

export function registerDownloadPlacePhotos(program: Command): void {
  program
    .command("download-place-photos")
    .description("Download a place's photos to a local directory.")
    .argument("[place-id]", "Google place_id (prompted for if omitted)")
    .option("-o, --output <dir>", "directory to save photos to", ".")
    .option("--max-width <px>", "max width in pixels (1-4800)")
    .option("--max-height <px>", "max height in pixels (1-4800)")
    .option("-n, --limit <count>", "maximum number of photos to download")
    .action(async (placeId: string | undefined, options: DownloadOptions) => {
      const credentials = await loadCredentials();
      if (!credentials) {
        throw new Error('No credentials found. Run "gmaps init" first.');
      }

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

      const maxWidthPx = parsePixels(options.maxWidth, "--max-width");
      const maxHeightPx = parsePixels(options.maxHeight, "--max-height");
      const limit = parseLimit(options.limit);

      const { place } = await getPlaceDetails({
        apiKey: credentials.apiKey,
        placeId: id,
      });

      let photos = place.photos ?? [];
      if (photos.length === 0) {
        logger.warn("No photos available for this place.");
        return;
      }

      if (limit !== undefined) {
        photos = photos.slice(0, limit);
      }

      const outputDir = resolve(options.output);
      await mkdir(outputDir, { recursive: true });

      const slug = slugify(place.displayName?.text) || "place";

      logger.info(
        `Downloading ${photos.length} photo${photos.length === 1 ? "" : "s"} to ${outputDir}`,
      );

      let saved = 0;
      for (const [index, photo] of photos.entries()) {
        const position = String(index + 1).padStart(2, "0");
        try {
          const media = await fetchPlacePhoto({
            apiKey: credentials.apiKey,
            photoName: photo.name,
            maxWidthPx,
            maxHeightPx,
          });

          const ext = photoExtensionFor(media.contentType);
          const filePath = join(outputDir, `${slug}-${position}.${ext}`);
          await writeFile(filePath, media.data);
          saved += 1;

          // Print the saved path to stdout so output stays pipeable.
          console.log(filePath);
        } catch (err) {
          logger.error(
            `Failed to download photo ${index + 1}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }

      if (saved === 0) {
        throw new Error("No photos could be downloaded.");
      }

      logger.success(
        `Saved ${saved} photo${saved === 1 ? "" : "s"} to ${outputDir}`,
      );
    });
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
