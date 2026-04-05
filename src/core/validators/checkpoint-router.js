/**
 * Checkpoint Router -- Dispatcher Routing Logic
 *
 * REQ-0093: Extract dispatcher routing to core
 * Per ADR-CODEX-006: Core in ESM.
 *
 * Computes which validators, guards, and observers should run
 * for a given hook event type and tool name.
 *
 * @module src/core/validators/checkpoint-router
 */

/**
 * Hook categories for classification.
 */
const HOOK_CATEGORIES = {
  VALIDATORS: 'validators',
  GUARDS: 'guards',
  OBSERVERS: 'observers'
};

/**
 * Pre-Task hook routing table.
 * Maps tool contexts to the hooks that should run.
 */
const PRE_TASK_HOOKS = [
  { name: 'iteration-corridor', category: HOOK_CATEGORIES.VALIDATORS, requiresWorkflow: true },
  { name: 'skill-validator', category: HOOK_CATEGORIES.OBSERVERS, requiresWorkflow: false },
  { name: 'phase-loop-controller', category: HOOK_CATEGORIES.GUARDS, requiresWorkflow: true },
  { name: 'plan-surfacer', category: HOOK_CATEGORIES.GUARDS, requiresWorkflow: true },
  { name: 'phase-sequence-guard', category: HOOK_CATEGORIES.GUARDS, requiresWorkflow: true },
  { name: 'gate-blocker', category: HOOK_CATEGORIES.VALIDATORS, requiresWorkflow: true },
  { name: 'constitution-validator', category: HOOK_CATEGORIES.VALIDATORS, requiresWorkflow: true },
  { name: 'test-adequacy-blocker', category: HOOK_CATEGORIES.VALIDATORS, requiresWorkflow: true, phaseFilter: 'upgrade' },
  { name: 'blast-radius-validator', category: HOOK_CATEGORIES.VALIDATORS, requiresWorkflow: true, workflowFilter: 'feature', phaseFilter: 'implementation' }
];

/**
 * Post-Task hook routing table.
 */
const POST_TASK_HOOKS = [
  { name: 'log-skill-usage', category: HOOK_CATEGORIES.OBSERVERS, requiresWorkflow: false },
  { name: 'menu-tracker', category: HOOK_CATEGORIES.OBSERVERS, requiresWorkflow: true },
  { name: 'walkthrough-tracker', category: HOOK_CATEGORIES.OBSERVERS, requiresWorkflow: true, workflowFilter: 'discover' },
  { name: 'discover-menu-guard', category: HOOK_CATEGORIES.OBSERVERS, requiresWorkflow: true, workflowFilter: 'discover' },
  { name: 'phase-transition-enforcer', category: HOOK_CATEGORIES.OBSERVERS, requiresWorkflow: true },
  { name: 'menu-halt-enforcer', category: HOOK_CATEGORIES.OBSERVERS, requiresWorkflow: true }
];

/**
 * Pre-Skill hook routing table.
 */
const PRE_SKILL_HOOKS = [
  { name: 'iteration-corridor', category: HOOK_CATEGORIES.VALIDATORS, requiresWorkflow: true },
  { name: 'gate-blocker', category: HOOK_CATEGORIES.VALIDATORS, requiresWorkflow: true },
  { name: 'constitutional-iteration-validator', category: HOOK_CATEGORIES.VALIDATORS, requiresWorkflow: true }
];

/**
 * Post-Bash hook routing table.
 *
 * REQ-GH-216 FR-007: atdd-completeness-validator gating switched from the
 * legacy `options.atdd_mode` state flag to config-driven `atddGating` (reads
 * `atdd.enabled` and `atdd.enforce_priority_order` from .isdlc/config.json
 * via the context.atdd injection).
 */
const POST_BASH_HOOKS = [
  { name: 'test-watcher', category: HOOK_CATEGORIES.OBSERVERS, requiresWorkflow: true },
  { name: 'review-reminder', category: HOOK_CATEGORIES.OBSERVERS, requiresWorkflow: true },
  { name: 'atdd-completeness-validator', category: HOOK_CATEGORIES.OBSERVERS, requiresWorkflow: true, atddGating: 'enforce_priority_order' }
];

/**
 * Post-Write/Edit hook routing table.
 */
