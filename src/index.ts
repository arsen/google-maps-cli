#!/usr/bin/env node
import { buildProgram } from "./program";
import { logger } from "./lib/logger";

buildProgram()
  .parseAsync(process.argv)
  .catch((err: unknown) => {
    logger.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
