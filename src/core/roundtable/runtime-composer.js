/**
 * Runtime Composer for Roundtable Protocol (REQ-GH-235 FR-005)
 *
 * Composes the effective roundtable state machine from (a) default protocol
 * defined in roundtable-analyst.md and (b) persona extension declarations
 * from persona-*.md frontmatter at analyze-dispatch time.
 *
 * Public API:
 *   - composeEffectiveStateMachine(defaultStateMachine, personaFiles)
 *   - validatePromotionFrontmatter(frontmatter)
 *   - detectInsertionConflicts(personaFiles)
 *
 * Traces to:
 *   - FR-005 AC-005-04: Runtime composes effective protocol at dispatch time
 *   - FR-005 AC-005-05: Conflict resolution — first-declared wins + warn
 *
 * Error handling (fail-open per Article X): NEVER throws. Invalid input
 * degrades gracefully by emitting warnings and skipping affected personas.
 *
 * Pure function — no I/O, no filesystem access, no mutation of inputs.
 *
 * Article XIII: ESM (import/export, .js extension).
 */

// Known extension-point taxonomy: maps short names to default state names.
const EXTENSION_POINT_MAP = Object.freeze({
  requirements: 'PRESENTING_REQUIREMENTS',
  architecture: 'PRESENTING_ARCHITECTURE',
  design: 'PRESENTING_DESIGN',
  tasks: 'PRESENTING_TASKS'
});

const INSERTS_AT_REGEX = /^(before|after):(requirements|architecture|design|tasks)$/;
const INSERTS_AT_SHAPE_REGEX = /^(before|after):([a-z_]+)$/;
const OWNS_STATE_REGEX = /^[a-z_]+$/;
const TEMPLATE_SUFFIX = '.template.json';
const VALID_RENDERING_CONTRIBUTIONS = Object.freeze(['ownership', 'rendering-only']);

/**
 * Validate that promoted persona frontmatter has required fields and formats.
 *
 * Rules:
 *   - role_type === "primary" requires: owns_state, template, inserts_at
 *   - owns_state must be non-empty string matching /^[a-z_]+$/
 *   - template must end with ".template.json"
 *   - inserts_at must match /^(before|after):(requirements|architecture|design|tasks)$/
 *   - rendering_contribution (optional) must be "ownership" or "rendering-only"
 *   - contributing personas pass without promotion fields
 *
 * @param {object} frontmatter
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validatePromotionFrontmatter(frontmatter) {
  const errors = [];

  // Fail-open: null/undefined/non-object frontmatter
  if (!frontmatter || typeof frontmatter !== 'object') {
    return { valid: false, errors: ['frontmatter missing or not an object'] };
  }

  // Contributing personas do not require promotion fields.
  if (frontmatter.role_type !== 'primary') {
    return { valid: true, errors: [] };
  }

  // Required promotion fields
  if (!frontmatter.owns_state || typeof frontmatter.owns_state !== 'string') {
    errors.push('missing required field: owns_state');
  } else if (!OWNS_STATE_REGEX.test(frontmatter.owns_state)) {
    errors.push(`invalid owns_state format: "${frontmatter.owns_state}" (must match /^[a-z_]+$/)`);
  }

  if (!frontmatter.template || typeof frontmatter.template !== 'string') {
    errors.push('missing required field: template');
  } else if (!frontmatter.template.endsWith(TEMPLATE_SUFFIX)) {
    errors.push(`invalid template: "${frontmatter.template}" (must end with ${TEMPLATE_SUFFIX})`);
  }

  if (!frontmatter.inserts_at || typeof frontmatter.inserts_at !== 'string') {
    errors.push('missing required field: inserts_at');
  } else if (!INSERTS_AT_REGEX.test(frontmatter.inserts_at)) {
    errors.push(`invalid inserts_at format: "${frontmatter.inserts_at}" (must match (before|after):(requirements|architecture|design|tasks))`);
  }

  // Optional rendering_contribution
  if (frontmatter.rendering_contribution !== undefined) {
    if (!VALID_RENDERING_CONTRIBUTIONS.includes(frontmatter.rendering_contribution)) {
      errors.push(`invalid rendering_contribution: "${frontmatter.rendering_contribution}" (must be "ownership" or "rendering-only")`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Detect personas targeting the same insertion point. First-declared wins.
 *
 * Only considers personas where role_type === "primary" AND inserts_at is a
 * non-empty string. Does not validate; pure grouping by insertion point.
 *
 * @param {PersonaFile[]} personaFiles
 * @returns {Conflict[]}
 */
