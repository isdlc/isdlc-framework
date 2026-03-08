/**
 * Version compatibility checking for module registry.
 *
 * Uses semver for version comparison. Falls back to string comparison
 * when semver is not available (fail-open per Article X).
 *
 * REQ-0045 / FR-013 / AC-013-04 / M6 Registry
 * REQ-0045 / FR-009 / AC-009-01 through AC-009-04 / M6 Compatibility Extension
 * @module lib/embedding/registry/compatibility
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

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

// ── FR-009: Cross-Module Compatibility Matrix ──────────────────

/**
 * Check if a version satisfies a semver range string.
 * Falls back to major-version comparison when semver is unavailable.
 *
 * @param {string} version - e.g. '1.5.0'
 * @param {string} range - e.g. '>=1.0.0 <2.0.0'
 * @returns {boolean}
 */
function satisfiesRange(version, range) {
  if (!version || !range) return false;

  if (semver && semver.satisfies) {
    try {
      return semver.satisfies(version, range);
    } catch {
      // Fall through to manual check
    }
  }

  // Manual fallback: parse range constraints
  const parsed = parseVersion(version);
  if (!parsed) return false;

  const constraints = range.match(/(>=?|<=?)\s*(\d+\.\d+\.\d+)/g);
  if (!constraints) return false;

  for (const constraint of constraints) {
    const match = constraint.match(/(>=?|<=?)\s*(\d+\.\d+\.\d+)/);
    if (!match) continue;
    const op = match[1];
    const target = parseVersion(match[2]);
    if (!target) continue;

    const cmp = (parsed.major - target.major) * 10000 +
                (parsed.minor - target.minor) * 100 +
                (parsed.patch - target.patch);

    switch (op) {
      case '>=': if (cmp < 0) return false; break;
      case '>':  if (cmp <= 0) return false; break;
      case '<=': if (cmp > 0) return false; break;
      case '<':  if (cmp >= 0) return false; break;
    }
  }

  return true;
}

/**
 * Cross-module compatibility matrix.
 *
 * Declares which versions of module B are compatible with module A.
 * Rules use semver range syntax (e.g. '>=1.0.0 <2.0.0').
 *
 * AC-009-01: Matrix declares compatible versions
 * AC-009-02: Validates compatibility at load time
 * AC-009-03: Update checker offers only compatible combinations
 * AC-009-04: Clear error messages with alternatives
 *
 * @example
 * const matrix = new CompatibilityMatrix([
 *   { module: 'mod-auth', compatibleWith: { 'mod-orders': '>=1.0.0 <2.0.0' } }
 * ]);
 * const result = matrix.validateModulePair('mod-auth', '2.1.0', 'mod-orders', '1.5.0');
 * // { compatible: true }
 */
export class CompatibilityMatrix {
  /** @type {Array<{ module: string, compatibleWith: Record<string, string> }>} */
  #rules;

