/**
 * Observability Module -- Core Telemetry Service
 *
 * REQ-0092: Extract observability hooks to core
 * Per ADR-CODEX-006: Core in ESM.
 *
 * Provides:
 * - logEvent(category, event, details) -- generic event logging
 * - trackMenuInteraction(details) -- menu interaction tracking
 * - trackWalkthrough(details) -- walkthrough state tracking
 * - checkReviewReminder(state) -- review reminder logic
 * - validateSkillUsage(input, state, manifest) -- skill validation logic
 * - logSkillUsage(input, state, manifest) -- skill usage logging
 * - detectMenuHaltViolation(text) -- menu halt detection
 * - detectPermissionAsking(text) -- permission pattern detection
 * - checkDiscoverMenu(input) -- discover menu validation
 * - checkAtddCompleteness(input, state) -- ATDD priority checking
 *
 * @module src/core/observability
 */

/**
 * Generic event logger.
 * @param {string} category - Event category (e.g., 'hook', 'workflow', 'skill')
 * @param {string} event - Event name (e.g., 'block', 'allow', 'warn')
 * @param {object} details - Event details
 * @returns {{ logged: boolean, entry: object }}
 */
export function logEvent(category, event, details = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    category,
    event,
    ...details
  };
  return { logged: true, entry };
}

/**
 * Track a menu interaction for Phase 01 requirements elicitation.
 * Pure logic -- takes current elicitation state, returns updated state.
 *
 * @param {object} activity - { menu_presented, selection, step_completed }
 * @param {object} elicitState - Current elicitation state from state.json
 * @returns {{ elicitState: object, outputMessage: string }}
 */
export function trackMenuInteraction(activity, elicitState) {
  if (!activity) return { elicitState, outputMessage: '' };

  const updated = { ...elicitState };
  let outputMessage = '';
  const now = new Date().toISOString();

  if (activity.menu_presented) {
    updated.menu_interactions = (updated.menu_interactions || 0) + 1;
    updated.last_menu_at = now;
  }

  if (activity.selection) {
    updated.selections = updated.selections || [];
    updated.selections.push({ selection: activity.selection, timestamp: now });
    updated.last_selection = activity.selection;
    updated.last_selection_at = now;

    if (activity.selection === 'save') {
      updated.completed = true;
      updated.final_selection = 'save';
      updated.completed_at = now;
      outputMessage = 'INTERACTIVE ELICITATION COMPLETED: Final selection SAVE';
    } else if (activity.selection === 'exit') {
      updated.completed = true;
      updated.final_selection = 'exit';
      updated.completed_at = now;
      outputMessage = 'INTERACTIVE ELICITATION EXITED';
    } else if (activity.selection === 'continue') {
      outputMessage = `Proceeding to next step (${updated.menu_interactions} interactions so far)`;
    }
  }

  if (activity.step_completed) {
    updated.steps_completed = updated.steps_completed || [];
    if (!updated.steps_completed.includes(activity.step_completed.name)) {
      updated.steps_completed.push(activity.step_completed.name);
      updated.last_step_completed = activity.step_completed;
      updated.last_step_at = now;
    }
  }

  return { elicitState: updated, outputMessage };
}

/**
 * Check walkthrough completion state.
 * @param {object} state - Parsed state.json
 * @returns {{ shouldWarn: boolean, message: string }}
 */
export function trackWalkthrough(state) {
  if (!state || !state.discovery_context) {
    return { shouldWarn: false, message: '' };
  }

  if (state.discovery_context.walkthrough_completed === true) {
    return { shouldWarn: false, message: '' };
  }

  return {
    shouldWarn: true,
    message: 'Discovery completed without constitution walkthrough.'
  };
}

/**
 * Check if a review reminder should be shown.
 * @param {object} state - Parsed state.json
 * @returns {{ shouldRemind: boolean, message: string }}
 */
export function checkReviewReminder(state) {
  if (!state || !state.code_review) {
    return { shouldRemind: false, message: '' };
  }

  const enabled = state.code_review.enabled === true;
  const teamSize = typeof state.code_review.team_size === 'number'
    ? state.code_review.team_size : 1;

  if (!enabled && teamSize > 1) {
    return {
      shouldRemind: true,
      message: 'Manual code review is currently bypassed. ' +
        'If your team has grown beyond 1 developer, consider enabling it.'
    };
  }

  return { shouldRemind: false, message: '' };
}

/**
 * Permission-asking patterns that indicate an agent is not auto-advancing.
 */
const PERMISSION_PATTERNS = [
  /would you like to proceed/i,
  /ready to advance/i,
  /should I continue/i,
  /shall we proceed/i,
  /do you want me to move forward/i,
  /want me to go ahead/i
];

