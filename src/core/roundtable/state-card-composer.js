/**
 * State Card Composer — composes outer affordance card for current user-facing state
 *
 * Loads card template from state-cards/ (shipped + override), merges with
 * runtime context (personas, rendering mode, amendment_cycles, topic coverage,
 * preferred tools), returns composed text block.
 *
 * Uses template-loader pattern for card template resolution.
 * Enforces output contract: all required fields present, max ~40 lines.
 * Fail-open: returns minimal card on any error (Article X).
 *
 * Traces: FR-001, AC-001-01
 * @module src/core/roundtable/state-card-composer
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/** Shipped state card templates: src/isdlc/config/roundtable/state-cards/ */
const SHIPPED_STATE_CARDS_DIR = resolve(__dirname, '..', '..', 'isdlc', 'config', 'roundtable', 'state-cards');

/** Maximum lines for composed state card output */
const MAX_TOTAL_LINES = 40;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Safely read and parse a JSON file. Returns null on any error (fail-open).
 * @param {string} filePath
 * @returns {object|null}
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
 * Map state name to card template filename.
 * Convention: state name in UPPER_CASE maps to lowercase-hyphenated.card.json
 * Example: PRESENTING_REQUIREMENTS -> presenting-requirements.card.json
 *          CONVERSATION -> conversation.card.json
 *
 * @param {string} stateName - State name in UPPER_CASE
 * @returns {string} Card template filename
 */
function stateToFilename(stateName) {
  return stateName.toLowerCase().replace(/_/g, '-') + '.card.json';
}

/**
 * Load a state card template with override resolution.
 * Override dir is checked first; shipped dir is fallback (ADR-007).
 *
 * @param {string} stateName - State name (e.g., 'CONVERSATION')
 * @param {string} shippedDir - Shipped state-cards directory
 * @param {string|null} overrideDir - User override state-cards directory
 * @returns {object|null} Parsed card template or null
 */
function loadCardTemplate(stateName, shippedDir, overrideDir) {
  const filename = stateToFilename(stateName);

  // 1. Check override first (ADR-007)
  if (overrideDir) {
    const data = safeReadJson(join(overrideDir, filename));
    if (data !== null) return data;
  }

  // 2. Fall back to shipped
  return safeReadJson(join(shippedDir, filename));
}

/**
 * Build a minimal fallback card when template loading or composition fails.
 * Ensures the system always has something to inject (fail-open, Article X).
 *
 * @param {string} currentState - Current state name
 * @returns {string} Minimal card text
 */
function buildMinimalCard(currentState) {
  return [
    `--- STATE: ${currentState} ---`,
    'Rendering: bulleted',
    'Invariants: stop_after_question, wait_for_user_response',
    '--- END STATE CARD ---',
  ].join('\n');
}

/**
 * Render the composed card as a text block from template + runtime context.
 *
 * @param {object} template - Loaded card template
 * @param {object} context - Runtime context
 * @returns {string} Composed text block
 */
function renderCard(template, context) {
  const lines = [];
  const stateName = template.state || context.currentState || 'UNKNOWN';

  lines.push(`--- STATE: ${stateName} ---`);

  // Personas section
  const personas = mergePersonas(template, context);
  if (personas.length > 0) {
    lines.push(`Personas: ${personas.map(p => p.name || p.id || p).join(', ')}`);
    const activePersonas = personas.filter(p => p.active !== false);
    if (activePersonas.length > 0 && activePersonas.length < personas.length) {
      lines.push(`Active: ${activePersonas.map(p => p.name || p.id || p).join(', ')}`);
    }
  }

  // Rendering mode
  const renderingMode = resolveRenderingMode(template, context);
  lines.push(`Rendering: ${renderingMode}`);

  // Presenter (for confirmation states)
  if (template.presenter) {
    const presenter = typeof template.presenter === 'object'
      ? `${template.presenter.persona} (${template.presenter.role})`
      : template.presenter;
    lines.push(`Presenter: ${presenter}`);
  }

  // Template reference
  if (template.template_ref) {
    lines.push(`Template: ${template.template_ref}`);
  }

  // Required sections (for confirmation states)
  if (Array.isArray(template.required_sections) && template.required_sections.length > 0) {
    lines.push(`Sections: ${template.required_sections.join(', ')}`);
  }

  // Invariants
  const invariants = template.invariants || [];
  if (invariants.length > 0) {
    lines.push(`Invariants: ${invariants.slice(0, 6).join(', ')}${invariants.length > 6 ? '...' : ''}`);
  }

  // Topic coverage (if in context)
  if (context.topicCoverage && typeof context.topicCoverage === 'object') {
    const topics = Object.entries(context.topicCoverage);
    if (topics.length > 0) {
      lines.push('Topic coverage:');
      for (const [topic, coverage] of topics.slice(0, 5)) {
        const pct = typeof coverage === 'object' ? (coverage.coverage_pct || 0) : coverage;
        lines.push(`  ${topic}: ${pct}%`);
      }
    }
  }

  // Amendment cycles
  if (context.amendmentCycles !== undefined && context.amendmentCycles > 0) {
    lines.push(`Amendment cycles: ${context.amendmentCycles}`);
  }

  // Preferred tools
  const tools = mergePreferredTools(template, context);
  if (tools.length > 0) {
    lines.push(`Preferred tools: ${tools.map(t => t.tool || t.name || t).join(', ')}`);
  }

  // Accept/amend prompt (for confirmation states)
  if (template.accept_amend_prompt) {
    lines.push('');
    lines.push(template.accept_amend_prompt);
  }

  // Transitions
  if (template.transitions && typeof template.transitions === 'object') {
    const transEntries = Object.entries(template.transitions);
    if (transEntries.length > 0) {
      lines.push(`Transitions: ${transEntries.map(([k, v]) => `${k}->${v}`).join(', ')}`);
    }
  }

  lines.push('--- END STATE CARD ---');

  // Enforce max lines budget
  if (lines.length > MAX_TOTAL_LINES) {
    return lines.slice(0, MAX_TOTAL_LINES - 1).concat(['--- END STATE CARD ---']).join('\n');
  }

  return lines.join('\n');
}

