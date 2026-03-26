/**
 * Roundtable Confirmation State Machine — states, events, transitions, tiers
 *
 * Frozen FSM definition extracted from the roundtable analyst's sequential
 * confirmation flow. Pure data — no runtime state tracking.
 *
 * Requirements: REQ-0109 FR-001 (AC-001-01..02), FR-002 (AC-002-01..03),
 *               FR-003 (AC-003-01..03), FR-004 (AC-004-01..03)
 * @module src/core/analyze/state-machine
 */

// ---------------------------------------------------------------------------
// FR-001: FSM Definition (AC-001-01..02)
// ---------------------------------------------------------------------------

const STATES = Object.freeze({
  IDLE:                      'IDLE',
  PRESENTING_REQUIREMENTS:   'PRESENTING_REQUIREMENTS',
  PRESENTING_ARCHITECTURE:   'PRESENTING_ARCHITECTURE',
  PRESENTING_DESIGN:         'PRESENTING_DESIGN',
  PRESENTING_TASKS:          'PRESENTING_TASKS',
  AMENDING:                  'AMENDING',
  FINALIZING:                'FINALIZING',
  COMPLETE:                  'COMPLETE'
});

const EVENTS = Object.freeze({
  ACCEPT:            'accept',
  AMEND:             'amend',
  FINALIZE_COMPLETE: 'finalize_complete'
});

// ---------------------------------------------------------------------------
// FR-002: Transition Table (AC-002-01..03)
// ---------------------------------------------------------------------------

const transitionTable = Object.freeze({
  'IDLE:accept':                          'PRESENTING_REQUIREMENTS',
  'PRESENTING_REQUIREMENTS:accept':       'PRESENTING_ARCHITECTURE',
  'PRESENTING_REQUIREMENTS:amend':        'AMENDING',
  'PRESENTING_ARCHITECTURE:accept':       'PRESENTING_DESIGN',
  'PRESENTING_ARCHITECTURE:amend':        'AMENDING',
  'PRESENTING_DESIGN:accept':             'PRESENTING_TASKS',
  'PRESENTING_DESIGN:amend':              'AMENDING',
  'PRESENTING_TASKS:accept':              'FINALIZING',
  'PRESENTING_TASKS:amend':               'AMENDING',
  'AMENDING:accept':                      null,  // resolved at runtime — depends on which domain triggered amendment
  'FINALIZING:finalize_complete':         'COMPLETE'
});

// ---------------------------------------------------------------------------
// FR-003: Tier-Dependent Paths (AC-003-01..03)
// ---------------------------------------------------------------------------

const tierPaths = Object.freeze({
  standard: Object.freeze(['PRESENTING_REQUIREMENTS', 'PRESENTING_ARCHITECTURE', 'PRESENTING_DESIGN', 'PRESENTING_TASKS']),
  light:    Object.freeze(['PRESENTING_REQUIREMENTS', 'PRESENTING_DESIGN', 'PRESENTING_TASKS']),
  trivial:  Object.freeze(['FINALIZING'])
});

// ---------------------------------------------------------------------------
// FR-004: Registry Functions (AC-004-01..03)
// ---------------------------------------------------------------------------

/**
 * Get the full FSM definition.
 * @returns {Readonly<{STATES: Object, EVENTS: Object, transitionTable: Object}>}
 */
export function getStateMachine() {
  return Object.freeze({ STATES, EVENTS, transitionTable });
}

/**
 * Look up the next state for a (state, event) pair.
 * @param {string} state - Current state
 * @param {string} event - Event name
 * @returns {string|null} Next state, or null if transition is invalid/runtime-resolved
 */
export function getTransition(state, event) {
  const key = state + ':' + event;
  return key in transitionTable ? transitionTable[key] : null;
}

/**
 * Get the ordered domain sequence for a given tier.
 * @param {string} tier - 'standard', 'light', or 'trivial'
 * @returns {Readonly<string[]>|null} Domain sequence, or null if unknown tier
 */
export function getTierPath(tier) {
  return tierPaths[tier] || null;
}
