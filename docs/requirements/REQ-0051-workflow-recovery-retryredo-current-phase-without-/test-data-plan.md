# Test Data Plan: Workflow Recovery (Retry + Rollback)

**Requirements**: REQ-0051 (Retry/Redo) + REQ-0052 (Rollback)
**Last Updated**: 2026-03-08

---

## Overview

All test data consists of mock `state.json` objects written to temporary directories. No external services, databases, or network calls are needed. Each test creates its own isolated tmpDir via `fs.mkdtempSync`.

---

## Fixture Definitions

### 1. Base Active Workflow State (`baseWorkflowState`)

Used by most tests. Represents a feature workflow at Phase 06 (Implementation) with prior phases completed.

```javascript
const baseWorkflowState = {
  project_name: 'test-project',
  state_version: 42,
  active_workflow: {
    type: 'feature',
    description: 'Test feature',
    slug: 'REQ-9999-test-feature',
    phases: [
      '01-requirements',
      '02-impact-analysis',
      '03-architecture',
      '04-design',
      '05-test-strategy',
      '06-implementation',
      '16-quality-loop',
      '08-code-review'
    ],
    current_phase: '06-implementation',
    current_phase_index: 5,
    phase_status: {
      '01-requirements': 'completed',
      '02-impact-analysis': 'completed',
      '03-architecture': 'completed',
      '04-design': 'completed',
      '05-test-strategy': 'completed',
      '06-implementation': 'in_progress',
      '16-quality-loop': 'pending',
      '08-code-review': 'pending'
    },
    started_at: '2026-03-08T10:00:00.000Z',
    flags: { light: false, supervised: false },
    artifact_folder: 'REQ-9999-test-feature'
  },
  phases: {
    '06-implementation': {
      status: 'in_progress',
      started: '2026-03-08T12:00:00.000Z',
      constitutional_validation: {
        completed: true,
        iterations_used: 2,
        status: 'compliant',
        articles_checked: ['II', 'VII']
      },
      iteration_requirements: {
        test_iteration: {
          completed: true,
          current_iteration: 3,
          tests_passing: true,
          coverage_percent: 85
        },
        interactive_elicitation: {
          completed: true,
          menu_interactions: 4,
          final_selection: 'save'
        }
      }
    }
  }
};
```

### 2. No Workflow State (`noWorkflowState`)

Used by error-path tests (TC-RT-12, TC-RT-13, TC-RB-09).

```javascript
const noWorkflowState = {
  project_name: 'test-project',
  state_version: 10,
  phases: {}
};

const nullWorkflowState = {
  project_name: 'test-project',
  state_version: 10,
  active_workflow: null,
  phases: {}
};
```

### 3. Light Mode Workflow State (`lightModeState`)

Used by rollback validation tests (TC-RB-10). Workflow phases exclude architecture and design.

```javascript
const lightModeState = {
  project_name: 'test-project',
  state_version: 20,
  active_workflow: {
    type: 'feature',
    description: 'Light feature',
    slug: 'REQ-8888-light-feature',
    phases: [
      '00-quick-scan',
      '01-requirements',
      '05-test-strategy',
      '06-implementation',
      '16-quality-loop',
      '08-code-review'
    ],
    current_phase: '06-implementation',
    current_phase_index: 3,
    phase_status: {
      '00-quick-scan': 'completed',
      '01-requirements': 'completed',
      '05-test-strategy': 'completed',
      '06-implementation': 'in_progress',
      '16-quality-loop': 'pending',
      '08-code-review': 'pending'
    },
    flags: { light: true, supervised: false }
  },
  phases: {}
};
```

### 4. Previously Retried Phase State (`retriedPhaseState`)

Used by retry count increment tests (TC-RT-07).

```javascript
const retriedPhaseState = JSON.parse(JSON.stringify(baseWorkflowState));
retiredPhaseState.phases['06-implementation'].retry_count = 2;
```

### 5. Multi-Rollback State (`multiRollbackState`)

Used by rollback count increment tests (TC-RB-23).

```javascript
const multiRollbackState = JSON.parse(JSON.stringify(baseWorkflowState));
multiRollbackState.active_workflow.rollback_count = 1;
```

### 6. Completed Phases for Rollback (`fullProgressState`)

Used by rollback tests that need iteration state in multiple completed phases.

