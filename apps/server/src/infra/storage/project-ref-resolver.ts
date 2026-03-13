import type { ProjectRecord } from "@opentasks/contracts";
import { pathsEqual } from "../path-utils";

/**
 * Resolves a project reference (id, key, name, or workingDirectory) to a project record.
 * Used by stores and services to accept flexible project identification from MCP tools.
 *
 * Resolution order:
 * 1. Exact match on id
 * 2. Exact match on key
 * 3. Case-insensitive match on name
 * 4. Path match on workingDirectory (normalized, cross-platform)
 */
export function resolveProjectFromRef(
  projects: ProjectRecord[],
  projectRef: string
): ProjectRecord | null {
  if (!projectRef?.trim()) {
    return null;
  }

  const trimmed = projectRef.trim();

  // 1. id or key (exact)
  const byIdOrKey = projects.find(
    (p) => p.id === trimmed || p.key === trimmed
  );
  if (byIdOrKey) return byIdOrKey;

  // 2. name (case-insensitive)
  const byName = projects.find(
    (p) => p.name.toLowerCase() === trimmed.toLowerCase()
  );
  if (byName) return byName;

  // 3. workingDirectory (path equality)
  const byPath = projects.find(
    (p) => p.workingDirectory && pathsEqual(p.workingDirectory, trimmed)
  );
  if (byPath) return byPath;

  return null;
}
