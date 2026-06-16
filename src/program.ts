import { readFileSync } from "node:fs";
import { Command } from "commander";
import { registerAll } from "./commands";

// Read version from package.json at runtime. Relative to the compiled file
// (dist/program.js), the package manifest lives one level up.
function readVersion(): string {
  try {
    const raw = readFileSync(new URL("../package.json", import.meta.url), "utf8");
    return (JSON.parse(raw) as { version?: string }).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

// Builds the root `gmaps` program with all commands registered.
export function buildProgram(): Command {
  const program = new Command();

  program
    .name("gmaps")
    .description("CLI for accessing Google Maps data via the Google Places API.")
    .version(readVersion(), "-v, --version", "output the current version")
    .showHelpAfterError("(add --help for additional information)")
    .showSuggestionAfterError();

  registerAll(program);

  return program;
}
