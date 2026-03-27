/**
 * Contract Checks Unit Tests
 * ============================
 * REQ-GH-213: Inline Contract Enforcement
 * FR-001 through FR-007
 *
 * Tests: CC-ERR-01 to CC-ERR-05, CC-DT-01 to CC-DT-06,
 *        CC-BW-01 to CC-BW-07, CC-PF-01 to CC-PF-10,
 *        CC-PC-01 to CC-PC-06, CC-DG-01 to CC-DG-05,
 *        CC-ART-01 to CC-ART-06, CC-TL-01 to CC-TL-09,
 *        PERF-CC-01 to PERF-CC-07
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { performance } from 'node:perf_hooks';

import {
  ContractViolationError,
  checkDomainTransition,
  checkBatchWrite,
  checkPersonaFormat,
  checkPersonaContribution,
  checkDelegation,
  checkArtifacts,
  checkTaskList
} from '../../../src/core/validators/contract-checks.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContractData(overrides = {}) {
  return {
    execution_unit: 'analyze',
    context: 'feature:standard',
    expectations: {
      agent: 'software-developer',
      presentation: {
        confirmation_sequence: ['requirements', 'architecture', 'design']
      },
      artifacts_produced: [
        '{artifact_folder}/requirements-spec.md',
        '{artifact_folder}/architecture-overview.md'
      ],
      ...overrides.expectations
    },
    violation_response: {
      agent_not_engaged: 'block',
      artifacts_missing: 'block',
      presentation_violated: 'warn'
    },
    ...overrides
  };
}

function makeTemplateData(overrides = {}) {
  return {
    domain: 'requirements',
    version: '1.0.0',
    format: {
      format_type: 'bulleted',
      section_order: ['functional_requirements', 'assumptions'],
      assumptions_placement: 'inline',
      required_sections: ['functional_requirements', 'assumptions'],
      ...overrides.format
    },
    ...overrides
  };
}

function makeTaskPlan(overrides = {}) {
  return {
    phases: {
      '05': { categories: ['test_case_design'] },
      '06': { categories: ['setup', 'core_implementation', 'unit_tests', 'wiring_claude', 'wiring_codex', 'cleanup'] },
      '16': { categories: ['test_execution', 'parity_verification'] },
      '08': { categories: ['constitutional_review', 'dual_file_check'] }
    },
    tasks: [
      { id: 'T0001', traces: 'FR-001', files: 'test.js (CREATE)', blocked_by: 'none', blocks: 'T0002' },
      { id: 'T0002', traces: 'FR-002', files: 'impl.js (CREATE)', blocked_by: 'T0001', blocks: 'none' }
    ],
    sections: ['progress_summary', 'dependency_graph', 'traceability_matrix'],
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// CC-ERR: ContractViolationError Tests (FR-001, AC-001-04)
// ---------------------------------------------------------------------------

describe('ContractViolationError', () => {
  it('CC-ERR-01: Constructor sets all properties (decisionPoint, expected, actual, contractId)', () => {
    const error = new ContractViolationError({
      decisionPoint: 'domain_transition',
      expected: 'requirements',
      actual: 'design',
      contractId: 'analyze'
    });
    assert.equal(error.decisionPoint, 'domain_transition');
    assert.equal(error.expected, 'requirements');
    assert.equal(error.actual, 'design');
    assert.equal(error.contractId, 'analyze');
    assert.equal(error.name, 'ContractViolationError');
  });

  it('CC-ERR-02: Message format matches CONTRACT VIOLATION [{dp}]: expected {e}, got {a}', () => {
    const error = new ContractViolationError({
      decisionPoint: 'domain_transition',
      expected: 'requirements',
      actual: 'design',
      contractId: 'analyze'
    });
    assert.equal(
      error.message,
      'CONTRACT VIOLATION [domain_transition]: expected requirements, got design'
    );
  });

  it('CC-ERR-03: Is instanceof Error', () => {
    const error = new ContractViolationError({
      decisionPoint: 'x',
      expected: 'y',
      actual: 'z'
    });
    assert.ok(error instanceof Error);
  });

  it('CC-ERR-04: contractId defaults to null when omitted', () => {
    const error = new ContractViolationError({
      decisionPoint: 'x',
      expected: 'y',
      actual: 'z'
    });
    assert.equal(error.contractId, null);
  });

  it('CC-ERR-05: Can be caught in try/catch as expected error type', () => {
    let caught = false;
    try {
      throw new ContractViolationError({
        decisionPoint: 'test',
        expected: 'a',
        actual: 'b'
      });
    } catch (e) {
      caught = true;
      assert.equal(e.name, 'ContractViolationError');
      assert.ok(e instanceof ContractViolationError);
    }
    assert.ok(caught, 'Error should have been caught');
  });
});

// ---------------------------------------------------------------------------
// CC-DT: checkDomainTransition Tests (FR-002, AC-002-01)
// ---------------------------------------------------------------------------

describe('checkDomainTransition', () => {
  it('CC-DT-01: Correct domain at correct index passes silently', () => {
    const contractData = makeContractData();
    // Should not throw
    checkDomainTransition(contractData, 'requirements', 0);
  });

  it('CC-DT-02: Wrong domain at index throws ContractViolationError', () => {
    const contractData = makeContractData();
    assert.throws(
      () => checkDomainTransition(contractData, 'design', 0),
      (err) => {
        assert.ok(err instanceof ContractViolationError);
        assert.equal(err.expected, 'requirements');
        assert.equal(err.actual, 'design');
        assert.equal(err.decisionPoint, 'domain_transition');
        return true;
      }
    );
  });

  it('CC-DT-03: Index out of bounds throws', () => {
    const contractData = makeContractData();
    assert.throws(
      () => checkDomainTransition(contractData, 'unknown', 5),
      (err) => {
        assert.ok(err instanceof ContractViolationError);
        assert.equal(err.decisionPoint, 'domain_transition');
        return true;
      }
    );
  });

  it('CC-DT-04: Missing confirmation_sequence is no-op (fail-open)', () => {
    const contractData = makeContractData({
      expectations: { presentation: {} }
    });
    // Should not throw
    checkDomainTransition(contractData, 'anything', 0);
  });

  it('CC-DT-05: Null contractData is no-op (fail-open)', () => {
    checkDomainTransition(null, 'requirements', 0);
    checkDomainTransition(undefined, 'requirements', 0);
  });

  it('CC-DT-06: All three domains in correct sequence pass', () => {
    const contractData = makeContractData();
    checkDomainTransition(contractData, 'requirements', 0);
    checkDomainTransition(contractData, 'architecture', 1);
    checkDomainTransition(contractData, 'design', 2);
  });
});

// ---------------------------------------------------------------------------
// CC-BW: checkBatchWrite Tests (FR-002, AC-002-02)
// ---------------------------------------------------------------------------

describe('checkBatchWrite', () => {
  it('CC-BW-01: All expected artifacts present in write set passes', () => {
    const contractData = makeContractData();
    const artifactPaths = [
      'docs/REQ-X/requirements-spec.md',
      'docs/REQ-X/architecture-overview.md'
    ];
    checkBatchWrite(contractData, artifactPaths, 'REQ-X');
  });

  it('CC-BW-02: Missing artifact throws with list of missing items', () => {
    const contractData = makeContractData({
      expectations: {
        artifacts_produced: ['requirements-spec.md', 'architecture-overview.md', 'module-design.md'],
        presentation: { confirmation_sequence: ['requirements', 'architecture', 'design'] }
      }
    });
    assert.throws(
      () => checkBatchWrite(contractData, ['docs/REQ-X/requirements-spec.md'], 'REQ-X'),
      (err) => {
        assert.ok(err instanceof ContractViolationError);
        assert.ok(err.actual.includes('module-design.md'));
        return true;
      }
    );
  });

  it('CC-BW-03: Extra artifacts in write set are allowed (superset is fine)', () => {
    const contractData = makeContractData({
      expectations: {
        artifacts_produced: ['requirements-spec.md'],
        presentation: { confirmation_sequence: ['requirements'] }
      }
    });
    checkBatchWrite(contractData, [
      'docs/REQ-X/requirements-spec.md',
      'docs/REQ-X/extra-doc.md'
    ], 'REQ-X');
  });

  it('CC-BW-04: Empty expected artifacts is no-op', () => {
    const contractData = makeContractData({
      expectations: {
        artifacts_produced: [],
        presentation: { confirmation_sequence: ['requirements'] }
      }
    });
    checkBatchWrite(contractData, ['anything'], 'REQ-X');
  });

  it('CC-BW-05: Null contractData is no-op (fail-open)', () => {
    checkBatchWrite(null, ['anything'], 'REQ-X');
    checkBatchWrite(undefined, ['anything'], 'REQ-X');
  });

  it('CC-BW-06: Artifact paths are matched by basename, not full path', () => {
    const contractData = makeContractData({
      expectations: {
        artifacts_produced: ['requirements-spec.md'],
        presentation: { confirmation_sequence: ['requirements'] }
      }
    });
    checkBatchWrite(contractData, ['docs/REQ-X/requirements-spec.md'], 'REQ-X');
  });

  it('CC-BW-07: artifactFolder substitution replaces {artifact_folder} in expected paths', () => {
    const contractData = makeContractData({
      expectations: {
        artifacts_produced: ['{artifact_folder}/requirements-spec.md'],
        presentation: { confirmation_sequence: ['requirements'] }
      }
    });
    checkBatchWrite(
      contractData,
      ['docs/requirements/REQ-GH-213-test/requirements-spec.md'],
      'REQ-GH-213-test'
    );
  });
});

// ---------------------------------------------------------------------------
// CC-PF: checkPersonaFormat Tests (FR-002, AC-002-03, FR-004, AC-004-01)
// ---------------------------------------------------------------------------

describe('checkPersonaFormat', () => {
  it('CC-PF-01: Bulleted output matches bulleted template', () => {
    const template = makeTemplateData();
    const output = [
      '## functional_requirements',
      '- FR-001: Must validate contracts',
      '- FR-002: Must check personas',
      '',
      '## assumptions',
      '- Assumption: Contract data is pre-loaded'
    ].join('\n');
    checkPersonaFormat(template, output);
  });

  it('CC-PF-02: Numbered output violates bulleted template', () => {
    const template = makeTemplateData();
    const output = [
      '## functional_requirements',
      '1. FR-001: Must validate contracts',
      '2. FR-002: Must check personas',
      '',
      '## assumptions',
      '- Assumption: Contract data is pre-loaded'
    ].join('\n');
    assert.throws(
      () => checkPersonaFormat(template, output),
      (err) => {
        assert.ok(err instanceof ContractViolationError);
        assert.equal(err.decisionPoint, 'persona_format');
        assert.ok(err.actual.includes('numbered'));
        return true;
      }
    );
  });

  it('CC-PF-03: Table output violates bulleted template', () => {
    const template = makeTemplateData();
    const output = [
      '## functional_requirements',
      '| FR | Description |',
      '| FR-001 | Must validate |',
      '',
      '## assumptions',
      '- Assumption one'
    ].join('\n');
    assert.throws(
      () => checkPersonaFormat(template, output),
      (err) => {
        assert.ok(err instanceof ContractViolationError);
        assert.ok(err.actual.includes('table'));
        return true;
      }
    );
  });

  it('CC-PF-04: Sections in correct order pass', () => {
    const template = makeTemplateData({
      format: {
        format_type: 'bulleted',
        section_order: ['functional_requirements', 'assumptions'],
        required_sections: ['functional_requirements', 'assumptions']
      }
    });
    const output = [
      '## functional_requirements',
      '- Item one',
      '',
      '## assumptions',
      '- Assumption one'
    ].join('\n');
    checkPersonaFormat(template, output);
  });

  it('CC-PF-05: Sections in wrong order throw', () => {
    const template = makeTemplateData({
      format: {
        format_type: 'bulleted',
        section_order: ['functional_requirements', 'assumptions'],
        required_sections: ['functional_requirements', 'assumptions']
      }
    });
    const output = [
      '## assumptions',
      '- Assumption one',
      '',
      '## functional_requirements',
      '- Item one'
    ].join('\n');
    assert.throws(
      () => checkPersonaFormat(template, output),
      (err) => {
        assert.ok(err instanceof ContractViolationError);
        assert.ok(err.actual.includes('out of order'));
        return true;
      }
    );
  });

  it('CC-PF-06: Missing required section throws', () => {
    const template = makeTemplateData({
      format: {
        format_type: 'bulleted',
        required_sections: ['functional_requirements', 'assumptions'],
        section_order: []
      }
    });
    const output = [
      '## functional_requirements',
      '- Item one'
    ].join('\n');
    assert.throws(
      () => checkPersonaFormat(template, output),
      (err) => {
        assert.ok(err instanceof ContractViolationError);
        assert.ok(err.actual.includes('assumptions'));
        return true;
      }
    );
  });

  it('CC-PF-07: Inline assumptions placement passes when assumptions follow each FR', () => {
    const template = makeTemplateData({
      format: {
        format_type: 'bulleted',
        assumptions_placement: 'inline',
        required_sections: ['functional_requirements'],
        section_order: []
      }
    });
    const output = [
      '## functional_requirements',
      '- FR-001: Must validate contracts',
      '  *Assumption: Data is pre-loaded*'
    ].join('\n');
    checkPersonaFormat(template, output);
  });

  it('CC-PF-08: Batched assumptions placement passes when assumptions are in separate section', () => {
    const template = makeTemplateData({
      format: {
        format_type: 'bulleted',
        assumptions_placement: 'batched',
        required_sections: ['functional_requirements', 'assumptions'],
        section_order: []
      }
    });
    const output = [
      '## functional_requirements',
      '- FR-001: Must validate contracts',
      '',
      '## assumptions',
      '- Assumption: Data is pre-loaded'
    ].join('\n');
    checkPersonaFormat(template, output);
  });

  it('CC-PF-09: Null templateData is no-op (fail-open)', () => {
    checkPersonaFormat(null, 'any output');
    checkPersonaFormat(undefined, 'any output');
  });

  it('CC-PF-10: Empty output with valid template throws (no format detected)', () => {
    const template = makeTemplateData();
    assert.throws(
      () => checkPersonaFormat(template, ''),
      (err) => {
        assert.ok(err instanceof ContractViolationError);
        assert.ok(err.actual.includes('empty'));
        return true;
      }
    );
  });
});

// ---------------------------------------------------------------------------
// CC-PC: checkPersonaContribution Tests (FR-002, AC-002-04, AC-002-05)
// ---------------------------------------------------------------------------

describe('checkPersonaContribution', () => {
  it('CC-PC-01: All configured personas contributed passes', () => {
    checkPersonaContribution(
      ['Maya', 'Alex', 'Jordan'],
      ['Maya', 'Alex', 'Jordan']
    );
  });

  it('CC-PC-02: Missing persona throws with list of silent personas', () => {
    assert.throws(
      () => checkPersonaContribution(
        ['Maya', 'Alex', 'Jordan'],
        ['Maya', 'Jordan']
      ),
      (err) => {
        assert.ok(err instanceof ContractViolationError);
        assert.equal(err.decisionPoint, 'persona_contribution');
        assert.ok(err.actual.includes('Alex'));
        return true;
      }
    );
  });

  it('CC-PC-03: Extra contributions are allowed (superset)', () => {
    checkPersonaContribution(
      ['Maya'],
      ['Maya', 'Alex']
    );
  });

  it('CC-PC-04: Empty configured personas is no-op', () => {
    checkPersonaContribution([], ['Maya']);
  });

  it('CC-PC-05: Dynamic persona list from roundtable.yaml is honored', () => {
    checkPersonaContribution(
      ['Aria', 'Blake'],
      ['Aria', 'Blake']
    );
  });

  it('CC-PC-06: Null configuredPersonas is no-op (fail-open)', () => {
    checkPersonaContribution(null, ['Maya']);
    checkPersonaContribution(undefined, ['Maya']);
  });
});

// ---------------------------------------------------------------------------
// CC-DG: checkDelegation Tests (FR-003, AC-003-01, FR-006, AC-006-01)
// ---------------------------------------------------------------------------

describe('checkDelegation', () => {
  it('CC-DG-01: Correct agent for phase passes', () => {
    const contractData = makeContractData({
      expectations: {
        agent: 'software-developer',
        presentation: null
      }
    });
    checkDelegation(contractData, '06-implementation', 'software-developer');
  });

  it('CC-DG-02: Wrong agent for phase throws', () => {
    const contractData = makeContractData({
      expectations: {
        agent: 'software-developer',
        presentation: null
      }
    });
    assert.throws(
      () => checkDelegation(contractData, '06-implementation', 'test-design-engineer'),
      (err) => {
        assert.ok(err instanceof ContractViolationError);
        assert.equal(err.expected, 'software-developer');
        assert.equal(err.actual, 'test-design-engineer');
        assert.equal(err.decisionPoint, 'delegation');
        return true;
      }
    );
  });

  it('CC-DG-03: Null agent expectation is no-op (fail-open)', () => {
    const contractData = makeContractData({
      expectations: {
        agent: null,
        presentation: null
      }
    });
    checkDelegation(contractData, '06-implementation', 'anyone');
  });

  it('CC-DG-04: Null contractData is no-op (fail-open)', () => {
    checkDelegation(null, '06-implementation', 'software-developer');
    checkDelegation(undefined, '06-implementation', 'software-developer');
  });

  it('CC-DG-05: Discover workflow delegation validated same as feature', () => {
    const discoverContract = makeContractData({
      execution_unit: 'discover',
      expectations: {
        agent: 'discover-orchestrator',
        presentation: null
      }
    });
    checkDelegation(discoverContract, 'discover', 'discover-orchestrator');
  });
});

// ---------------------------------------------------------------------------
// CC-ART: checkArtifacts Tests (FR-003, AC-003-02, FR-006, AC-006-02)
// ---------------------------------------------------------------------------

describe('checkArtifacts', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'cc-art-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('CC-ART-01: All expected artifacts exist on disk passes', () => {
    const docsDir = join(tempDir, 'docs', 'REQ-X');
    mkdirSync(docsDir, { recursive: true });
    writeFileSync(join(docsDir, 'requirements-spec.md'), 'content');
    writeFileSync(join(docsDir, 'architecture-overview.md'), 'content');

    const contractData = makeContractData({
      expectations: {
        artifacts_produced: [
          'docs/REQ-X/requirements-spec.md',
          'docs/REQ-X/architecture-overview.md'
        ],
        presentation: null
      }
    });
    checkArtifacts(contractData, 'REQ-X', tempDir);
  });

  it('CC-ART-02: Missing artifact on disk throws', () => {
    const contractData = makeContractData({
      expectations: {
        artifacts_produced: ['docs/REQ-X/requirements-spec.md'],
        presentation: null
      }
    });
    assert.throws(
      () => checkArtifacts(contractData, 'REQ-X', tempDir),
      (err) => {
        assert.ok(err instanceof ContractViolationError);
        assert.equal(err.decisionPoint, 'artifacts');
        assert.ok(err.actual.includes('requirements-spec.md'));
        return true;
      }
    );
  });

  it('CC-ART-03: {artifact_folder} placeholder resolved correctly', () => {
    const docsDir = join(tempDir, 'docs', 'requirements', 'REQ-GH-213-test');
    mkdirSync(docsDir, { recursive: true });
    writeFileSync(join(docsDir, 'requirements-spec.md'), 'content');

    const contractData = makeContractData({
      expectations: {
        artifacts_produced: ['docs/requirements/{artifact_folder}/requirements-spec.md'],
        presentation: null
      }
    });
    checkArtifacts(contractData, 'REQ-GH-213-test', tempDir);
  });

  it('CC-ART-04: Empty artifacts_produced is no-op', () => {
    const contractData = makeContractData({
      expectations: {
        artifacts_produced: [],
        presentation: null
      }
    });
    checkArtifacts(contractData, 'REQ-X', tempDir);
  });

  it('CC-ART-05: Null contractData is no-op (fail-open)', () => {
    checkArtifacts(null, 'REQ-X', tempDir);
    checkArtifacts(undefined, 'REQ-X', tempDir);
  });

  it('CC-ART-06: Discover contract artifacts validated same as feature', () => {
    const docsDir = join(tempDir, 'docs', 'discover');
    mkdirSync(docsDir, { recursive: true });
    writeFileSync(join(docsDir, 'state.json'), '{}');

    const discoverContract = makeContractData({
      execution_unit: 'discover',
      expectations: {
        artifacts_produced: ['docs/discover/state.json'],
        presentation: null
      }
    });
    checkArtifacts(discoverContract, 'discover', tempDir);
  });
});

// ---------------------------------------------------------------------------
// CC-TL: checkTaskList Tests (FR-004, AC-004-05, AC-004-06)
// ---------------------------------------------------------------------------

describe('checkTaskList', () => {
  const tasksTemplate = {
    domain: 'tasks',
    version: '1.0.0',
    format: {
      format_type: 'table',
      required_phases: ['05', '06', '16', '08'],
      required_task_categories: {
        '05': ['test_case_design'],
        '06': ['setup', 'core_implementation', 'unit_tests', 'wiring_claude', 'wiring_codex', 'cleanup']
      },
      required_task_metadata: ['traces', 'files', 'blocked_by', 'blocks'],
      required_sections: ['progress_summary', 'dependency_graph', 'traceability_matrix']
    }
  };

  it('CC-TL-01: Task plan with all required phases passes', () => {
    const taskPlan = makeTaskPlan();
    checkTaskList(tasksTemplate, taskPlan);
  });

  it('CC-TL-02: Missing required phase throws', () => {
    const taskPlan = makeTaskPlan({
      phases: {
        '05': { categories: ['test_case_design'] },
        '06': { categories: ['setup', 'core_implementation', 'unit_tests', 'wiring_claude', 'wiring_codex', 'cleanup'] },
        '16': { categories: ['test_execution', 'parity_verification'] }
        // Missing '08'
      }
    });
    assert.throws(
      () => checkTaskList(tasksTemplate, taskPlan),
      (err) => {
        assert.ok(err instanceof ContractViolationError);
        assert.equal(err.decisionPoint, 'task_list');
        assert.ok(err.actual.includes('08'));
        return true;
      }
    );
  });

  it('CC-TL-03: All required task categories present in each phase passes', () => {
    const taskPlan = makeTaskPlan();
    checkTaskList(tasksTemplate, taskPlan);
  });

  it('CC-TL-04: Missing task category throws', () => {
    const taskPlan = makeTaskPlan({
      phases: {
        '05': { categories: ['test_case_design'] },
        '06': { categories: ['setup', 'core_implementation'] }, // Missing unit_tests, wiring_*, cleanup
        '16': { categories: ['test_execution', 'parity_verification'] },
        '08': { categories: ['constitutional_review', 'dual_file_check'] }
      }
    });
    assert.throws(
      () => checkTaskList(tasksTemplate, taskPlan),
      (err) => {
        assert.ok(err instanceof ContractViolationError);
        assert.ok(err.actual.includes('unit_tests'));
        return true;
      }
    );
  });

  it('CC-TL-05: Each task has required metadata (traces, files, blocked_by) passes', () => {
    const taskPlan = makeTaskPlan();
    checkTaskList(tasksTemplate, taskPlan);
  });

  it('CC-TL-06: Task missing traces metadata throws', () => {
    const taskPlan = makeTaskPlan({
      tasks: [
        { id: 'T0001', files: 'test.js (CREATE)', blocked_by: 'none', blocks: 'T0002' }
        // Missing 'traces'
      ]
    });
    assert.throws(
      () => checkTaskList(tasksTemplate, taskPlan),
      (err) => {
        assert.ok(err instanceof ContractViolationError);
        assert.ok(err.actual.includes('traces'));
        return true;
      }
    );
  });

  it('CC-TL-07: Task missing files metadata throws', () => {
    const taskPlan = makeTaskPlan({
      tasks: [
        { id: 'T0001', traces: 'FR-001', blocked_by: 'none', blocks: 'T0002' }
        // Missing 'files'
      ]
    });
    assert.throws(
      () => checkTaskList(tasksTemplate, taskPlan),
      (err) => {
        assert.ok(err instanceof ContractViolationError);
        assert.ok(err.actual.includes('files'));
        return true;
      }
    );
  });

  it('CC-TL-08: Required sections (progress_summary, dependency_graph, traceability_matrix) present passes', () => {
    const taskPlan = makeTaskPlan();
    checkTaskList(tasksTemplate, taskPlan);
  });

  it('CC-TL-09: Null templateData is no-op (fail-open)', () => {
    checkTaskList(null, makeTaskPlan());
    checkTaskList(undefined, makeTaskPlan());
  });

  it('CC-TL-10: Null taskPlan with valid template throws', () => {
    const template = {
      domain: 'tasks',
      format: { required_phases: ['06'] }
    };
    assert.throws(
      () => checkTaskList(template, null),
      (err) => {
        assert.ok(err instanceof ContractViolationError);
        assert.equal(err.decisionPoint, 'task_list');
        assert.ok(err.actual.includes('null'));
        return true;
      }
    );
  });

  it('CC-TL-11: Missing required sections throws', () => {
    const template = {
      domain: 'tasks',
      format: {
        required_sections: ['progress_summary', 'dependency_graph']
      }
    };
    const taskPlan = makeTaskPlan({
      sections: ['progress_summary'] // missing dependency_graph
    });
    assert.throws(
      () => checkTaskList(template, taskPlan),
      (err) => {
        assert.ok(err instanceof ContractViolationError);
        assert.ok(err.actual.includes('dependency_graph'));
        return true;
      }
    );
  });

  it('CC-TL-12: Template with no format field is no-op', () => {
    checkTaskList({ domain: 'tasks' }, makeTaskPlan());
  });
});

// ---------------------------------------------------------------------------
// PERF-CC: Performance Tests (<50ms budget per check)
// ---------------------------------------------------------------------------

describe('Performance checks (<50ms budget)', () => {
  it('PERF-CC-01: checkDomainTransition completes in <50ms', () => {
    const contractData = makeContractData();
    // Warm up
    checkDomainTransition(contractData, 'requirements', 0);
    const start = performance.now();
    checkDomainTransition(contractData, 'requirements', 0);
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 50, `Took ${elapsed}ms, expected <50ms`);
  });

  it('PERF-CC-02: checkBatchWrite completes in <50ms', () => {
    const contractData = makeContractData();
    const paths = ['docs/REQ-X/requirements-spec.md', 'docs/REQ-X/architecture-overview.md'];
    checkBatchWrite(contractData, paths, 'REQ-X');
    const start = performance.now();
    checkBatchWrite(contractData, paths, 'REQ-X');
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 50, `Took ${elapsed}ms, expected <50ms`);
  });

  it('PERF-CC-03: checkPersonaFormat completes in <50ms', () => {
    const template = makeTemplateData();
    const output = '## functional_requirements\n- Item\n## assumptions\n- Assumption';
    checkPersonaFormat(template, output);
    const start = performance.now();
    checkPersonaFormat(template, output);
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 50, `Took ${elapsed}ms, expected <50ms`);
  });

  it('PERF-CC-04: checkPersonaContribution completes in <50ms', () => {
    const configured = ['Maya', 'Alex', 'Jordan'];
    const contributed = ['Maya', 'Alex', 'Jordan'];
    checkPersonaContribution(configured, contributed);
    const start = performance.now();
    checkPersonaContribution(configured, contributed);
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 50, `Took ${elapsed}ms, expected <50ms`);
  });

  it('PERF-CC-05: checkDelegation completes in <50ms', () => {
    const contractData = makeContractData();
    checkDelegation(contractData, '06-implementation', 'software-developer');
    const start = performance.now();
    checkDelegation(contractData, '06-implementation', 'software-developer');
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 50, `Took ${elapsed}ms, expected <50ms`);
  });

  it('PERF-CC-06: checkArtifacts completes in <50ms', () => {
    const contractData = makeContractData({
      expectations: { artifacts_produced: [], presentation: null }
    });
    checkArtifacts(contractData, 'REQ-X', '.');
    const start = performance.now();
    checkArtifacts(contractData, 'REQ-X', '.');
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 50, `Took ${elapsed}ms, expected <50ms`);
  });

  it('PERF-CC-07: checkTaskList completes in <50ms', () => {
    const template = {
      domain: 'tasks',
      format: {
        required_phases: ['05', '06'],
        required_task_categories: { '05': ['test'] },
        required_task_metadata: ['traces'],
        required_sections: ['progress_summary']
      }
    };
    const plan = {
      phases: { '05': { categories: ['test'] }, '06': { categories: [] } },
      tasks: [{ id: 'T1', traces: 'FR-001' }],
      sections: ['progress_summary']
    };
    checkTaskList(template, plan);
    const start = performance.now();
    checkTaskList(template, plan);
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 50, `Took ${elapsed}ms, expected <50ms`);
  });
});
