import type { Command } from "commander";
import { input } from "@inquirer/prompts";
import { loadCredentials } from "../lib/credentials";
import { resolvePlaceIdFromUrl } from "../lib/maps-url";

export function registerPlaceId(program: Command): void {
  program
    .command("place-id")
    .description("Resolve the Google place_id for a Google Maps place URL.")
    .argument("[url]", "Google Maps place URL (prompted for if omitted)")
    .action(async (url: string | undefined) => {
      const credentials = await loadCredentials();
      if (!credentials) {
        throw new Error('No credentials found. Run "gmaps init" first.');
      }

      // Pass the URL as a positional argument (best for non-interactive
      // callers like an AI agent invoking the binary directly), otherwise we
      // prompt so a pasted URL bypasses shell history expansion.
      const rawUrl = (
        url ??
        (await input({
          message: "Paste the Google Maps URL:",
          validate: (value) => (value.trim().length > 0 ? true : "A URL is required."),
        }))
      ).trim();

      if (rawUrl.length === 0) {
        throw new Error("A Google Maps URL is required.");
      }

      const placeId = await resolvePlaceIdFromUrl(credentials.apiKey, rawUrl);

      // Output only the bare place_id so it can be captured directly.
      console.log(placeId);
    });
}