export function detectInsertionConflicts(personaFiles) {
  if (!Array.isArray(personaFiles)) {
    return [];
  }

  const byPoint = new Map();
  for (const persona of personaFiles) {
    if (!persona || typeof persona !== 'object') continue;
    const fm = persona.frontmatter;
    if (!fm || typeof fm !== 'object') continue;
    if (fm.role_type !== 'primary') continue;
    if (!fm.inserts_at || typeof fm.inserts_at !== 'string') continue;

    const point = fm.inserts_at;
    if (!byPoint.has(point)) {
      byPoint.set(point, []);
    }
    byPoint.get(point).push(fm.name);
  }

  const conflicts = [];
  for (const [insertion_point, personas] of byPoint.entries()) {
    if (personas.length > 1) {
      conflicts.push({
        insertion_point,
        personas: personas.slice(),
        resolution: 'first-wins',
        chosen: personas[0]
      });
    }
  }

  return conflicts;
}

/**
 * Compose the effective state machine from defaults plus persona declarations.
 *
 * Algorithm:
 *   1. Start with a deep copy of defaultStateMachine (ordered state list)
 *   2. For each persona where frontmatter.role_type === "primary":
 *      a. Validate required promotion fields
 *      b. If invalid: record warning, skip
 *   3. Detect insertion conflicts; record warnings for losers (first-wins)
 *   4. For each valid, conflict-winning primary persona:
 *      a. Parse inserts_at as { before|after, state_name }
 *      b. Verify extension point maps to a known default state
 *      c. Insert new state at declared position
 *      d. Bind declared template to the new state
 *   5. Return { effectiveStateMachine, conflicts, warnings }
 *
 * Pure function: never mutates inputs, never throws.
 *
 * @param {StateMachine} defaultStateMachine - { states: State[], transitions?: Transition[] }
 * @param {PersonaFile[]} personaFiles - loaded persona files with frontmatter
 * @returns {{effectiveStateMachine: StateMachine, conflicts: Conflict[], warnings: Warning[]}}
 */
export function composeEffectiveStateMachine(defaultStateMachine, personaFiles) {
  const warnings = [];

  // Defensive: deep-clone default state machine to guarantee no input mutation.
  const effectiveStateMachine = cloneStateMachine(defaultStateMachine);

  // Fail-open on bad personaFiles input
  const personas = Array.isArray(personaFiles) ? personaFiles : [];

  // Collect valid primary personas (preserving order) and record invalid ones.
  const validPrimaries = [];
  for (const persona of personas) {
    if (!persona || typeof persona !== 'object') continue;
    const fm = persona.frontmatter;
    if (!fm || typeof fm !== 'object') continue;
    if (fm.role_type !== 'primary') continue; // contributing → folds into existing states

    // Stage 1: Check required field presence and basic shape (non-inserts_at fields).
    const basicErrors = validateBasicPromotionFields(fm);
    if (basicErrors.length > 0) {
      warnings.push({
        persona: fm.name || persona.path || '<unknown>',
        reason: basicErrors.join('; ')
      });
      continue;
    }

    // Stage 2: Check inserts_at shape. If it doesn't match `(before|after):<token>`
    // treat it as a malformed inserts_at.
    const shapeMatch = typeof fm.inserts_at === 'string' ? fm.inserts_at.match(INSERTS_AT_SHAPE_REGEX) : null;
    if (!shapeMatch) {
      warnings.push({
        persona: fm.name || '<unknown>',
        reason: `invalid inserts_at format: "${fm.inserts_at}"`
      });
      continue;
    }

    // Stage 3: Check the stateKey portion maps to a known extension point.
    const stateKey = shapeMatch[2];
    if (!Object.prototype.hasOwnProperty.call(EXTENSION_POINT_MAP, stateKey)) {
      warnings.push({
        persona: fm.name || '<unknown>',
        reason: `unknown extension point: "${fm.inserts_at}"`
      });
      continue;
    }

    const parsed = { direction: shapeMatch[1], stateKey };
    const targetStateName = EXTENSION_POINT_MAP[stateKey];
    const targetIndex = effectiveStateMachine.states.findIndex(s => s && s.name === targetStateName);
    if (targetIndex === -1) {
      warnings.push({
        persona: fm.name || '<unknown>',
        reason: `unknown extension point: "${fm.inserts_at}" (target state "${targetStateName}" not in default machine)`
      });
      continue;
    }

    validPrimaries.push({ persona, frontmatter: fm, parsed, targetStateName });
  }

  // Detect insertion conflicts across valid primaries; first-declared wins.
  const conflictMap = new Map();
  for (const entry of validPrimaries) {
    const point = entry.frontmatter.inserts_at;
    if (!conflictMap.has(point)) {
      conflictMap.set(point, []);
    }
    conflictMap.get(point).push(entry);
  }

  const conflicts = [];
  const winners = [];
  for (const [insertion_point, entries] of conflictMap.entries()) {
    if (entries.length > 1) {
      const personaNames = entries.map(e => e.frontmatter.name);
      conflicts.push({
        insertion_point,
        personas: personaNames.slice(),
        resolution: 'first-wins',
        chosen: personaNames[0]
      });
      // Record warnings for losers
      for (let i = 1; i < entries.length; i++) {
        warnings.push({
          persona: entries[i].frontmatter.name,
          reason: `insertion conflict at "${insertion_point}": first-wins, chosen="${personaNames[0]}"`
        });
      }
    }
    winners.push(entries[0]);
  }

  // Preserve original declaration order among winners (conflictMap was keyed by
  // inserts_at; iteration order of Map is insertion order, which mirrors the
  // order winners were first seen in validPrimaries).
  //
  // Insert new states. To keep relative order stable when multiple distinct
  // insertion points are applied, we rebuild the states array by walking the
  // current list and injecting new states at their declared positions.
  for (const winner of winners) {
    const { frontmatter, parsed, targetStateName } = winner;
    const currentIndex = effectiveStateMachine.states.findIndex(s => s && s.name === targetStateName);
    if (currentIndex === -1) {
      // Target vanished (shouldn't happen; defensive)
      warnings.push({
        persona: frontmatter.name,
        reason: `unknown extension point during insertion: target "${targetStateName}" missing`
      });
      continue;
    }

    const newState = buildStateFromPersona(frontmatter);
    const insertAt = parsed.direction === 'before' ? currentIndex : currentIndex + 1;
    effectiveStateMachine.states.splice(insertAt, 0, newState);
  }

  return { effectiveStateMachine, conflicts, warnings };
}

