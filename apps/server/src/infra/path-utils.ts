import { platform } from "node:os";
import { resolve } from "node:path";

/**
 * Normalizes a path for comparison. Resolves to absolute form and uses forward slashes.
 * On Windows, comparison is case-insensitive.
 */
export function normalizePathForComparison(p: string): string {
  const resolved = resolve(p).replace(/\\/g, "/");
  return platform() === "win32" ? resolved.toLowerCase() : resolved;
}

/**
 * Returns true if two paths refer to the same directory.
 */
export function pathsEqual(a: string, b: string): boolean {
  return normalizePathForComparison(a) === normalizePathForComparison(b);
}
