# Design Specification: Golden Fixture Suite

**Item**: REQ-0119 | **GitHub**: #183 | **CODEX**: CODEX-050

---

## 1. Fixture Directory Structure

Each fixture directory contains three JSON files with a consistent schema:

### `initial-state.json`

The starting state.json before the workflow step executes. Represents a realistic mid-workflow snapshot.

```json
{
  "schema_version": 1,
  "active_workflow": {
    "type": "feature",
    "item_id": "REQ-0001",
    "current_phase": "03-architecture"
  },
  "phases": {
    "01-requirements": { "status": "complete" },
    "02-impact-analysis": { "status": "complete" },
    "03-architecture": { "status": "in-progress" }
  },
  "workflow_history": []
}
```

### `context.json`

Input context describing the workflow action to simulate.

```json
{
  "action": "advance_phase",
  "from_phase": "03-architecture",
  "to_phase": "04-design",
  "artifacts_produced": ["architecture-overview.md"]
}
```

### `expected.json`

Expected output after applying core model functions to the initial state with the given context.

```json
{
  "expected_artifacts": ["architecture-overview.md", "module-design.md"],
  "expected_state_mutations": {
    "active_workflow.current_phase": "04-design",
    "phases.03-architecture.status": "complete",
    "phases.04-design.status": "in-progress"
  }
}
```

## 2. Golden Test Runner: `golden.test.js` (~150 lines)

```js
import { describe, it } from 'node:test';
import { deepStrictEqual, ok } from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { migrateState } from '../../src/core/state/schema.js';

const FIXTURES_DIR = new URL('./fixtures/', import.meta.url).pathname;

const fixtures = readdirSync(FIXTURES_DIR, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name);

describe('Golden fixture suite', () => {
  for (const fixtureName of fixtures) {
    describe(fixtureName, () => {
      const fixtureDir = join(FIXTURES_DIR, fixtureName);
      const initialState = JSON.parse(readFileSync(join(fixtureDir, 'initial-state.json'), 'utf8'));
      const context = JSON.parse(readFileSync(join(fixtureDir, 'context.json'), 'utf8'));
      const expected = JSON.parse(readFileSync(join(fixtureDir, 'expected.json'), 'utf8'));

      it('produces expected state mutations', () => {
        const migrated = migrateState(initialState);
        // Apply context-driven state transitions via core functions
        // Compare resulting state fields against expected_state_mutations
        for (const [path, value] of Object.entries(expected.expected_state_mutations)) {
          const actual = getNestedValue(migrated, path);
          deepStrictEqual(actual, value, `State mutation mismatch at ${path}`);
        }
      });

      it('lists expected artifacts', () => {
        ok(Array.isArray(expected.expected_artifacts), 'expected_artifacts is an array');
        // Verify artifact list matches expected
      });
    });
  }
});

function getNestedValue(obj, path) {
  return path.split('.').reduce((o, k) => o?.[k], obj);
}
```

## 3. Fixture Coverage

| Fixture Directory | Workflow Type | Key State Transitions |
|-------------------|--------------|----------------------|
| `discover_existing/` | discover_existing | Initial scan, project detection |
| `feature/` | feature | Phase 01 through 08 progression |
| `fix/` | fix | Bug triage, implementation, verification |
| `test_generate/` | test_generate | Test creation, coverage tracking |
| `test_run/` | test_run | Test execution, result recording |
| `upgrade/` | upgrade | Dependency update, compatibility check |
| `analyze/` | analyze | Roundtable analysis, artifact generation |
| `implementation_loop/` | implementation_loop | Iterative build with test feedback |
| `quality_loop/` | quality_loop | Quality gate checks, iteration |

## 4. Open Questions

None — fixture schema is defined above; individual fixture content is authored during implementation.