  /**
   * @param {Array<{ module: string, compatibleWith: Record<string, string> }>} rules
   */
  constructor(rules = []) {
    this.#rules = rules.map(r => ({
      module: r.module,
      compatibleWith: { ...r.compatibleWith },
    }));
  }

  /**
   * Load a CompatibilityMatrix from a JSON file.
   * File format: { version: string, rules: [...] }
   *
   * @param {string} filePath
   * @returns {CompatibilityMatrix}
   */
  static fromFile(filePath) {
    const raw = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    return new CompatibilityMatrix(Array.isArray(parsed.rules) ? parsed.rules : []);
  }

  /**
   * Get all rules in the matrix.
   * @returns {Array<{ module: string, compatibleWith: Record<string, string> }>}
   */
  getRules() {
    return this.#rules.map(r => ({
      module: r.module,
      compatibleWith: { ...r.compatibleWith },
    }));
  }

  /**
   * Serialize the matrix to a JSON-serializable object.
   * @returns {{ version: string, rules: Array }}
   */
  toJSON() {
    return {
      version: '1.0.0',
      rules: this.getRules(),
    };
  }

  /**
   * Save the matrix to a JSON file.
   * @param {string} filePath
   */
  saveToFile(filePath) {
    const dir = dirname(filePath);
    mkdirSync(dir, { recursive: true });
    writeFileSync(filePath, JSON.stringify(this.toJSON(), null, 2), 'utf-8');
  }

  /**
   * Add or replace a rule for a module.
   * @param {string} moduleId
   * @param {Record<string, string>} compatibleWith
   */
  addRule(moduleId, compatibleWith) {
    const idx = this.#rules.findIndex(r => r.module === moduleId);
    const entry = { module: moduleId, compatibleWith: { ...compatibleWith } };
    if (idx >= 0) {
      this.#rules[idx] = entry;
    } else {
      this.#rules.push(entry);
    }
  }

  /**
   * Find the constraint for a module pair (A -> B).
   * Searches both direct (A declares constraint on B) and reverse
   * (B declares constraint on A) directions.
   *
   * @param {string} moduleA
   * @param {string} moduleB
   * @returns {{ sourceModule: string, targetModule: string, range: string } | null}
   */
  #findConstraint(moduleA, moduleB) {
    // Direct: A declares constraint on B
    for (const rule of this.#rules) {
      if (rule.module === moduleA && rule.compatibleWith[moduleB]) {
        return {
          sourceModule: moduleA,
          targetModule: moduleB,
          range: rule.compatibleWith[moduleB],
        };
      }
    }
    // Reverse: B declares constraint on A
    for (const rule of this.#rules) {
      if (rule.module === moduleB && rule.compatibleWith[moduleA]) {
        return {
          sourceModule: moduleB,
          targetModule: moduleA,
          range: rule.compatibleWith[moduleA],
        };
      }
    }
    return null;
  }

  /**
   * Validate whether two specific module versions are compatible.
   * AC-009-02: Validates at load time.
   * AC-009-04: Clear error with constraint info.
   *
   * @param {string} moduleA - First module ID
   * @param {string} versionA - First module version
   * @param {string} moduleB - Second module ID
   * @param {string} versionB - Second module version
   * @returns {{ compatible: boolean, error?: string }}
   */
  validateModulePair(moduleA, versionA, moduleB, versionB) {
    const constraint = this.#findConstraint(moduleA, moduleB);

    // No constraint means permissive (compatible)
    if (!constraint) {
      return { compatible: true };
    }

    // Determine which version to check against the range
    // If constraint says "sourceModule declares targetModule must be in range",
    // then we check the targetModule's version against the range
    const versionToCheck = constraint.targetModule === moduleA ? versionA : versionB;

    if (satisfiesRange(versionToCheck, constraint.range)) {
      return { compatible: true };
    }

    // AC-009-04: Clear error message with module names, versions, and constraint
    const error = `Incompatible: ${constraint.sourceModule} requires ` +
      `${constraint.targetModule} ${constraint.range}, ` +
      `but got ${constraint.targetModule}@${versionToCheck}`;

    return { compatible: false, error };
  }

  /**
   * Validate a set of modules for mutual compatibility.
   * Checks all pairs. Returns all incompatibilities found.
   *
   * @param {Array<{ moduleId: string, version: string }>} moduleSet
   * @returns {{ compatible: boolean, errors: string[] }}
   */
  validateSet(moduleSet) {
    const errors = [];

    for (let i = 0; i < moduleSet.length; i++) {
      for (let j = i + 1; j < moduleSet.length; j++) {
        const a = moduleSet[i];
        const b = moduleSet[j];
        const result = this.validateModulePair(a.moduleId, a.version, b.moduleId, b.version);
        if (!result.compatible) {
          errors.push(result.error);
        }
      }
    }

    return { compatible: errors.length === 0, errors };
  }

  /**
   * Filter available versions to only those compatible with loaded modules.
   * AC-009-03: Update checker offers only compatible combinations.
   *
   * @param {string} targetModuleId - Module to find compatible versions for
   * @param {string[]} availableVersions - All available versions of the target
   * @param {Array<{ moduleId: string, version: string }>} loadedModules - Currently loaded modules
   * @returns {string[]} Versions that are compatible with all loaded modules
   */
  getCompatibleUpdates(targetModuleId, availableVersions, loadedModules) {
    return availableVersions.filter(candidateVersion => {
      for (const loaded of loadedModules) {
        if (loaded.moduleId === targetModuleId) continue;
        const result = this.validateModulePair(
          loaded.moduleId, loaded.version,
          targetModuleId, candidateVersion
        );
        if (!result.compatible) return false;
      }
      return true;
    });
  }
}
