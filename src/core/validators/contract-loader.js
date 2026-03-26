/**
 * Contract Loader
 * ================
 * REQ-0141: Execution Contract System (FR-002, FR-006, FR-008)
 * AC-002-01 through AC-002-06, AC-006-01 through AC-006-04, AC-008-03
 *
 * Loads contract files from shipped and override paths.
 * Applies override precedence (full replacement per ADR-007).
 * Detects staleness via generation-time hashes.
 *
 * @module src/core/validators/contract-loader
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { validateContract } from './contract-schema.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Scan a directory for contract JSON files and parse them.
 * @param {string} dirPath
 * @returns {Object[]} Array of parsed contract objects
 */
function scanContractDir(dirPath) {
  const contracts = [];
  try {
    if (!existsSync(dirPath)) return contracts;
    const files = readdirSync(dirPath).filter(f => f.endsWith('.contract.json')).sort();
    for (const file of files) {
      try {
        const content = readFileSync(join(dirPath, file), 'utf8');
        const parsed = JSON.parse(content);
        contracts.push(parsed);
      } catch {
        // Skip malformed files -- fail-open (Article X)
      }
    }
  } catch {
    // Directory read error -- fail-open
  }
  return contracts;
}

/**
 * Find a matching entry in a list of contract objects.
 * @param {Object[]} contracts
 * @param {string} executionUnit
 * @param {string} context
 * @returns {{ entry: Object|null, contractFile: Object|null }}
 */
function findEntry(contracts, executionUnit, context) {
  for (const contract of contracts) {
    if (!contract || !Array.isArray(contract.entries)) continue;
    for (const entry of contract.entries) {
      if (entry.execution_unit === executionUnit && entry.context === context) {
        return { entry, contractFile: contract };
      }
    }
  }
  return { entry: null, contractFile: null };
}

/**
 * Auto-regenerate contracts by invoking bin/generate-contracts.js.
 * Fail-open: returns true on success, false on failure (caller continues with stale contract).
 * @param {string} projectRoot
 * @param {string} outputDir - Target directory for regenerated contracts
 * @returns {boolean}
 */
function autoRegenerate(projectRoot, outputDir) {
  try {
    const generatorPath = join(projectRoot, 'bin', 'generate-contracts.js');
    if (!existsSync(generatorPath)) return false;
    execFileSync('node', [generatorPath, '--output', outputDir], {
      cwd: projectRoot,
      timeout: 10000,
      stdio: 'pipe'
    });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load the contract entry for a given execution unit and context.
 * Override resolution: .isdlc/config/contracts/ wins over .claude/hooks/config/contracts/
 * for the same execution_unit + context key. Full replacement (ADR-007).
 *
 * @param {string} executionUnit - Phase key or context name
 * @param {string} context - Workflow type:intensity or context name
 * @param {Object} options
 * @param {string} options.projectRoot - Project root path
 * @param {string} [options.shippedPath] - Override shipped contracts path (testing)
 * @param {string} [options.overridePath] - Override user contracts path (testing)
 * @returns {{ entry: Object|null, stale: boolean, staleReason: string|null, source: 'shipped'|'override'|null }}
 */
export function loadContractEntry(executionUnit, context, options = {}) {
  try {
    const projectRoot = options.projectRoot || '.';
    const shippedDir = options.shippedPath || join(projectRoot, '.claude', 'hooks', 'config', 'contracts');
    const overrideDir = options.overridePath || join(projectRoot, '.isdlc', 'config', 'contracts');

    // 1. Check override first (full replacement, ADR-007)
    let overrideContracts = scanContractDir(overrideDir);
    let overrideResult = findEntry(overrideContracts, executionUnit, context);
    if (overrideResult.entry) {
      const staleness = overrideResult.contractFile?._generation_metadata
        ? checkStaleness(overrideResult.contractFile._generation_metadata, projectRoot)
        : { stale: false, reason: null, changedFiles: [] };

      // Auto-regenerate on staleness
      if (staleness.stale) {
        const regenerated = autoRegenerate(projectRoot, overrideDir);
        if (regenerated) {
          overrideContracts = scanContractDir(overrideDir);
          overrideResult = findEntry(overrideContracts, executionUnit, context);
          if (overrideResult.entry) {
            return { entry: overrideResult.entry, stale: false, staleReason: null, source: 'override' };
          }
        }
        // Regeneration failed — continue with stale contract (fail-open)
      }

      return {
        entry: overrideResult.entry,
        stale: staleness.stale,
        staleReason: staleness.reason,
        source: 'override'
      };
    }

    // 2. Fall back to shipped contracts
    let shippedContracts = scanContractDir(shippedDir);
    let shippedResult = findEntry(shippedContracts, executionUnit, context);
    if (shippedResult.entry) {
      const staleness = shippedResult.contractFile?._generation_metadata
        ? checkStaleness(shippedResult.contractFile._generation_metadata, projectRoot)
        : { stale: false, reason: null, changedFiles: [] };

      // Auto-regenerate on staleness
      if (staleness.stale) {
        const regenerated = autoRegenerate(projectRoot, shippedDir);
        if (regenerated) {
          shippedContracts = scanContractDir(shippedDir);
          shippedResult = findEntry(shippedContracts, executionUnit, context);
          if (shippedResult.entry) {
            return { entry: shippedResult.entry, stale: false, staleReason: null, source: 'shipped' };
          }
        }
        // Regeneration failed — continue with stale contract (fail-open)
      }

      return {
        entry: shippedResult.entry,
        stale: staleness.stale,
        staleReason: staleness.reason,
        source: 'shipped'
      };
    }

    // 3. Not found
    return { entry: null, stale: false, staleReason: null, source: null };
  } catch {
    // Fail-open (Article X)
    return { entry: null, stale: false, staleReason: null, source: null };
  }
}

/**
 * Check if a contract file is stale by re-hashing its declared input files.
 * Only hashes files listed in _generation_metadata.input_files[].
 *
 * @param {Object} metadata - _generation_metadata from contract file
 * @param {string} projectRoot - Project root for resolving paths
 * @returns {{ stale: boolean, reason: string|null, changedFiles: string[] }}
 */
export function checkStaleness(metadata, projectRoot) {
  try {
    if (!metadata || !Array.isArray(metadata.input_files)) {
      return { stale: false, reason: null, changedFiles: [] };
    }

    const changedFiles = [];
    for (const inputFile of metadata.input_files) {
      if (!inputFile || !inputFile.path || !inputFile.hash) continue;

      const filePath = join(projectRoot, inputFile.path);
      try {
        if (!existsSync(filePath)) {
          changedFiles.push(inputFile.path);
          continue;
        }
        const content = readFileSync(filePath);
        const currentHash = createHash('sha256').update(content).digest('hex');
        if (currentHash !== inputFile.hash) {
          changedFiles.push(inputFile.path);
        }
      } catch {
        // File unreadable -- treat as changed
        changedFiles.push(inputFile.path);
      }
    }

    if (changedFiles.length > 0) {
      return {
        stale: true,
        reason: `Contract stale -- config changed since generation. Changed files: ${changedFiles.join(', ')}. Run \`node bin/generate-contracts.js\` to update.`,
        changedFiles
      };
    }

    return { stale: false, reason: null, changedFiles: [] };
  } catch {
    // Fail-open: treat as not stale if check fails
    return { stale: false, reason: null, changedFiles: [] };
  }
}
