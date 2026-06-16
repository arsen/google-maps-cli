import type { Command } from "commander";
import { registerInit } from "./init";

// Each command module exports a registrar that attaches itself to the root
// program. To add a new command: create the module and append it here.
export type CommandRegistrar = (program: Command) => void;

export const COMMANDS: readonly CommandRegistrar[] = [registerInit];

export function registerAll(program: Command): void {
  for (const register of COMMANDS) {
    register(program);
  }
}