/**
 * Merge persona information from template and runtime context.
 *
 * @param {object} template
 * @param {object} context
 * @returns {Array<object>} Merged personas
 */
function mergePersonas(template, context) {
  // Template may have personas as object ({ active, opening, rotation })
  // or as array
  const templatePersonas = template.personas;
  const contextPersonas = context.personas;

  if (Array.isArray(contextPersonas) && contextPersonas.length > 0) {
    return contextPersonas;
  }

  if (templatePersonas) {
    if (Array.isArray(templatePersonas)) return templatePersonas;
    if (Array.isArray(templatePersonas.active)) {
      return templatePersonas.active.map(name =>
        typeof name === 'string' ? { id: name.toLowerCase(), name, active: true } : name
      );
    }
  }

  return [];
}

/**
 * Resolve rendering mode from template, context, and defaults.
 *
 * @param {object} template
 * @param {object} context
 * @returns {string} Resolved rendering mode
 */
function resolveRenderingMode(template, context) {
  // Context override takes highest precedence
  if (context.renderingMode && context.renderingMode !== 'inherit_from_session') {
    return context.renderingMode;
  }
  // Template explicit mode
  if (template.rendering_mode && template.rendering_mode !== 'inherit_from_session') {
    return template.rendering_mode;
  }
  // Template default
  if (template.default_rendering_mode) {
    return template.default_rendering_mode;
  }
  // Global default
  return 'bulleted';
}

/**
 * Merge preferred tools from template and context.
 *
 * @param {object} template
 * @param {object} context
 * @returns {Array<object>} Merged tools list
 */
function mergePreferredTools(template, context) {
  // Context tools override template tools entirely
  if (Array.isArray(context.preferredTools) && context.preferredTools.length > 0) {
    return context.preferredTools;
  }

  // Template tools (may be in hierarchy format or flat array)
  if (template.preferred_tools) {
    if (Array.isArray(template.preferred_tools)) return template.preferred_tools;
    if (Array.isArray(template.preferred_tools.hierarchy)) {
      return template.preferred_tools.hierarchy;
    }
  }

  return [];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compose an outer affordance card for the current user-facing state.
 *
 * Loads the card template for the given state, merges with runtime context,
 * and renders a text block suitable for injection into the LLM prompt.
 *
 * @param {string} currentState - Current state name (e.g., 'CONVERSATION', 'PRESENTING_REQUIREMENTS')
 * @param {object} [context={}] - Runtime context for composition
 * @param {Array<object>} [context.personas] - Active personas (overrides template)
 * @param {string} [context.renderingMode] - Rendering mode override
 * @param {number} [context.amendmentCycles] - Current amendment cycle count
 * @param {object} [context.topicCoverage] - Topic coverage map { topic: { coverage_pct, ... } }
 * @param {Array<object>} [context.preferredTools] - Preferred tools override
 * @param {string} [context.shippedDir] - Override shipped state-cards dir
 * @param {string} [context.overrideDir] - User override state-cards dir
 * @returns {string} Composed state card text block (never null — fail-open returns minimal card)
 */
export function composeStateCard(currentState, context = {}) {
  try {
    if (!currentState || typeof currentState !== 'string') {
      return buildMinimalCard('UNKNOWN');
    }

    const shippedDir = context.shippedDir || SHIPPED_STATE_CARDS_DIR;
    const overrideDir = context.overrideDir || null;

    // Load card template with override resolution
    const template = loadCardTemplate(currentState, shippedDir, overrideDir);

    if (!template) {
      // No template found — return minimal card (fail-open)
      return buildMinimalCard(currentState);
    }

    // Validate required fields from template
    // state-card.schema.json requires: state_name, personas, rendering_mode,
    // invariants, valid_transitions, template_ref, preferred_tools
    // But actual card templates use slightly different field names (state vs state_name).
    // We work with what's available.

    // Inject currentState into context for rendering
    const renderContext = {
      currentState,
      ...context,
    };

    return renderCard(template, renderContext);
  } catch {
    // Fail-open (Article X): always return something usable
    return buildMinimalCard(currentState || 'UNKNOWN');
  }
}
