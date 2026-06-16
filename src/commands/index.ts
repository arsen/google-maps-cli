import type { Command } from "commander";
import { registerInit } from "./init";
import { registerPlaceId } from "./place-id";
import { registerPlaceDetails } from "./place-details";
import { registerDownloadPlacePhotos } from "./download-place-photos";

// Each command module exports a registrar that attaches itself to the root
// program. To add a new command: create the module and append it here.
export type CommandRegistrar = (program: Command) => void;

export const COMMANDS: readonly CommandRegistrar[] = [
  registerInit,
  registerPlaceId,
  registerPlaceDetails,
  registerDownloadPlacePhotos,
];

export function registerAll(program: Command): void {
  for (const register of COMMANDS) {
    register(program);
  }
}
