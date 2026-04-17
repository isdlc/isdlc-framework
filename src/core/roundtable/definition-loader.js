/**
 * Definition Loader — loads and merges roundtable definitions
 *
 * Loads core.json (shared invariants) + {workflowType}.json (state graph)
 * from shipped path (src/isdlc/config/roundtable/) and user override path
 * (.isdlc/config/roundtable/), merges core into workflow, validates against
 * schemas.
 *
 * Override pattern: user override at .isdlc/config/roundtable/ replaces
 * shipped default per file (REQ-GH-213 ADR-007).
 *
 * Fail-open: returns null on load/parse/validate failure (Article X).
 *
 * Traces: FR-002, AC-002-01, AC-002-03
 * @module src/core/roundtable/definition-loader
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/** Shipped roundtable definitions: src/isdlc/config/roundtable/ */
const SHIPPED_DIR = resolve(__dirname, '..', '..', 'isdlc', 'config', 'roundtable');

/** Schemas for validation: src/core/roundtable/schemas/ */
const SCHEMA_DIR = resolve(__dirname, 'schemas');

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Safely read and parse a JSON file. Returns null on any error (fail-open).
 * @param {string} filePath - Absolute path to JSON file
 * @returns {object|null} Parsed JSON or null
 */
function safeReadJson(filePath) {
  try {
    if (!existsSync(filePath)) return null;
    const content = readFileSync(filePath, 'utf8');
    if (!content || !content.trim()) return null;
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Resolve a JSON file with override precedence.
 * Override dir is checked first; shipped dir is fallback (ADR-007).
 *
 * @param {string} filename - JSON filename (e.g., 'core.json')
 * @param {string} shippedDir - Shipped config directory
 * @param {string|null} overrideDir - User override directory (may be null)
 * @returns {object|null} Parsed JSON or null
 */
function resolveWithOverride(filename, shippedDir, overrideDir) {
  // 1. Check override first (full replacement per ADR-007)
  if (overrideDir) {
    const overridePath = join(overrideDir, filename);
    const data = safeReadJson(overridePath);
    if (data !== null) return data;
  }
  // 2. Fall back to shipped
  return safeReadJson(join(shippedDir, filename));
}

/**
 * Deep-merge source into target. Source values take precedence.
 * Arrays are replaced (not concatenated).
 *
 * @param {object} target
 * @param {object} source
 * @returns {object} Merged result (new object)
 */
function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] !== null &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      typeof result[key] === 'object' &&
      result[key] !== null &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(result[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

/**
 * Validate a data object against a JSON Schema (draft-07 subset).
 * Checks only `required` top-level properties and basic `type` assertions.
 * This is intentionally lightweight — a full JSON Schema validator is not
 * bundled to avoid dependency weight.
 *
 * @param {object} data - Object to validate
 * @param {object} schema - JSON Schema object
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateAgainstSchema(data, schema) {
  const errors = [];
  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Data is not an object'] };
  }
  // Check required properties
  if (Array.isArray(schema.required)) {
    for (const key of schema.required) {
      if (data[key] === undefined || data[key] === null) {
        errors.push(`Missing required property: ${key}`);
      }
    }
  }
  // Check top-level property types where schema.properties specifies type
  if (schema.properties) {
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if (data[key] === undefined || data[key] === null) continue;
      const expectedType = propSchema.type;
      if (!expectedType) continue;
      const actualType = Array.isArray(data[key]) ? 'array' : typeof data[key];
      if (expectedType === 'integer' && typeof data[key] === 'number' && Number.isInteger(data[key])) continue;
      if (expectedType === 'array' && Array.isArray(data[key])) continue;
      if (typeof expectedType === 'string' && actualType !== expectedType && expectedType !== 'integer') {
        errors.push(`Property "${key}" expected type "${expectedType}", got "${actualType}"`);
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load the core roundtable definition (shared invariants).
 *
 * Resolves core.json from override dir first, then shipped dir.
 * Validates against core.schema.json. Returns null on failure (fail-open).
 *
 * @param {object} [options]
 * @param {string} [options.shippedDir] - Override shipped definitions dir
 * @param {string} [options.overrideDir] - User override directory (.isdlc/config/roundtable/)
 * @param {boolean} [options.skipValidation=false] - Skip schema validation
 * @returns {object|null} Parsed core definition or null
 */
export function loadCore(options = {}) {
  try {
    const shipped = options.shippedDir || SHIPPED_DIR;
    const override = options.overrideDir || null;

    const core = resolveWithOverride('core.json', shipped, override);
    if (!core) return null;

    // Validate against core schema (advisory — fail-open per module-design.md)
    if (!options.skipValidation) {
      const schema = safeReadJson(join(SCHEMA_DIR, 'core.schema.json'));
      if (schema) {
        const { valid, errors } = validateAgainstSchema(core, schema);
        if (!valid) {
          process.stderr.write(`[definition-loader] core.json schema advisory: ${errors.join('; ')}\n`);
          // Fail-open: return data despite validation warnings (Article X)
        }
      }
    }

    return core;
  } catch {
    // Fail-open (Article X): return null on any unexpected error
    return null;
  }
}

/**
 * Load a workflow-specific roundtable definition.
 *
 * Resolves {workflowType}.json from override dir first, then shipped dir.
 * Validates against workflow.schema.json. Returns null on failure (fail-open).
 *
 * @param {string} workflowType - Workflow type ('analyze' or 'bug-gather')
 * @param {object} [options]
 * @param {string} [options.shippedDir] - Override shipped definitions dir
 * @param {string} [options.overrideDir] - User override directory
 * @param {boolean} [options.skipValidation=false] - Skip schema validation
 * @returns {object|null} Parsed workflow definition or null
 */
export function loadWorkflow(workflowType, options = {}) {
  try {
    if (!workflowType || typeof workflowType !== 'string') return null;

    const shipped = options.shippedDir || SHIPPED_DIR;
    const override = options.overrideDir || null;
    const filename = `${workflowType}.json`;

    const workflow = resolveWithOverride(filename, shipped, override);
    if (!workflow) return null;

    // Validate against workflow schema (advisory — fail-open per module-design.md)
    if (!options.skipValidation) {
      const schema = safeReadJson(join(SCHEMA_DIR, 'workflow.schema.json'));
      if (schema) {
        const { valid, errors } = validateAgainstSchema(workflow, schema);
        if (!valid) {
          process.stderr.write(`[definition-loader] ${filename} schema advisory: ${errors.join('; ')}\n`);
          // Fail-open: return data despite validation warnings (Article X)
        }
      }
    }

    return workflow;
  } catch {
    return null;
  }
}

/**
 * Load a composed roundtable definition: core + workflow merged.
 *
 * 1. Loads core.json (shared invariants)
 * 2. Loads {workflowType}.json (state graph, sub-tasks, tier rules)
 * 3. Merges core into workflow: workflow inherits rendering_modes,
 *    persona_model, amending_semantics, participation_gate,
 *    early_exit, accept/amend indicators, tier_contract from core.
 *    Workflow-local keys (states, confirmation_sequence, etc.) remain.
 * 4. Validates merged result against workflow.schema.json.
 * 5. Returns null on any failure (fail-open, Article X).
 *
 * @param {string} workflowType - 'analyze' or 'bug-gather'
 * @param {object} [options]
 * @param {string} [options.shippedDir] - Override shipped definitions dir
 * @param {string} [options.overrideDir] - User override directory (.isdlc/config/roundtable/)
 * @param {boolean} [options.skipValidation=false] - Skip schema validation
 * @returns {object|null} Composed definition or null on failure
 */
export function loadDefinition(workflowType, options = {}) {
  try {
    if (!workflowType || typeof workflowType !== 'string') return null;

    const loadOpts = {
      shippedDir: options.shippedDir || SHIPPED_DIR,
      overrideDir: options.overrideDir || null,
      skipValidation: true, // We validate the merged result, not individual parts
    };

    // 1. Load core
    const core = loadCore(loadOpts);
    if (!core) {
      process.stderr.write(`[definition-loader] Failed to load core.json, returning null\n`);
      return null;
    }

    // 2. Load workflow
    const workflow = loadWorkflow(workflowType, loadOpts);
    if (!workflow) {
      process.stderr.write(`[definition-loader] Failed to load ${workflowType}.json, returning null\n`);
      return null;
    }

    // 3. Merge: core fields become the base, workflow overrides/extends
    //    Core provides: rendering_modes, persona_model, amending_semantics,
    //    participation_gate, early_exit, accept/amend indicators, tier_contract,
    //    conversation_rendering_rules, stop_wait_contract, confirmation_prompt
    //    Workflow provides: states, confirmation_sequence, completion_signal,
    //    tier_rules, artifact_sets, templates, entry_state, workflow_type
    const composed = deepMerge(core, workflow);

    // 4. Validate merged result against workflow schema (advisory — fail-open)
    if (!options.skipValidation) {
      const schema = safeReadJson(join(SCHEMA_DIR, 'workflow.schema.json'));
      if (schema) {
        const { valid, errors } = validateAgainstSchema(composed, schema);
        if (!valid) {
          process.stderr.write(`[definition-loader] Composed definition advisory: ${errors.join('; ')}\n`);
          // Fail-open: return composed result despite validation warnings (Article X)
        }
      }
    }

    // Attach a marker for composed definitions
    composed._composed = true;
    composed._core_version = core.version || '1.0.0';

    return composed;
  } catch {
    // Fail-open (Article X)
    return null;
  }
}
