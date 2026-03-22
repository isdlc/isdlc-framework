# Design Specification: State Migration Verification

**Item**: REQ-0120 | **GitHub**: #184 | **CODEX**: CODEX-051

---

## 1. Test File: `migration-paths.test.js`

Verifies all migration paths through `migrateState()`.

```js
import { describe, it } from 'node:test';
import { deepStrictEqual, ok } from 'node:assert';
import { migrateState } from '../../../src/core/state/schema.js';

describe('Migration paths', () => {
  it('migrates v0 to v1', () => {
    const v0State = { /* v0 state without schema_version */ };
    const result = migrateState(v0State);
    deepStrictEqual(result.schema_version, 1);
  });

  it('handles missing schema_version (treats as v0)', () => {
    const noVersion = { phases: {}, workflow_history: [] };
    const result = migrateState(noVersion);
    deepStrictEqual(result.schema_version, 1);
  });

  it('is a no-op for current version', () => {
    const current = { schema_version: 1, phases: {}, workflow_history: [] };
    const result = migrateState(current);
    deepStrictEqual(result, current);
  });

  it('preserves all fields during v0→v1 migration', () => {
    const v0State = {
      phases: { '01-requirements': { status: 'complete' } },
      workflow_history: [{ type: 'feature', completed_at: '2026-01-01' }],
      active_workflow: { type: 'fix', current_phase: '02-impact-analysis' }
    };
    const result = migrateState(v0State);
    deepStrictEqual(result.phases['01-requirements'].status, 'complete');
    deepStrictEqual(result.workflow_history.length, 1);
    ok(result.active_workflow);
  });
});
```

## 2. Test File: `in-flight-state.test.js`

Verifies mid-workflow state survives migration intact.

```js
import { describe, it } from 'node:test';
import { deepStrictEqual, ok } from 'node:assert';
import { migrateState } from '../../../src/core/state/schema.js';

describe('In-flight state compatibility', () => {
  it('preserves active_workflow through migration', () => {
    const inFlight = {
      active_workflow: {
        type: 'feature',
        item_id: 'REQ-0050',
        current_phase: '05-implementation',
        branch: 'feature/REQ-0050-something'
      },
      phases: {
        '01-requirements': { status: 'complete' },
        '05-implementation': { status: 'in-progress' }
      },
      workflow_history: []
    };
    const result = migrateState(inFlight);
    deepStrictEqual(result.active_workflow.item_id, 'REQ-0050');
    deepStrictEqual(result.active_workflow.current_phase, '05-implementation');
  });

  it('preserves phases with all sub-fields', () => {
    const state = {
      phases: {
        '01-requirements': {
          status: 'complete',
          constitutional_validation: { completed: true, status: 'compliant' },
          iteration_requirements: { interactive_elicitation: { completed: true } }
        }
      },
      workflow_history: []
    };
    const result = migrateState(state);
    ok(result.phases['01-requirements'].constitutional_validation.completed);
    deepStrictEqual(result.phases['01-requirements'].constitutional_validation.status, 'compliant');
  });

  it('preserves workflow_history array', () => {
    const state = {
      schema_version: 1,
      workflow_history: [
        { type: 'feature', item_id: 'REQ-0001', completed_at: '2026-01-01' },
        { type: 'fix', item_id: 'BUG-0010', completed_at: '2026-02-01' }
      ],
      phases: {}
    };
    const result = migrateState(state);
    deepStrictEqual(result.workflow_history.length, 2);
  });
});
```

## 3. Test File: `doctor-repair.test.js`

Verifies `doctorCore()` detects incompatible state and recommends migration.

```js
import { describe, it } from 'node:test';
import { ok } from 'node:assert';

describe('Doctor repair detection', () => {
  it('detects state needing migration', () => {
    // State with missing schema_version → doctor recommends migration
    const state = { phases: {}, workflow_history: [] };
    // doctorCore inspects state and returns recommendations
    // Assert recommendation includes 'migration' action
  });

  it('distinguishes migration needed from corrupted state', () => {
    // State with invalid structure → doctor reports corruption, not migration
    const corrupted = { phases: 'invalid' };
    // Assert recommendation is 'repair' not 'migrate'
  });
});
```

## 4. Open Questions

None — test patterns follow the existing `tests/core/state/schema.test.js` conventions.
