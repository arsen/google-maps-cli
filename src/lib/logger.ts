import pc from "picocolors";

// Small wrapper around console so command output is consistent and colored.
// Diagnostics go to stderr; primary command output should use plain
// console.log so it stays pipeable.
export const logger = {
  info(message: string): void {
    console.error(pc.blue("info"), message);
  },
  success(message: string): void {
    console.error(pc.green("success"), message);
  },
  warn(message: string): void {
    console.error(pc.yellow("warn"), message);
  },
  error(message: string): void {
    console.error(pc.red("error"), message);
  },
};
