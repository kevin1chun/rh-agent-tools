import { execFileSync } from "node:child_process";

/**
 * Check whether a CLI command is available on the system PATH.
 */
export function isCliAvailable(cmd: string): boolean {
  try {
    execFileSync("which", [cmd], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}
