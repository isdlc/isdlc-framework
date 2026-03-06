/**
 * Version compatibility checking for module registry.
 *
 * Uses semver for version comparison. Falls back to string comparison
 * when semver is not available (fail-open per Article X).
 *
 * REQ-0045 / FR-013 / AC-013-04 / M6 Registry
 * @module lib/embedding/registry/compatibility
 */

let semver;
try {
  semver = await import('semver');
  // Handle both ESM default export and named exports
  if (semver.default) semver = semver.default;
} catch {
  semver = null;
}

/**
 * Parse a version string into major.minor.patch components.
 * Fallback for when semver is not available.
 *
 * @param {string} version
 * @returns {{ major: number, minor: number, patch: number } | null}
 */
function parseVersion(version) {
  if (!version || typeof version !== 'string') return null;
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
  };
}

/**
 * Check if two versions are compatible (same major version).
 *
 * @param {string} versionA
 * @param {string} versionB
 * @returns {boolean}
 */
export function isCompatible(versionA, versionB) {
  if (!versionA || !versionB) return false;

  if (semver && semver.major) {
    try {
      const majorA = semver.major(versionA);
      const majorB = semver.major(versionB);
      return majorA === majorB;
    } catch {
      // Fall through to manual parsing
    }
  }

  const a = parseVersion(versionA);
  const b = parseVersion(versionB);
  if (!a || !b) return false;

  return a.major === b.major;
}

/**
 * Get all versions of a module that are compatible with the given version.
 *
 * Compatibility is based on:
 * 1. Module's compatibility.minVersion / maxVersion range (if set)
 * 2. Major version matching (fallback)
 *
 * @param {Object[]} modules - All registered modules
 * @param {string} moduleId - Module to check
 * @param {string} version - Version to check compatibility against
 * @returns {string[]} Compatible version strings
 */
export function getCompatibleVersions(modules, moduleId, version) {
  if (!moduleId || !version) return [];

  // Find all entries for this module ID
  const entries = modules.filter(m => m.id === moduleId);
  if (entries.length === 0) return [];

  const compatible = [];

  for (const entry of entries) {
    const compat = entry.compatibility || {};

    // Check explicit min/max range
    if (compat.minVersion || compat.maxVersion) {
      if (semver && semver.satisfies) {
        try {
          let range = '';
          if (compat.minVersion && compat.maxVersion) {
            range = `>=${compat.minVersion} <=${compat.maxVersion}`;
          } else if (compat.minVersion) {
            range = `>=${compat.minVersion}`;
          } else {
            range = `<=${compat.maxVersion}`;
          }

          if (semver.satisfies(version, range)) {
            compatible.push(entry.version);
          }
          continue;
        } catch {
          // Fall through to major version check
        }
      }
    }

    // Fallback: major version matching
    if (isCompatible(entry.version, version)) {
      compatible.push(entry.version);
    }
  }

  return compatible;
}
