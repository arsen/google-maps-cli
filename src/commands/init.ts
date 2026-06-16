import type { Command } from "commander";
import { password } from "@inquirer/prompts";
import { saveCredentials } from "../lib/credentials";
import { CREDENTIALS_PATH } from "../lib/config";
import { logger } from "../lib/logger";

interface InitOptions {
  apiKey?: string;
}

export function registerInit(program: Command): void {
  program
    .command("init")
    .description("Set up credentials by storing a Google Places API key.")
    .option("-k, --api-key <key>", "Google Places API key (prompted for if omitted)")
    .action(async (options: InitOptions) => {
      const apiKey = (
        options.apiKey ??
        (await password({
          message: "Google Places API key:",
          mask: true,
          validate: (value) => (value.trim().length > 0 ? true : "An API key is required."),
        }))
      ).trim();

      if (apiKey.length === 0) {
        throw new Error("An API key is required.");
      }

      await saveCredentials({ type: "api_key", apiKey });

      logger.success("API key saved.");
      logger.info(`Credentials stored at ${CREDENTIALS_PATH}`);
    });
}
