/**
 * Prompt Content Verification Tests: REQ-0006 Parallel Test Execution
 *
 * These tests verify that agent .md files contain the required parallel
 * execution instructions per the requirements specification (6 FRs, 22 ACs).
 *
 * Test runner: node:test (Article II)
 * Test approach: Read .md files, assert content patterns
 *
 * Traces to: REQ-0006-parallel-test-execution
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Test constants from test-data-plan.md
const PROJECT_ROOT = join(import.meta.dirname, '..', '..');
const AGENTS_DIR = join(PROJECT_ROOT, 'src', 'claude', 'agents');
const HOOKS_DIR = join(PROJECT_ROOT, 'src', 'claude', 'hooks');

const EXECUTION_AGENTS = [
  '05-software-developer.md',
  '06-integration-tester.md',
  '10-dev-environment-engineer.md',
  '16-quality-loop-engineer.md'
];

const FALLBACK_AGENTS = [
  '05-software-developer.md',
  '06-integration-tester.md',
  '16-quality-loop-engineer.md'
];

const STATE_TRACKING_AGENTS = [
  '05-software-developer.md',
  '06-integration-tester.md',
  '16-quality-loop-engineer.md'
];

const CREATION_AGENT = '04-test-design-engineer.md';

const REQUIRED_FRAMEWORKS = ['Jest', 'Vitest', 'pytest', 'node:test', 'Cargo'];
const GO_TEST_PATTERN = /[Gg]o\s+test/;
const JUNIT_PATTERN = /JUnit|Maven/;

// Helper: read agent file content
function readAgent(filename) {
  return readFileSync(join(AGENTS_DIR, filename), 'utf-8');
}

// =============================================================================
// TC-01: Framework Detection Lookup Table
// Traces to: FR-01, AC-01.1, AC-01.2, AC-01.3, AC-02.5
// =============================================================================

describe('TC-01: Framework Detection Lookup Table', () => {

  // TC-01.1: All 7 frameworks present in execution agents
  it('TC-01.1: All 7 frameworks present in all 4 execution agents', () => {
    for (const agentFile of EXECUTION_AGENTS) {
      const content = readAgent(agentFile);

      for (const framework of REQUIRED_FRAMEWORKS) {
        assert.ok(
          content.includes(framework),
          `${agentFile} must include ${framework} in framework table`
        );
      }

      // Go test (case-insensitive pattern)
      assert.ok(
        GO_TEST_PATTERN.test(content),
        `${agentFile} must include Go test in framework table`
      );

      // JUnit/Maven
      assert.ok(
        JUNIT_PATTERN.test(content),
        `${agentFile} must include JUnit/Maven in framework table`
      );
    }
  });

  // TC-01.2: Correct parallel flags per framework
  it('TC-01.2: Correct parallel flags per framework in Agent 05', () => {
    const content = readAgent('05-software-developer.md');

    // Jest: --maxWorkers or --workers
    assert.ok(
      content.includes('--maxWorkers') || content.includes('--workers'),
      'Jest parallel flag must be --maxWorkers or --workers'
    );

    // Vitest: --pool=threads or --threads
    assert.ok(
      content.includes('--pool=threads') || content.includes('--threads'),
      'Vitest parallel flag must reference threads'
    );

    // pytest: -n auto
    assert.ok(
      content.includes('-n auto'),
      'pytest parallel flag must be -n auto'
    );

    // Go test: -parallel
    assert.ok(
      content.includes('-parallel'),
      'Go test parallel flag must be -parallel'
    );

    // node:test: --test-concurrency
    assert.ok(
      content.includes('--test-concurrency'),
      'node:test parallel flag must be --test-concurrency'
    );

    // Cargo test: --test-threads
    assert.ok(
      content.includes('--test-threads'),
      'Cargo test parallel flag must be --test-threads'
    );
  });

  // TC-01.3: Sequential fallback for unrecognized frameworks
  it('TC-01.3: Sequential fallback instruction for unrecognized frameworks', () => {
    const content = readAgent('05-software-developer.md');
    assert.ok(
      content.includes('sequential') && content.includes('fallback'),
      'Agent must include sequential fallback instructions for unrecognized frameworks'
    );
  });
});

// =============================================================================
// TC-02: Agent Prompt Updates
// Traces to: FR-02, AC-02.1, AC-02.2, AC-02.3, AC-02.4, AC-02.5
// =============================================================================

describe('TC-02: Agent Prompt Updates', () => {

  // TC-02.1: Environment builder includes parallel flag
  it('TC-02.1: Agent 10 has parallel test execution instructions', () => {
    const content = readAgent('10-dev-environment-engineer.md');
    assert.ok(
      content.toLowerCase().includes('parallel') && content.includes('test'),
      'Agent 10 must include parallel test execution instructions'
    );
  });

  // TC-02.2: Integration tester includes parallel flag
  it('TC-02.2: Agent 06 has parallel execution for integration/E2E tests', () => {
    const content = readAgent('06-integration-tester.md');
    assert.ok(
      content.toLowerCase().includes('parallel') &&
      (content.includes('integration') || content.includes('E2E') || content.includes('e2e')),
      'Agent 06 must include parallel execution for integration/E2E tests'
    );
  });

  // TC-02.3: Quality loop engineer includes parallel flag in Track A
  it('TC-02.3: Agent 16 has parallel execution in Track A', () => {
    const content = readAgent('16-quality-loop-engineer.md');
    assert.ok(
      content.toLowerCase().includes('parallel') && content.includes('Track A'),
      'Agent 16 must include parallel execution in Track A'
    );
  });

  // TC-02.4: Software developer includes parallel flag
  it('TC-02.4: Agent 05 has parallel test execution instructions', () => {
    const content = readAgent('05-software-developer.md');
    assert.ok(
      content.toLowerCase().includes('parallel') && content.includes('test'),
      'Agent 05 must include parallel test execution instructions'
    );
  });

  // TC-02.5: All 4 execution agents include the lookup table
  // This is covered by TC-01.1
});

// =============================================================================
// TC-03: CPU Core Detection
// Traces to: FR-03, AC-03.1, AC-03.2, AC-03.3, AC-03.4
// =============================================================================

describe('TC-03: CPU Core Detection', () => {

  // TC-03.1: CPU core detection instruction present
  it('TC-03.1: CPU core detection instructions in Agent 05', () => {
    const content = readAgent('05-software-developer.md');
    assert.ok(
      content.includes('nproc') || content.includes('sysctl') ||
      content.includes('os.cpus()') || content.toLowerCase().includes('cpu') ||
      content.toLowerCase().includes('core'),
      'Agent must include CPU core detection instructions'
    );
  });

  // TC-03.2: Default parallelism formula documented
  it('TC-03.2: Parallelism formula (cores - 1) documented', () => {
    const content = readAgent('05-software-developer.md');
    assert.ok(
      content.includes('cores - 1') || content.includes('cores-1') ||
      content.includes('N-1') || content.includes('N - 1'),
      'Agent must document parallelism formula (cores - 1)'
    );
  });

  // TC-03.3: node:test concurrency flag documented
  it('TC-03.3: --test-concurrency flag for node:test', () => {
    const content = readAgent('05-software-developer.md');
    assert.ok(
      content.includes('--test-concurrency'),
      'Agent must include --test-concurrency for node:test'
    );
  });

  // TC-03.4: Auto mode preference documented
  it('TC-03.4: Auto mode preference for frameworks that support it', () => {
    const content = readAgent('05-software-developer.md');
    assert.ok(
      content.includes('auto') &&
      (content.includes('prefer') || content.includes('Prefer') || content.includes('default')),
      'Agent must prefer auto mode for frameworks that support it'
    );
  });
});

// =============================================================================
// TC-04: Sequential Fallback on Failure
// Traces to: FR-04, AC-04.1, AC-04.2, AC-04.3, AC-04.4
// =============================================================================

describe('TC-04: Sequential Fallback on Failure', () => {

  // TC-04.1: Sequential retry for failed parallel tests
  it('TC-04.1: Sequential retry instructions in all 3 fallback agents', () => {
    for (const agentFile of FALLBACK_AGENTS) {
      const content = readAgent(agentFile);
      assert.ok(
        content.includes('retry') || content.includes('re-run') || content.includes('rerun'),
        `${agentFile} must include sequential retry instructions`
      );
      assert.ok(
        content.includes('sequential'),
        `${agentFile} must mention sequential fallback`
      );
    }
  });

  // TC-04.2: Flakiness warning logged
  it('TC-04.2: Flakiness warning instruction in Agent 05', () => {
    const content = readAgent('05-software-developer.md');
    assert.ok(
      content.toLowerCase().includes('flak') && content.toLowerCase().includes('warn'),
      'Agent must include flakiness warning instructions'
    );
  });

  // TC-04.3: Flakiness in state.json
  it('TC-04.3: flaky_tests field in state tracking schema', () => {
    const content = readAgent('05-software-developer.md');
    assert.ok(
      content.includes('flaky_tests'),
      'Agent must include flaky_tests field in state tracking schema'
    );
  });

  // TC-04.4: Only failed tests re-run
  it('TC-04.4: Only failing tests re-run, with framework-specific flags', () => {
    const content = readAgent('05-software-developer.md');
    assert.ok(
      (content.includes('only') || content.includes('Only')) &&
      (content.includes('fail') || content.includes('Fail')),
      'Agent must instruct to re-run only the failing tests'
    );
    // Verify framework-specific failure re-run commands
    assert.ok(
      content.includes('--onlyFailures') || content.includes('--lastFailed') || content.includes('--lf'),
      'Agent must include framework-specific failure re-run flags'
    );
  });
});

// =============================================================================
// TC-05: Parallel Test Creation (T4-A)
// Traces to: FR-05, AC-05.1, AC-05.2, AC-05.3, AC-05.4
// =============================================================================

describe('TC-05: Parallel Test Creation (T4-A)', () => {

  // TC-05.1: Parallel sub-agent threshold documented
  it('TC-05.1: 10+ module threshold and sub-agent creation instructions', () => {
    const content = readAgent(CREATION_AGENT);
    assert.ok(
      content.includes('10'),
      'Agent must document the 10+ module threshold'
    );
    assert.ok(
      content.toLowerCase().includes('parallel') &&
      content.toLowerCase().includes('sub-agent'),
      'Agent must include parallel sub-agent creation instructions'
    );
  });

  // TC-05.2: Independent module test generation
  it('TC-05.2: Sub-agents work independently per module', () => {
    const content = readAgent(CREATION_AGENT);
    assert.ok(
      content.includes('independent') || content.includes('independently'),
      'Agent must instruct sub-agents to work independently per module'
    );
  });

  // TC-05.3: Cross-module conflict resolution
  it('TC-05.3: Conflict resolution instructions', () => {
    const content = readAgent(CREATION_AGENT);
    assert.ok(
      content.includes('consolidat') || content.includes('conflict') || content.includes('resolv'),
      'Agent must include conflict resolution instructions'
    );
  });

  // TC-05.4: Threshold is in prompt, not in hook
  // Note: hook count is environmental and tracks framework growth, not REQ-0006 parallel tests.
  it('TC-05.4: Threshold is in prompt, no new parallel logic in hooks', () => {
    const content = readAgent(CREATION_AGENT);
    assert.ok(
      content.includes('10'),
      'Threshold must be in agent prompt'
    );
    // Verify no hooks contain parallel test creation logic
    // We just check that hook count is unchanged (no new hooks added)
    const hookFiles = readdirSync(HOOKS_DIR)
      .filter(f => f.endsWith('.cjs') && !f.includes('.test.'));
    assert.equal(
      hookFiles.length, 37,
      `Expected 37 hook files, found ${hookFiles.length}`
    );
  });
});

// =============================================================================
// TC-06: State Tracking
// Traces to: FR-06, AC-06.1, AC-06.2, AC-06.3
// =============================================================================

describe('TC-06: State Tracking', () => {

  // TC-06.1: parallel_execution field schema
  it('TC-06.1: parallel_execution schema in all 3 state tracking agents', () => {
    for (const agentFile of STATE_TRACKING_AGENTS) {
      const content = readAgent(agentFile);
      assert.ok(
        content.includes('parallel_execution'),
        `${agentFile} must include parallel_execution field`
      );
      assert.ok(
        content.includes('"enabled"') || content.includes('enabled'),
        `${agentFile} must include enabled field in parallel_execution`
      );
      assert.ok(
        content.includes('"framework"') || content.includes('framework'),
        `${agentFile} must include framework field`
      );
    }
  });

  // TC-06.2: Fallback fields in state schema
  it('TC-06.2: fallback_triggered and flaky_tests fields in Agent 05', () => {
    const content = readAgent('05-software-developer.md');
    assert.ok(
      content.includes('fallback_triggered'),
      'Agent must include fallback_triggered field'
    );
    assert.ok(
      content.includes('flaky_tests'),
      'Agent must include flaky_tests field'
    );
  });

  // TC-06.3: Quality report parallel execution section
  it('TC-06.3: Parallel Execution section in quality report instructions', () => {
    const content = readAgent('16-quality-loop-engineer.md');
    assert.ok(
      content.includes('Parallel Execution') &&
      (content.toLowerCase().includes('quality') || content.toLowerCase().includes('report')),
      'Agent 16 must instruct to include Parallel Execution section in quality report'
    );
  });
});

// =============================================================================
// TC-07: Cross-Agent Consistency
// Traces to: FR-01 (consistency), FR-02 (consistency), NFR-04
// =============================================================================

describe('TC-07: Cross-Agent Consistency', () => {

  // TC-07.1: Framework detection table identical across agents
  it('TC-07.1: All 7 frameworks present in all 4 execution agents', () => {
    const frameworks = ['Jest', 'Vitest', 'pytest', 'node:test', 'Cargo'];

    for (const framework of frameworks) {
      const counts = EXECUTION_AGENTS.filter(a => readAgent(a).includes(framework)).length;
      assert.equal(
        counts, 4,
        `Framework ${framework} must appear in all 4 execution agents (found in ${counts})`
      );
    }

    // Go test pattern
    const goCount = EXECUTION_AGENTS.filter(a => GO_TEST_PATTERN.test(readAgent(a))).length;
    assert.equal(goCount, 4, `Go test must appear in all 4 execution agents (found in ${goCount})`);

    // JUnit/Maven
    const junitCount = EXECUTION_AGENTS.filter(a => JUNIT_PATTERN.test(readAgent(a))).length;
    assert.equal(junitCount, 4, `JUnit/Maven must appear in all 4 execution agents (found in ${junitCount})`);
  });

  // TC-07.2: No new hooks added (Article XII compliance)
  // Note: hook count is environmental and tracks framework growth, not REQ-0006 parallel tests.
  it('TC-07.2: No new hooks added (Article XII)', () => {
    const hookFiles = readdirSync(HOOKS_DIR)
      .filter(f => f.endsWith('.cjs') && !f.includes('.test.'));
    assert.equal(
      hookFiles.length, 37,
      `Expected 37 hook files, found ${hookFiles.length}`
    );
  });

  // TC-07.3: No new dependencies added (Article V compliance)
  // Note: dependency list is environmental and tracks framework growth, not REQ-0006 parallel tests.
  it('TC-07.3: No new dependencies added (Article V)', () => {
    const pkg = JSON.parse(readFileSync(join(PROJECT_ROOT, 'package.json'), 'utf-8'));
    const deps = Object.keys(pkg.dependencies || {}).sort();
    assert.deepStrictEqual(
      deps,
      ['chalk', 'fs-extra', 'js-yaml', 'onnxruntime-node', 'prompts', 'semver'],
      'Runtime dependencies must remain stable as snapshot'
    );
  });
});

// =============================================================================
// TC-08: ATDD Mode Exclusion
// Traces to: Impact Analysis risk recommendation #4
// =============================================================================

describe('TC-08: ATDD Mode Exclusion', () => {

  // TC-08.1: ATDD exclusion note present
  it('TC-08.1: ATDD exclusion note in agents 05 and 06', () => {
    for (const agentFile of ['05-software-developer.md', '06-integration-tester.md']) {
      const content = readAgent(agentFile);
      // The content should mention ATDD in the context of parallel execution
      // and indicate sequential behavior for ATDD mode
      assert.ok(
        content.includes('ATDD') &&
        (content.includes('sequential') || content.includes('disable') || content.includes('not')),
        `${agentFile} must note ATDD mode uses sequential execution`
      );
    }
  });
});