/**
 * Detect permission-asking patterns in text.
 * @param {string} text - Text to scan
 * @returns {{ found: boolean, pattern: string }}
 */
export function detectPermissionAsking(text) {
  if (!text || typeof text !== 'string') {
    return { found: false, pattern: '' };
  }
  for (const regex of PERMISSION_PATTERNS) {
    const match = text.match(regex);
    if (match) {
      return { found: true, pattern: match[0] };
    }
  }
  return { found: false, pattern: '' };
}

/**
 * Menu halt detection patterns.
 */
const POST_MENU_THRESHOLD = 200;

const MENU_PATTERNS = [
  {
    name: 'arc-menu',
    test: (text) => /\[A\]/.test(text) && /\[R\]/.test(text) && /\[C\]/.test(text),
    endMarker: /\[C\]\s*(?:Continue|Confirm|Complete)[^\n]*/gi
  },
  {
    name: 'numbered-menu',
    test: (text) => /\[\d+\]/.test(text) && /enter\s+selection/i.test(text),
    endMarker: /enter\s+selection[^\n]*/gi
  },
  {
    name: 'backlog-picker',
    test: (text) => /\[O\]\s*Other/i.test(text) && /\[\d+\]/.test(text),
    endMarker: /\[O\]\s*Other[^\n]*/gi
  }
];

/**
 * Detect menu halt violations.
 * @param {string} text - Task output text
 * @returns {{ violation: boolean, menuType: string, extraChars: number }}
 */
export function detectMenuHaltViolation(text) {
  if (!text || typeof text !== 'string') {
    return { violation: false, menuType: '', extraChars: 0 };
  }

  for (const pattern of MENU_PATTERNS) {
    if (!pattern.test(text)) continue;

    let lastIndex = -1;
    let match;
    const regex = new RegExp(pattern.endMarker.source, pattern.endMarker.flags);
    while ((match = regex.exec(text)) !== null) {
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex === -1) {
      const fallbacks = [/\[C\][^\n]*/g, /enter\s+selection[^\n]*/gi, /\[O\]\s*Other[^\n]*/gi];
      for (const fb of fallbacks) {
        let m;
        while ((m = fb.exec(text)) !== null) {
          const idx = m.index + m[0].length;
          if (idx > lastIndex) lastIndex = idx;
        }
      }
    }

    if (lastIndex > 0) {
      const after = text.substring(lastIndex).trim();
      if (after.length > POST_MENU_THRESHOLD) {
        return { violation: true, menuType: pattern.name, extraChars: after.length };
      }
    }
  }

  return { violation: false, menuType: '', extraChars: 0 };
}

/**
 * Extract ATDD priority results from test output.
 * @param {string} output - Test output text
 * @returns {object} Priority results
 */
export function extractPriorityResults(output) {
  const results = {
    p0Pass: 0, p0Fail: 0, p0Skip: 0,
    p1Pass: 0, p1Fail: 0, p1Skip: 0,
    p2Pass: 0, p2Fail: 0, p2Skip: 0,
    p3Pass: 0, p3Fail: 0, p3Skip: 0
  };

  if (!output) return results;

  const lines = output.split('\n');
  for (const line of lines) {
    for (const level of ['P0', 'P1', 'P2', 'P3']) {
      const key = level.toLowerCase();
      if (line.includes(level) || line.includes(level.toLowerCase())) {
        if (/\bpass/i.test(line) || /\u2713/.test(line) || /ok\b/i.test(line)) {
          results[key + 'Pass']++;
        } else if (/\bfail/i.test(line) || /\u2717/.test(line) || /not ok\b/i.test(line)) {
          results[key + 'Fail']++;
        } else if (/\bskip/i.test(line) || /\btodo\b/i.test(line) || /test\.skip/i.test(line)) {
          results[key + 'Skip']++;
        }
      }
    }
  }

  return results;
}

/**
 * Check for ATDD priority ordering violations.
 * @param {object} results - Priority results
 * @returns {string[]} List of violations
 */
export function checkPriorityViolations(results) {
  const violations = [];

  const p1Total = results.p1Pass + results.p1Fail + results.p1Skip;
  if (p1Total > 0 && results.p0Fail > 0) {
    violations.push(
      `P1 tests running while ${results.p0Fail} P0 test(s) are still failing.`
    );
  }

  const p0Total = results.p0Pass + results.p0Fail + results.p0Skip;
  if (results.p0Skip > 0 && p0Total > 0) {
    violations.push(`${results.p0Skip} P0 test(s) still skipped.`);
  }

  const p2Total = results.p2Pass + results.p2Fail + results.p2Skip;
  if (p2Total > 0 && results.p1Fail > 0) {
    violations.push(
      `P2 tests running while ${results.p1Fail} P1 test(s) are still failing.`
    );
  }

  return violations;
}
