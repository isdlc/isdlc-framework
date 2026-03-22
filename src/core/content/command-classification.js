/**
 * Command Content Classification — classifies 4 command files
 *
 * isdlc.md has detailed per-section classification. Other commands
 * (provider, discover, tour) have 2 sections each. Pure data, no runtime logic.
 *
 * Requirements: REQ-0101 FR-001 (AC-001-01..02), FR-002 (AC-002-01..06), FR-003 (AC-003-01..03)
 * @module src/core/content/command-classification
 */

import { createSectionEntry } from './content-model.js';

// ---------------------------------------------------------------------------
// isdlc.md — 8 sections (the largest command file ~4000 lines)
// ---------------------------------------------------------------------------

const ISDLC_SECTIONS = Object.freeze([
  createSectionEntry('action_definitions', 'role_spec', 'full'),            // AC-002-01
  createSectionEntry('build_handler_workflow', 'role_spec', 'full'),        // AC-002-02
  createSectionEntry('analyze_handler_roundtable', 'mixed', 'partial'),     // AC-002-03
  createSectionEntry('phase_loop_controller', 'runtime_packaging', 'none'), // AC-002-04
  createSectionEntry('skill_injection_steps', 'runtime_packaging', 'none'), // AC-002-04
  createSectionEntry('interactive_relay_protocol', 'runtime_packaging', 'none'), // AC-002-05
  createSectionEntry('add_handler', 'role_spec', 'full'),                   // AC-002-06
  createSectionEntry('trivial_tier_execution', 'mixed', 'partial')
]);

// ---------------------------------------------------------------------------
// provider.md — 2 sections
// ---------------------------------------------------------------------------

const PROVIDER_SECTIONS = Object.freeze([
  createSectionEntry('provider_semantics', 'role_spec', 'full'),      // AC-003-01
  createSectionEntry('claude_settings_ui', 'runtime_packaging', 'none')
]);

// ---------------------------------------------------------------------------
// discover.md — 2 sections
// ---------------------------------------------------------------------------

const DISCOVER_SECTIONS = Object.freeze([
  createSectionEntry('discovery_workflow', 'role_spec', 'full'),      // AC-003-02
  createSectionEntry('agent_delegation', 'runtime_packaging', 'none')
]);

// ---------------------------------------------------------------------------
// tour.md — 2 sections
// ---------------------------------------------------------------------------

const TOUR_SECTIONS = Object.freeze([
  createSectionEntry('tour_content', 'role_spec', 'full'),            // AC-003-03
  createSectionEntry('interactive_presentation', 'runtime_packaging', 'none')
]);

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const _map = new Map([
  ['isdlc', ISDLC_SECTIONS],
  ['provider', PROVIDER_SECTIONS],
  ['discover', DISCOVER_SECTIONS],
  ['tour', TOUR_SECTIONS]
]);

/**
 * Get the section classification for a named command.
 *
 * @param {string} name - Command name (e.g. 'isdlc', 'provider')
 * @returns {ReadonlyArray<{name: string, type: string, portability: string}>}
 * @throws {Error} If command name is not classified
 */
export function getCommandClassification(name) {
  const sections = _map.get(name);
  if (!sections) {
    const available = [..._map.keys()].join(', ');
    throw new Error(`Unknown command: "${name}". Available: ${available}`);
  }
  return sections;
}

/**
 * List all classified command names.
 *
 * @returns {string[]}
 */
export function listClassifiedCommands() {
  return [..._map.keys()];
}
