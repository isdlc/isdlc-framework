/**
 * Unit tests for src/core/tasks/task-validator.js — Task Coverage Validator
 *
 * Tests validateTaskCoverage().
 * Requirements: REQ-GH-223 FR-001 (AC-001-01, AC-001-02)
 *
 * Test ID prefix: TV- (Task Validator)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { validateTaskCoverage } from '../../../src/core/tasks/task-validator.js';

// --- Helpers ---

function makePlan(tasks) {
  return {
    slug: 'test-plan',
    format: 'v3.0',
    phases: {
      '06': {
        name: 'Implementation',
        status: 'PENDING',
        tasks: tasks.map(t => ({
          id: t.id || 'T001',
          description: t.desc || 'Test task',
          complete: false,
          traces: t.traces || [],
          files: (t.files || []).map(f => ({ path: f, operation: 'CREATE' })),
          blockedBy: [],
          blocks: [],
          parentId: null,
          children: []
        }))
      }
    },
    summary: {}
  };
}

const SAMPLE_REQS = `
## 3. Functional Requirements

### FR-001: Task Quality Gate
**Confidence**: High

- **AC-001-01**: Given a plan, when validateTaskCoverage called, then structured result returned
- **AC-001-02**: Given uncovered FRs, when entering PRESENTING_TASKS, then re-run generation

### FR-002: Single Generation
**Confidence**: High

- **AC-002-01**: Given analysis tasks.md, when build starts, then copies without ORCH-012
- **AC-002-02**: Given no tasks.md, when build starts, then error

### FR-003: Sub-Task Model
**Confidence**: High

- **AC-003-01**: Given parent T005, when addSubTask called, then T005A written
- **AC-003-02**: Given all siblings [X], when markTaskComplete, then parent auto-complete
- **AC-003-03**: Given TNNN and TNNNABC, when readTaskPlan, then parentId and children parsed
`;

const SAMPLE_IA = `
## 1. Blast Radius

### Tier 1 (Direct Changes)

| File | Module | Change Type |
|------|--------|-------------|
| src/core/tasks/task-validator.js | tasks | CREATE |
| src/core/tasks/task-reader.js | tasks | MODIFY |
| src/core/tasks/task-dispatcher.js | tasks | MODIFY |

### Tier 2 (Transitive)
`;

// TV-01: All covered
describe('TV-01: All FRs and ACs covered', () => {
  it('returns valid:true when all items have covering tasks', () => {
    const plan = makePlan([
      { id: 'T001', traces: ['FR-001', 'AC-001-01', 'AC-001-02'], files: ['src/core/tasks/task-validator.js'] },
      { id: 'T002', traces: ['FR-002', 'AC-002-01', 'AC-002-02'], files: ['src/core/tasks/task-reader.js'] },
      { id: 'T003', traces: ['FR-003', 'AC-003-01', 'AC-003-02', 'AC-003-03'], files: ['src/core/tasks/task-dispatcher.js'] }
    ]);
    const result = validateTaskCoverage(plan, SAMPLE_REQS, SAMPLE_IA);
    assert.equal(result.valid, true);
    assert.deepEqual(result.uncovered, []);
    assert.deepEqual(result.orphanTasks, []);
  });
});

// TV-02: Missing task for FR-003
describe('TV-02: FR missing coverage', () => {
  it('returns uncovered FR when no task traces to it', () => {
    const plan = makePlan([
      { id: 'T001', traces: ['FR-001', 'AC-001-01', 'AC-001-02'], files: ['src/core/tasks/task-validator.js'] },
      { id: 'T002', traces: ['FR-002', 'AC-002-01', 'AC-002-02'], files: ['src/core/tasks/task-reader.js'] }
    ]);
    const result = validateTaskCoverage(plan, SAMPLE_REQS, SAMPLE_IA);
    assert.equal(result.valid, false);
    assert.ok(result.uncovered.some(u => u.id === 'FR-003' && u.type === 'fr'));
  });
});

// TV-03: Missing AC
describe('TV-03: AC missing coverage', () => {
  it('returns uncovered AC when task traces to FR but not specific AC', () => {
    const plan = makePlan([
      { id: 'T001', traces: ['FR-001', 'AC-001-01'], files: ['src/core/tasks/task-validator.js'] },
      { id: 'T002', traces: ['FR-002', 'AC-002-01', 'AC-002-02'], files: ['src/core/tasks/task-reader.js'] },
      { id: 'T003', traces: ['FR-003', 'AC-003-01', 'AC-003-02', 'AC-003-03'], files: ['src/core/tasks/task-dispatcher.js'] }
    ]);
    const result = validateTaskCoverage(plan, SAMPLE_REQS, SAMPLE_IA);
    assert.equal(result.valid, false);
    assert.ok(result.uncovered.some(u => u.id === 'AC-001-02' && u.type === 'ac'));
  });
});

// TV-04: Missing blast radius file
describe('TV-04: Blast radius file uncovered', () => {
  it('returns uncovered blast_radius_file when no task covers it', () => {
    const plan = makePlan([
      { id: 'T001', traces: ['FR-001', 'AC-001-01', 'AC-001-02'], files: ['src/core/tasks/task-validator.js'] },
      { id: 'T002', traces: ['FR-002', 'AC-002-01', 'AC-002-02'], files: ['src/core/tasks/task-reader.js'] },
      { id: 'T003', traces: ['FR-003', 'AC-003-01', 'AC-003-02', 'AC-003-03'], files: [] }
    ]);
    const result = validateTaskCoverage(plan, SAMPLE_REQS, SAMPLE_IA);
    assert.equal(result.valid, false);
    assert.ok(result.uncovered.some(u => u.id === 'src/core/tasks/task-dispatcher.js' && u.type === 'blast_radius_file'));
  });
});

// TV-05: Orphan task
describe('TV-05: Task with empty traces', () => {
  it('orphanTasks includes task with no traces', () => {
    const plan = makePlan([
      { id: 'T001', traces: ['FR-001', 'AC-001-01', 'AC-001-02'], files: ['src/core/tasks/task-validator.js'] },
      { id: 'T002', traces: ['FR-002', 'AC-002-01', 'AC-002-02'], files: ['src/core/tasks/task-reader.js'] },
      { id: 'T003', traces: ['FR-003', 'AC-003-01', 'AC-003-02', 'AC-003-03'], files: ['src/core/tasks/task-dispatcher.js'] },
      { id: 'T099', traces: [], files: [] }
    ]);
    const result = validateTaskCoverage(plan, SAMPLE_REQS, SAMPLE_IA);
    assert.ok(result.orphanTasks.includes('T099'));
  });
});

// TV-06: Summary contains counts
describe('TV-06: Full coverage summary', () => {
  it('summary shows FR and AC counts', () => {
    const plan = makePlan([
      { id: 'T001', traces: ['FR-001', 'AC-001-01', 'AC-001-02'], files: ['src/core/tasks/task-validator.js'] },
      { id: 'T002', traces: ['FR-002', 'AC-002-01', 'AC-002-02'], files: ['src/core/tasks/task-reader.js'] },
      { id: 'T003', traces: ['FR-003', 'AC-003-01', 'AC-003-02', 'AC-003-03'], files: ['src/core/tasks/task-dispatcher.js'] }
    ]);
    const result = validateTaskCoverage(plan, SAMPLE_REQS, SAMPLE_IA);
    assert.ok(result.summary.includes('3/3 FRs covered'));
    assert.ok(result.summary.includes('7/7 ACs covered'));
  });
});

// TV-07: Empty plan
describe('TV-07: Empty plan (no tasks)', () => {
  it('returns valid:false with all FRs uncovered', () => {
    const plan = makePlan([]);
    const result = validateTaskCoverage(plan, SAMPLE_REQS, null);
    assert.equal(result.valid, false);
    assert.ok(result.uncovered.length > 0);
  });
});

// TV-08: Null plan
describe('TV-08: Null plan', () => {
  it('returns valid:false gracefully', () => {
    const result = validateTaskCoverage(null, SAMPLE_REQS, null);
    assert.equal(result.valid, false);
    assert.ok(result.uncovered.some(u => u.type === 'fr'));
  });
});

// TV-09: No FR headings
describe('TV-09: Requirements with no FR headings', () => {
  it('returns valid:true when nothing to validate', () => {
    const result = validateTaskCoverage(makePlan([]), 'No requirements here', null);
    assert.equal(result.valid, true);
  });
});

// TV-10: Null impact analysis
describe('TV-10: Null impact analysis', () => {
  it('skips blast radius check, validates FRs only', () => {
    const plan = makePlan([
      { id: 'T001', traces: ['FR-001', 'AC-001-01', 'AC-001-02'], files: [] },
      { id: 'T002', traces: ['FR-002', 'AC-002-01', 'AC-002-02'], files: [] },
      { id: 'T003', traces: ['FR-003', 'AC-003-01', 'AC-003-02', 'AC-003-03'], files: [] }
    ]);
    const result = validateTaskCoverage(plan, SAMPLE_REQS, null);
    assert.equal(result.valid, true);
    assert.ok(!result.summary.includes('blast radius'));
  });
});

// TV-11: Multiple tasks trace to same FR
describe('TV-11: Many-to-many tracing', () => {
  it('FR counted as covered when multiple tasks trace to it', () => {
    const plan = makePlan([
      { id: 'T001', traces: ['FR-001', 'AC-001-01'], files: ['src/core/tasks/task-validator.js'] },
      { id: 'T001B', traces: ['FR-001', 'AC-001-02'], files: ['src/core/tasks/task-reader.js'] },
      { id: 'T002', traces: ['FR-002', 'AC-002-01', 'AC-002-02'], files: ['src/core/tasks/task-reader.js'] },
      { id: 'T003', traces: ['FR-003', 'AC-003-01', 'AC-003-02', 'AC-003-03'], files: ['src/core/tasks/task-dispatcher.js'] }
    ]);
    const result = validateTaskCoverage(plan, SAMPLE_REQS, SAMPLE_IA);
    assert.equal(result.valid, true);
    const fr001 = result.covered.find(c => c.frId === 'FR-001');
    assert.ok(fr001.taskIds.includes('T001'));
    assert.ok(fr001.taskIds.includes('T001B'));
  });
});

// TV-12: Null requirements
describe('TV-12: Null requirements content', () => {
  it('returns valid:true with nothing to validate', () => {
    const result = validateTaskCoverage(makePlan([{ id: 'T001', traces: ['FR-001'] }]), null, null);
    assert.equal(result.valid, true);
    assert.ok(result.summary.includes('No requirements'));
  });
});
