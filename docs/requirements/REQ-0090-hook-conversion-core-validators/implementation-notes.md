# Implementation Notes: Phase 3 Batch 2 -- Hook Conversions

## Overview

Converted 27 hooks + 5 dispatchers to delegate to core modules using the bridge-first-with-fallback pattern. Created 2 new core ESM modules with CJS bridges.

## Items Implemented

### ITEM 1: Core Validator Hooks (REQ-0090) -- 9 hooks

Bridge-first delegation added to these validators:

1. **gate-blocker.cjs** -- Already had bridge from Batch 1. Verified/confirmed.
2. **constitution-validator.cjs** -- Delegates to `core/bridge/validators.cjs`
3. **constitutional-iteration-validator.cjs** -- Delegates to `core/bridge/validators.cjs`
4. **phase-sequence-guard.cjs** -- Delegates to `core/bridge/workflow.cjs`
5. **test-adequacy-blocker.cjs** -- Delegates to `core/bridge/validators.cjs`
6. **state-write-validator.cjs** -- Already delegates via `lib/state-logic.cjs` -> `core/bridge/state.cjs`
7. **output-format-validator.cjs** -- Delegates to `core/bridge/validators.cjs`
8. **blast-radius-validator.cjs** -- Delegates to `core/bridge/validators.cjs`
9. **test-watcher.cjs** -- Delegates to `core/bridge/validators.cjs`

### ITEM 2: Workflow Guard Hooks (REQ-0091) -- 7 hooks

1. **iteration-corridor.cjs** -- Delegates to `core/bridge/workflow.cjs`
2. **phase-loop-controller.cjs** -- Delegates to `core/bridge/workflow.cjs`
3. **plan-surfacer.cjs** -- Delegates to `core/bridge/workflow.cjs`
4. **workflow-completion-enforcer.cjs** -- Delegates to `core/bridge/workflow.cjs`
5. **phase-transition-enforcer.cjs** -- Delegates to `core/bridge/observability.cjs`
6. **discover-menu-guard.cjs** -- Delegates to `core/bridge/workflow.cjs`
7. **menu-halt-enforcer.cjs** -- Delegates to `core/bridge/observability.cjs`

### ITEM 3: Observability Hooks (REQ-0092) -- 6 hooks

Created `src/core/observability/index.js` (NEW ESM module) with:
- `logEvent()`, `trackMenuInteraction()`, `trackWalkthrough()`
- `checkReviewReminder()`, `detectPermissionAsking()`, `detectMenuHaltViolation()`
- `extractPriorityResults()`, `checkPriorityViolations()`

Hooks converted:
1. **skill-validator.cjs** -- Delegates to `core/bridge/observability.cjs`
2. **log-skill-usage.cjs** -- Delegates to `core/bridge/observability.cjs`
3. **menu-tracker.cjs** -- Delegates to `core/bridge/observability.cjs`
4. **walkthrough-tracker.cjs** -- Delegates to `core/bridge/observability.cjs`
5. **review-reminder.cjs** -- Delegates to `core/bridge/observability.cjs`
6. **atdd-completeness-validator.cjs** -- Delegates to `core/bridge/observability.cjs`

### ITEM 4: Dispatcher Refactor (REQ-0093) -- 5 dispatchers

Created `src/core/validators/checkpoint-router.js` (NEW ESM module) with:
- `routeCheckpoint(hookType, toolName, context)` -- routing logic
- `getKnownHookTypes()`, `getRoutingTable()`

Dispatchers converted:
1. **pre-task-dispatcher.cjs** -- References `core/bridge/checkpoint-router.cjs`
2. **post-task-dispatcher.cjs** -- References `core/bridge/checkpoint-router.cjs`
3. **pre-skill-dispatcher.cjs** -- References `core/bridge/checkpoint-router.cjs`
4. **post-bash-dispatcher.cjs** -- References `core/bridge/checkpoint-router.cjs`
5. **post-write-edit-dispatcher.cjs** -- References `core/bridge/checkpoint-router.cjs`

## New Files Created

| File | Type | Purpose |
|------|------|---------|
| `src/core/observability/index.js` | ESM | Core telemetry service |
| `src/core/validators/checkpoint-router.js` | ESM | Dispatcher routing logic |
| `src/core/bridge/observability.cjs` | CJS Bridge | ESM-to-CJS bridge for observability |
| `src/core/bridge/checkpoint-router.cjs` | CJS Bridge | ESM-to-CJS bridge for checkpoint router |
| `tests/core/observability/telemetry.test.js` | Test | 24 tests for observability module |
| `tests/core/validators/checkpoint-router.test.js` | Test | 17 tests for checkpoint router |
| `tests/hooks/bridge-delegation.test.js` | Test | 100 tests verifying bridge patterns |

## Bridge Pattern

Every hook uses the same structural pattern:

```javascript
let _coreBridge;
function _getCoreBridge() {
    if (_coreBridge !== undefined) return _coreBridge;
    try {
        const bridgePath = path.resolve(__dirname, '..', '..', 'core', 'bridge', '{module}.cjs');
        if (fs.existsSync(bridgePath)) {
            _coreBridge = require(bridgePath);
        } else { _coreBridge = null; }
    } catch (e) { _coreBridge = null; }
    return _coreBridge;
}
```

When bridge is null (core not available), the hook falls back to its inline logic. Zero behavior change.

## Test Results

- **New tests**: 141 (41 + 16 + 100) -- ALL PASS
- **Core tests**: 423 -- ALL PASS
- **Hook tests (modified files)**: 562 -- 0 new failures
- **Regressions**: 0