const POST_WRITE_EDIT_HOOKS = [
  { name: 'state-write-validator', category: HOOK_CATEGORIES.VALIDATORS, requiresWorkflow: false },
  { name: 'output-format-validator', category: HOOK_CATEGORIES.OBSERVERS, requiresWorkflow: true, toolFilter: 'Write' },
  { name: 'workflow-completion-enforcer', category: HOOK_CATEGORIES.OBSERVERS, requiresWorkflow: false, noActiveWorkflow: true }
];

/**
 * Map of hook type to routing table.
 */
const ROUTING_TABLES = {
  'PreToolUse:Task': PRE_TASK_HOOKS,
  'PostToolUse:Task': POST_TASK_HOOKS,
  'PreToolUse:Skill': PRE_SKILL_HOOKS,
  'PostToolUse:Bash': POST_BASH_HOOKS,
  'PostToolUse:Write': POST_WRITE_EDIT_HOOKS,
  'PostToolUse:Edit': POST_WRITE_EDIT_HOOKS
};

/**
 * Route a checkpoint to determine which hooks should run.
 *
 * @param {string} hookType - 'PreToolUse' or 'PostToolUse'
 * @param {string} toolName - 'Task', 'Skill', 'Bash', 'Write', 'Edit'
 * @param {object} context - { hasActiveWorkflow, workflowType, currentPhase, options, atdd }
 *   - context.atdd: { enabled, require_gwt, track_red_green, enforce_priority_order }
 *     When omitted, routeCheckpoint assumes all-true defaults (fail-open per
 *     Article X). Callers that need strict gating must inject atdd explicitly.
 * @returns {{ validators: string[], guards: string[], observers: string[] }}
 */
export function routeCheckpoint(hookType, toolName, context = {}) {
  const key = `${hookType}:${toolName}`;
  const table = ROUTING_TABLES[key];

  if (!table) {
    return { validators: [], guards: [], observers: [] };
  }

  const result = { validators: [], guards: [], observers: [] };

  for (const hook of table) {
    // Check workflow requirement
    if (hook.requiresWorkflow && !context.hasActiveWorkflow) {
      continue;
    }

    // Check noActiveWorkflow (e.g., workflow-completion-enforcer only when no workflow)
    if (hook.noActiveWorkflow && context.hasActiveWorkflow) {
      continue;
    }

    // Check workflow type filter
    if (hook.workflowFilter && context.workflowType !== hook.workflowFilter) {
      continue;
    }

    // Check phase filter
    if (hook.phaseFilter) {
      const phase = context.currentPhase || '';
      if (hook.phaseFilter === 'upgrade' && !phase.startsWith('15-upgrade')) {
        continue;
      }
      if (hook.phaseFilter === 'implementation' && phase !== '06-implementation') {
        continue;
      }
    }

    // Check options filter (e.g., legacy atdd_mode — retained for back-compat)
    if (hook.optionsFilter && !(context.options && context.options[hook.optionsFilter])) {
      continue;
    }

    // REQ-GH-216 FR-007, AC-007-01/02: check atdd-config gating.
    // atddGating names a sub-knob (e.g., 'enforce_priority_order'). The hook
    // runs only when `atdd.enabled` AND `atdd[<sub-knob>]` are both true.
    // When context.atdd is absent, assume all-true defaults (fail-open).
    if (hook.atddGating) {
      const atdd = context.atdd || { enabled: true, require_gwt: true, track_red_green: true, enforce_priority_order: true };
      if (!atdd.enabled || !atdd[hook.atddGating]) {
        continue;
      }
    }

    // Check tool filter (e.g., Write-only for output-format-validator)
    if (hook.toolFilter && toolName !== hook.toolFilter) {
      continue;
    }

    // Add to appropriate category
    if (hook.category === HOOK_CATEGORIES.VALIDATORS) {
      result.validators.push(hook.name);
    } else if (hook.category === HOOK_CATEGORIES.GUARDS) {
      result.guards.push(hook.name);
    } else {
      result.observers.push(hook.name);
    }
  }

  return result;
}

/**
 * Get all known hook types.
 * @returns {string[]}
 */
export function getKnownHookTypes() {
  return Object.keys(ROUTING_TABLES);
}

/**
 * Get the routing table for a specific hook type.
 * @param {string} hookType - e.g. 'PreToolUse:Task'
 * @returns {Array|null}
 */
export function getRoutingTable(hookType) {
  return ROUTING_TABLES[hookType] || null;
}
