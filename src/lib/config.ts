import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";

// Root config directory for the CLI, e.g. ~/.google-maps-cli
export const CONFIG_DIR = join(homedir(), ".google-maps-cli");

// Where the active credentials (Google Places API key) are stored.
export const CREDENTIALS_PATH = join(CONFIG_DIR, "credentials.json");

// Ensure the config directory exists (created with owner-only access) and
// return its path. Safe to call repeatedly.
export async function ensureConfigDir(): Promise<string> {
  await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
  return CONFIG_DIR;
}
