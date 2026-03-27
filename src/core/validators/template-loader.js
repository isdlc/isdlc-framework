/**
 * Template Loader
 * ================
 * REQ-GH-213: Inline Contract Enforcement (FR-004)
 * AC-004-01, AC-004-02, AC-004-04
 *
 * Loads presentation templates with override resolution.
 * Used at build time (by rebuild-cache.js for SessionStart cache)
 * and at runtime (by Codex runtime.js).
 *
 * Override pattern follows ADR-007 from REQ-0141:
 * user override dir fully replaces shipped default per domain.
 *
 * @module src/core/validators/template-loader
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEMPLATE_DOMAINS = ['requirements', 'architecture', 'design', 'tasks'];
const TEMPLATE_SUFFIX = '.template.json';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load a presentation template with override resolution.
 * Checks override dir first, shipped dir second (same as contract loader).
 * Returns null if not found (fail-open, Article X).
 *
 * @param {string} domain - "requirements" | "architecture" | "design" | "tasks"
 * @param {Object} options
 * @param {string} options.shippedPath - Path to shipped templates dir
 * @param {string} options.overridePath - Path to user override templates dir
 * @returns {Object|null} Parsed template or null if not found
 */
export function loadTemplate(domain, options = {}) {
  const { shippedPath, overridePath } = options;
  const filename = `${domain}${TEMPLATE_SUFFIX}`;

  // 1. Check override dir first (full replacement, ADR-007)
  if (overridePath) {
    const overrideFile = join(overridePath, filename);
    try {
      if (existsSync(overrideFile)) {
        const content = readFileSync(overrideFile, 'utf8');
        return JSON.parse(content);
      }
    } catch {
      // Malformed JSON in override — fall through to shipped (fail-open)
    }
  }

  // 2. Fall back to shipped templates
  if (shippedPath) {
    const shippedFile = join(shippedPath, filename);
    try {
      if (existsSync(shippedFile)) {
        const content = readFileSync(shippedFile, 'utf8');
        return JSON.parse(content);
      }
    } catch {
      // Malformed JSON in shipped — return null (fail-open)
    }
  }

  // 3. Not found
  return null;
}

/**
 * Load all templates for all domains.
 * Returns a map of domain -> template. Missing domains are omitted.
 *
 * @param {Object} options
 * @param {string} options.shippedPath - Path to shipped templates dir
 * @param {string} options.overridePath - Path to user override templates dir
 * @returns {Object} Map of domain -> template
 */
export function loadAllTemplates(options = {}) {
  const templates = {};
  for (const domain of TEMPLATE_DOMAINS) {
    const template = loadTemplate(domain, options);
    if (template) {
      templates[domain] = template;
    }
  }
  return templates;
}