```javascript
const fullProgressState = JSON.parse(JSON.stringify(baseWorkflowState));
// Add iteration state to completed phases so we can verify clearing
for (const phase of ['01-requirements', '02-impact-analysis', '03-architecture', '04-design', '05-test-strategy']) {
  fullProgressState.phases[phase] = {
    status: 'completed',
    constitutional_validation: { completed: true, iterations_used: 1, status: 'compliant' },
    iteration_requirements: {
      test_iteration: { completed: true, current_iteration: 1 },
      interactive_elicitation: { completed: true, menu_interactions: 2 }
    }
  };
}
```

---

## Boundary Values

| Parameter | Boundary | Test Value | Expected |
|-----------|----------|------------|----------|
| `state_version` | 0 (minimum) | `state_version: 0` | After retry: `state_version >= 1` |
| `state_version` | Large value | `state_version: 999999` | After retry: `state_version >= 1000000` |
| `retry_count` | First retry (no field) | Field absent | Set to 1 |
| `retry_count` | Large value | `retry_count: 100` | Set to 101 |
| `rollback_count` | First rollback (no field) | Field absent | Set to 1 |
| `rollback_count` | Large value | `rollback_count: 50` | Set to 51 |
| `current_phase_index` | First phase (0) | Index 0, rollback to index 0 | Error: cannot rollback to current |
| `current_phase_index` | Last phase | Index at last phase, rollback to index 0 | All intermediate phases reset |
| `phases` array | 2 phases only (minimum workflow) | `['05-test-strategy', '06-implementation']` | Rollback from index 1 to index 0 |
| `phases` array | 9 phases (full feature) | Full phase list | Rollback resets up to 8 phases |

---

## Invalid Inputs

| Input | Description | Expected Result |
|-------|-------------|----------------|
| No `active_workflow` in state | Missing field entirely | `{ result: "ERROR", message: "No active workflow" }` |
| `active_workflow: null` | Null value | `{ result: "ERROR", message: "No active workflow" }` |
| `--to-phase` with nonexistent phase | Phase not in workflow array | `{ result: "ERROR", message: "Phase '...' is not in this workflow" }` |
| `--to-phase` with current phase | Same phase as current | `{ result: "ERROR", message: "Cannot rollback to current phase. Use retry instead." }` |
| `--to-phase` with forward phase | Phase index > current index | `{ result: "ERROR", message: "Cannot rollback forward" }` |
| No `--to-phase` argument | Missing required arg | `{ result: "ERROR", message: "Missing --to-phase argument" }` |
| Empty string `--to-phase ""` | Empty target | ERROR with usage |
| `recovery_action` with unknown type | `type: "unknown"` | V8 blocks regression (not recognized) |
| Malformed `state.json` | Invalid JSON on disk | Script exits with error, no state corruption |

---

## Maximum-Size Inputs

| Scenario | Setup | Purpose |
|----------|-------|---------|
| Large state.json (100KB+) | Add 50 entries to `workflow_history` with full phase_snapshots | Verify no performance degradation on read/write cycle |
| Many phases in workflow | Create workflow with 15+ phases | Verify rollback correctly resets all subsequent phases |
| Large `phases` record | Populate all 9 phase entries with full iteration state | Verify clearing iteration state across many phases |
| High retry_count | `retry_count: 10000` | Verify increment arithmetic works at scale |
| Deep nested state | Add complex `metrics`, `test_results` to each phase | Verify state manipulation does not corrupt unrelated fields |

---

## Test Data Generation Strategy

### Approach: In-Memory Fixture Factory

All fixtures are JavaScript objects created in test helper functions. No external files, no database seeds, no network fixtures.

```javascript
// Pattern: factory function with overrides
function createWorkflowState(overrides = {}) {
  const base = JSON.parse(JSON.stringify(baseWorkflowState));
  return { ...base, ...overrides };
}

function createWorkflowStateAtPhase(phaseKey, phaseIndex) {
  const state = createWorkflowState();
  state.active_workflow.current_phase = phaseKey;
  state.active_workflow.current_phase_index = phaseIndex;
  // Update phase_status to reflect position
  const phases = state.active_workflow.phases;
  for (let i = 0; i < phases.length; i++) {
    state.active_workflow.phase_status[phases[i]] =
      i < phaseIndex ? 'completed' :
      i === phaseIndex ? 'in_progress' : 'pending';
  }
  return state;
}
```

### Disk Setup Pattern (for E2E tests)

```javascript
function setupTestEnv(state) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recovery-test-'));
  const isdlcDir = path.join(tmpDir, '.isdlc');
  fs.mkdirSync(isdlcDir, { recursive: true });
  const statePath = path.join(isdlcDir, 'state.json');
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  return { tmpDir, statePath };
}
```

### Cleanup

```javascript
afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
```
