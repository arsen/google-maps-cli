import { readFile, writeFile, rm } from "node:fs/promises";
import { z } from "zod";
import { CREDENTIALS_PATH, ensureConfigDir } from "./config";

// The Google Places API authenticates with an API key. We model credentials
// as a tagged union so other auth methods (e.g. OAuth / service account) can
// be added later without breaking the stored file format.
export const ApiKeyCredentials = z.object({
  type: z.literal("api_key"),
  apiKey: z.string().min(1),
});

export type ApiKeyCredentials = z.infer<typeof ApiKeyCredentials>;

export const Credentials = z.discriminatedUnion("type", [ApiKeyCredentials]);

export type Credentials = z.infer<typeof Credentials>;

// Read the stored credentials, or null if not configured / unreadable.
export async function loadCredentials(): Promise<Credentials | null> {
  let raw: string;
  try {
    raw = await readFile(CREDENTIALS_PATH, "utf8");
  } catch {
    return null;
  }

  try {
    const result = Credentials.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

// Persist credentials to ~/.google-maps-cli/credentials.json with owner-only
// perms (the API key is a secret).
export async function saveCredentials(credentials: Credentials): Promise<void> {
  await ensureConfigDir();
  await writeFile(CREDENTIALS_PATH, JSON.stringify(credentials, null, 2), {
    mode: 0o600,
  });
}

// Remove stored credentials. Returns true if a file was removed.
export async function clearCredentials(): Promise<boolean> {
  try {
    await rm(CREDENTIALS_PATH);
    return true;
  } catch {
    return false;
  }
}