// ----------------------------------------------------------------------------
// Internal helpers (not exported)
// ----------------------------------------------------------------------------

/**
 * Deep-clone a state machine structure without structuredClone dependency.
 * Handles frozen inputs from tests.
 */
function cloneStateMachine(sm) {
  if (!sm || typeof sm !== 'object') {
    return { states: [], transitions: [] };
  }
  const states = Array.isArray(sm.states)
    ? sm.states.map(s => cloneState(s)).filter(Boolean)
    : [];
  const transitions = Array.isArray(sm.transitions)
    ? sm.transitions.map(t => (t && typeof t === 'object' ? { ...t } : t))
    : [];
  return { states, transitions };
}

function cloneState(state) {
  if (!state || typeof state !== 'object') return null;
  return {
    name: state.name,
    presenter: state.presenter,
    template: state.template,
    sections: Array.isArray(state.sections) ? state.sections.slice() : [],
    allowed_responses: Array.isArray(state.allowed_responses) ? state.allowed_responses.slice() : []
  };
}

/**
 * Validate basic promotion fields (owns_state, template, rendering_contribution)
 * plus the presence of inserts_at — but not inserts_at shape/semantics.
 * The composer uses this to separate "missing required field" warnings from
 * "invalid inserts_at format" and "unknown extension point" warnings.
 *
 * @param {object} fm
 * @returns {string[]} list of error messages (empty = basic fields OK)
 */
function validateBasicPromotionFields(fm) {
  const errors = [];

  if (!fm.owns_state || typeof fm.owns_state !== 'string') {
    errors.push('missing required field: owns_state');
  } else if (!OWNS_STATE_REGEX.test(fm.owns_state)) {
    errors.push(`invalid owns_state format: "${fm.owns_state}" (must match /^[a-z_]+$/)`);
  }

  if (!fm.template || typeof fm.template !== 'string') {
    errors.push('missing required field: template');
  } else if (!fm.template.endsWith(TEMPLATE_SUFFIX)) {
    errors.push(`invalid template: "${fm.template}" (must end with ${TEMPLATE_SUFFIX})`);
  }

  if (!fm.inserts_at || typeof fm.inserts_at !== 'string') {
    errors.push('missing required field: inserts_at');
  }

  if (fm.rendering_contribution !== undefined) {
    if (!VALID_RENDERING_CONTRIBUTIONS.includes(fm.rendering_contribution)) {
      errors.push(`invalid rendering_contribution: "${fm.rendering_contribution}" (must be "ownership" or "rendering-only")`);
    }
  }

  return errors;
}

/**
 * Build a State object from a validated promoted persona frontmatter.
 * Derives a PRESENTING_{OWNS_STATE} state name.
 */
function buildStateFromPersona(frontmatter) {
  return {
    name: `PRESENTING_${frontmatter.owns_state.toUpperCase()}`,
    presenter: frontmatter.name,
    template: frontmatter.template,
    sections: [],
    allowed_responses: ['Accept', 'Amend']
  };
}
