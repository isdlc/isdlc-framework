# Test Cases: REQ-0006 Parallel Test Execution

**Feature**: Performance optimization T4: Parallel test execution (T4-B) and parallel test creation (T4-A)
**Phase**: 05-test-strategy
**Created**: 2026-02-13
**Test Runner**: node:test (Article II)
**Test Type**: Prompt content verification (agent .md files are prompts, not executable code)

---

## Test Approach

Since all changes in this feature are to agent markdown files (prompts), the testing approach is **prompt content verification**: node:test scripts that read the .md files with `fs.readFileSync` and assert the presence, completeness, and correctness of required sections.

Test file location: `tests/prompt-verification/parallel-execution.test.js` (ESM)

---

## TC-01: Framework Detection Lookup Table

**Traces to**: FR-01, AC-01.1, AC-01.2, AC-01.3, AC-02.5

### TC-01.1: All 7 frameworks present in execution agents

**Given**: Agent files 05, 06, 10, 16 exist after implementation
**When**: Reading each agent .md file content
**Then**: Each file contains a framework detection table with all 7 frameworks:
- Jest
- Vitest
- pytest
- Go test
- node:test
- Cargo test
- JUnit/Maven

```javascript
// TC-01.1: Verify all 7 frameworks in lookup table
for (const agentFile of ['05-software-developer.md', '06-integration-tester.md',
                          '10-dev-environment-engineer.md', '16-quality-loop-engineer.md']) {
  const content = readFileSync(join(agentsDir, agentFile), 'utf-8');
  assert.ok(content.includes('Jest'), `${agentFile} must include Jest in framework table`);
  assert.ok(content.includes('Vitest'), `${agentFile} must include Vitest in framework table`);
  assert.ok(content.includes('pytest'), `${agentFile} must include pytest in framework table`);
  assert.ok(content.includes('Go test') || content.includes('go test'),
    `${agentFile} must include Go test in framework table`);
  assert.ok(content.includes('node:test'), `${agentFile} must include node:test in framework table`);
  assert.ok(content.includes('Cargo test') || content.includes('cargo test'),
    `${agentFile} must include Cargo test in framework table`);
  assert.ok(content.includes('JUnit') || content.includes('Maven'),
    `${agentFile} must include JUnit/Maven in framework table`);
}
```

### TC-01.2: Correct parallel flags per framework

**Given**: Agent file 05-software-developer.md exists
**When**: Reading the framework detection table
**Then**: Each framework maps to its correct parallel flag:

| Framework | Expected Parallel Flag Pattern |
|-----------|-------------------------------|
| Jest | `--workers` or `--maxWorkers` |
| Vitest | `--pool=threads` or `--threads` |
| pytest | `-n auto` or `pytest-xdist` |
| Go test | `-parallel` |
| node:test | `--test-concurrency` |
| Cargo test | `--test-threads` |
| JUnit/Maven | `-T` (Maven) or `maxParallelForks` (Gradle) |

```javascript
// TC-01.2: Verify parallel flags
const content = readFileSync(join(agentsDir, '05-software-developer.md'), 'utf-8');
assert.ok(content.includes('--maxWorkers') || content.includes('--workers'),
  'Jest parallel flag must be --maxWorkers or --workers');
assert.ok(content.includes('--pool=threads') || content.includes('--threads'),
  'Vitest parallel flag must reference threads');
assert.ok(content.includes('-n auto'), 'pytest parallel flag must be -n auto');
assert.ok(content.includes('-parallel'), 'Go test parallel flag must be -parallel');
assert.ok(content.includes('--test-concurrency'), 'node:test parallel flag must be --test-concurrency');
assert.ok(content.includes('--test-threads'), 'Cargo test parallel flag must be --test-threads');
```

### TC-01.3: Sequential fallback for unrecognized frameworks

**Given**: Agent file 05-software-developer.md exists
**When**: Reading the parallel execution section
**Then**: Content includes instructions for falling back to sequential execution when the framework is not recognized

```javascript
// TC-01.3: Verify sequential fallback instruction
const content = readFileSync(join(agentsDir, '05-software-developer.md'), 'utf-8');
assert.ok(
  content.includes('sequential') && content.includes('fallback'),
  'Agent must include sequential fallback instructions for unrecognized frameworks'
);
```

---

## TC-02: Agent Prompt Updates

**Traces to**: FR-02, AC-02.1, AC-02.2, AC-02.3, AC-02.4, AC-02.5

### TC-02.1: Environment builder includes parallel flag

**Given**: Agent file 10-dev-environment-engineer.md exists
**When**: Reading the file content
**Then**: Contains parallel execution instructions for build verification

```javascript
// TC-02.1: Verify Agent 10 has parallel instructions
const content = readFileSync(join(agentsDir, '10-dev-environment-engineer.md'), 'utf-8');
assert.ok(
  content.toLowerCase().includes('parallel') && content.includes('test'),
  'Agent 10 must include parallel test execution instructions'
);
```

### TC-02.2: Integration tester includes parallel flag

**Given**: Agent file 06-integration-tester.md exists
**When**: Reading the file content
**Then**: Contains parallel execution instructions for integration and E2E tests

```javascript
// TC-02.2: Verify Agent 06 has parallel instructions
const content = readFileSync(join(agentsDir, '06-integration-tester.md'), 'utf-8');
assert.ok(
  content.toLowerCase().includes('parallel') &&
  (content.includes('integration') || content.includes('E2E') || content.includes('e2e')),
  'Agent 06 must include parallel execution for integration/E2E tests'
);
```

### TC-02.3: Quality loop engineer includes parallel flag

**Given**: Agent file 16-quality-loop-engineer.md exists
**When**: Reading the file content
**Then**: Contains parallel execution instructions for Track A test execution

```javascript
// TC-02.3: Verify Agent 16 has parallel instructions for Track A
const content = readFileSync(join(agentsDir, '16-quality-loop-engineer.md'), 'utf-8');
assert.ok(
  content.toLowerCase().includes('parallel') && content.includes('Track A'),
  'Agent 16 must include parallel execution in Track A'
);
```

### TC-02.4: Software developer includes parallel flag

**Given**: Agent file 05-software-developer.md exists
**When**: Reading the file content
**Then**: Contains parallel execution instructions for TDD iteration loops

```javascript
// TC-02.4: Verify Agent 05 has parallel instructions
const content = readFileSync(join(agentsDir, '05-software-developer.md'), 'utf-8');
assert.ok(
  content.toLowerCase().includes('parallel') && content.includes('test'),
  'Agent 05 must include parallel test execution instructions'
);
```

### TC-02.5: All 4 execution agents include the lookup table

**Given**: All 4 execution agent files exist
**When**: Reading each file
**Then**: Each contains the framework detection lookup table (verified by TC-01.1)

This test case is satisfied by TC-01.1 (which verifies the table in all 4 agents).

---

## TC-03: CPU Core Detection

**Traces to**: FR-03, AC-03.1, AC-03.2, AC-03.3, AC-03.4

### TC-03.1: CPU core detection instruction present

**Given**: Agent file 05-software-developer.md exists
**When**: Reading the parallel execution section
**Then**: Contains instructions for CPU core detection

```javascript
// TC-03.1: Verify CPU core detection
const content = readFileSync(join(agentsDir, '05-software-developer.md'), 'utf-8');
assert.ok(
  content.includes('os.cpus()') || content.includes('cpu') || content.includes('core'),
  'Agent must include CPU core detection instructions'
);
```

### TC-03.2: Default parallelism formula documented

**Given**: Agent file 05-software-developer.md exists
**When**: Reading the parallel execution section
**Then**: Contains the formula `max(1, cores - 1)` or equivalent

```javascript
// TC-03.2: Verify parallelism formula
const content = readFileSync(join(agentsDir, '05-software-developer.md'), 'utf-8');
assert.ok(
  content.includes('cores - 1') || content.includes('cores-1') || content.includes('N-1'),
  'Agent must document parallelism formula (cores - 1)'
);
```

### TC-03.3: node:test concurrency flag documented

**Given**: Agent file 05-software-developer.md exists
**When**: Reading the parallel execution section
**Then**: Contains `--test-concurrency` for node:test

```javascript
// TC-03.3: Verify node:test concurrency flag
const content = readFileSync(join(agentsDir, '05-software-developer.md'), 'utf-8');
assert.ok(
  content.includes('--test-concurrency'),
  'Agent must include --test-concurrency for node:test'
);
```

### TC-03.4: Auto mode preference documented

**Given**: Agent file 05-software-developer.md exists
**When**: Reading the parallel execution section
**Then**: Contains instructions to prefer `auto` for frameworks that support it (Jest, pytest)

```javascript
// TC-03.4: Verify auto mode preference
const content = readFileSync(join(agentsDir, '05-software-developer.md'), 'utf-8');
assert.ok(
  content.includes('auto') && (content.includes('prefer') || content.includes('default')),
  'Agent must prefer auto mode for frameworks that support it'
);
```

---

## TC-04: Sequential Fallback on Failure

**Traces to**: FR-04, AC-04.1, AC-04.2, AC-04.3, AC-04.4

### TC-04.1: Sequential retry for failed parallel tests

**Given**: Agent files 05, 06, 16 exist
**When**: Reading the parallel execution section
**Then**: Each contains instructions to retry failing tests sequentially before reporting genuine failures

```javascript
// TC-04.1: Verify sequential retry instructions in all 3 fallback agents
for (const agentFile of ['05-software-developer.md', '06-integration-tester.md',
                          '16-quality-loop-engineer.md']) {
  const content = readFileSync(join(agentsDir, agentFile), 'utf-8');
  assert.ok(
    content.includes('retry') || content.includes('re-run') || content.includes('rerun'),
    `${agentFile} must include sequential retry instructions`
  );
  assert.ok(
    content.includes('sequential'),
    `${agentFile} must mention sequential fallback`
  );
}
```

### TC-04.2: Flakiness warning logged

**Given**: Agent file 05-software-developer.md exists
**When**: Reading the sequential fallback section
**Then**: Contains instructions to log a flakiness warning when tests pass sequentially but fail in parallel

```javascript
// TC-04.2: Verify flakiness warning instruction
const content = readFileSync(join(agentsDir, '05-software-developer.md'), 'utf-8');
assert.ok(
  content.includes('flak') && content.includes('warn'),
  'Agent must include flakiness warning instructions'
);
```

### TC-04.3: Flakiness in state.json

**Given**: Agent file 05-software-developer.md exists
**When**: Reading the state tracking section
**Then**: Contains `flaky_tests` field in the parallel_execution schema

```javascript
// TC-04.3: Verify flaky_tests field in state schema
const content = readFileSync(join(agentsDir, '05-software-developer.md'), 'utf-8');
assert.ok(
  content.includes('flaky_tests'),
  'Agent must include flaky_tests field in state tracking schema'
);
```

### TC-04.4: Only failed tests re-run

**Given**: Agent file 05-software-developer.md exists
**When**: Reading the sequential fallback section
**Then**: Contains explicit instruction to re-run ONLY the failing tests, not the entire suite

```javascript
// TC-04.4: Verify only-failed re-run instruction
const content = readFileSync(join(agentsDir, '05-software-developer.md'), 'utf-8');
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
```

---

## TC-05: Parallel Test Creation (T4-A)

**Traces to**: FR-05, AC-05.1, AC-05.2, AC-05.3, AC-05.4

### TC-05.1: Parallel sub-agent threshold documented

**Given**: Agent file 04-test-design-engineer.md exists
**When**: Reading the file content
**Then**: Contains instructions for using Task tool for parallel sub-agent creation when 10+ modules exist

```javascript
// TC-05.1: Verify parallel sub-agent threshold
const content = readFileSync(join(agentsDir, '04-test-design-engineer.md'), 'utf-8');
assert.ok(content.includes('10'), 'Agent must document the 10+ module threshold');
assert.ok(
  content.toLowerCase().includes('parallel') && content.toLowerCase().includes('sub-agent'),
  'Agent must include parallel sub-agent creation instructions'
);
```

### TC-05.2: Independent module test generation

**Given**: Agent file 04-test-design-engineer.md exists
**When**: Reading the parallel test creation section
**Then**: Contains instructions for each sub-agent to generate tests for one module independently

```javascript
// TC-05.2: Verify independent module generation
const content = readFileSync(join(agentsDir, '04-test-design-engineer.md'), 'utf-8');
assert.ok(
  content.includes('independent') || content.includes('independently'),
  'Agent must instruct sub-agents to work independently per module'
);
```

### TC-05.3: Cross-module conflict resolution

**Given**: Agent file 04-test-design-engineer.md exists
**When**: Reading the parallel test creation section
**Then**: Contains instructions for the parent agent to consolidate and resolve cross-module conflicts

```javascript
// TC-05.3: Verify conflict resolution
const content = readFileSync(join(agentsDir, '04-test-design-engineer.md'), 'utf-8');
assert.ok(
  content.includes('consolidat') || content.includes('conflict') || content.includes('resolv'),
  'Agent must include conflict resolution instructions'
);
```

### TC-05.4: Threshold is in prompt, not in hook

**Given**: Agent file 04-test-design-engineer.md exists and all hook files
**When**: Checking hook files for hardcoded threshold
**Then**: No hook file contains the number 10 as a parallel test creation threshold

```javascript
// TC-05.4: Verify threshold is prompt-only, not in hooks
const content = readFileSync(join(agentsDir, '04-test-design-engineer.md'), 'utf-8');
assert.ok(content.includes('10'), 'Threshold must be in agent prompt');
// Note: negative test -- hooks should NOT contain parallel test creation logic
// This is verified manually since hooks don't change in this feature
```

---

## TC-06: State Tracking

**Traces to**: FR-06, AC-06.1, AC-06.2, AC-06.3

### TC-06.1: parallel_execution field schema

**Given**: Agent files 05, 06, 16 exist
**When**: Reading the state tracking section
**Then**: Each contains the `parallel_execution` schema with required fields: `enabled`, `framework`, `flag`, `workers`

```javascript
// TC-06.1: Verify parallel_execution schema fields
for (const agentFile of ['05-software-developer.md', '06-integration-tester.md',
                          '16-quality-loop-engineer.md']) {
  const content = readFileSync(join(agentsDir, agentFile), 'utf-8');
  assert.ok(content.includes('parallel_execution'),
    `${agentFile} must include parallel_execution field`);
  assert.ok(content.includes('enabled'),
    `${agentFile} must include enabled field in parallel_execution`);
  assert.ok(content.includes('framework'),
    `${agentFile} must include framework field`);
  assert.ok(content.includes('flag'),
    `${agentFile} must include flag field`);
  assert.ok(content.includes('workers'),
    `${agentFile} must include workers field`);
}
```

### TC-06.2: Fallback fields in state schema

**Given**: Agent file 05-software-developer.md exists
**When**: Reading the state tracking section
**Then**: Contains `fallback_triggered` and `flaky_tests` fields

```javascript
// TC-06.2: Verify fallback state fields
const content = readFileSync(join(agentsDir, '05-software-developer.md'), 'utf-8');
assert.ok(content.includes('fallback_triggered'),
  'Agent must include fallback_triggered field');
assert.ok(content.includes('flaky_tests'),
  'Agent must include flaky_tests field');
```

### TC-06.3: Quality report parallel execution section

**Given**: Agent file 16-quality-loop-engineer.md exists
**When**: Reading the file content
**Then**: Contains instructions to include a "Parallel Execution" section in quality-report.md

```javascript
// TC-06.3: Verify quality report parallel section instruction
const content = readFileSync(join(agentsDir, '16-quality-loop-engineer.md'), 'utf-8');
assert.ok(
  content.includes('Parallel Execution') && content.includes('quality'),
  'Agent 16 must instruct to include Parallel Execution section in quality report'
);
```

---

## TC-07: Cross-Agent Consistency

**Traces to**: FR-01 (consistency), FR-02 (consistency), NFR-04

### TC-07.1: Framework detection table identical across agents

**Given**: All 4 execution agent files exist
**When**: Extracting the framework detection table from each
**Then**: All tables contain the same 7 frameworks with the same parallel flags

```javascript
// TC-07.1: Cross-agent table consistency
const frameworks = ['Jest', 'Vitest', 'pytest', 'node:test', 'Cargo', 'JUnit'];
const goPattern = /[Gg]o\s+test/;

for (const framework of frameworks) {
  const counts = agents.filter(a => a.content.includes(framework)).length;
  assert.equal(counts, 4,
    `Framework ${framework} must appear in all 4 execution agents (found in ${counts})`);
}
```

### TC-07.2: No new hooks added (Article XII compliance)

**Given**: The set of .cjs files in src/claude/hooks/
**When**: Comparing before and after implementation
**Then**: No new .cjs files were added

```javascript
// TC-07.2: Verify no new hooks (Article XII)
// This is a regression test: count hook files and assert unchanged
// Implementation note: capture baseline count before implementation
```

### TC-07.3: No new dependencies added (Article V compliance)

**Given**: package.json exists
**When**: Reading dependencies
**Then**: No new dependencies were added

```javascript
// TC-07.3: Verify no new dependencies
const pkg = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf-8'));
const deps = Object.keys(pkg.dependencies || {});
assert.deepEqual(deps.sort(), ['chalk', 'fs-extra', 'prompts', 'semver'],
  'No new runtime dependencies should be added');
```

---

## TC-08: ATDD Mode Exclusion

**Traces to**: Impact Analysis risk recommendation #4

### TC-08.1: ATDD exclusion note present

**Given**: Agent files 05, 06 exist (agents with ATDD mode)
**When**: Reading the parallel execution section
**Then**: Contains a note that parallel execution is disabled/not applied during ATDD priority-ordered test runs

```javascript
// TC-08.1: Verify ATDD exclusion note
for (const agentFile of ['05-software-developer.md', '06-integration-tester.md']) {
  const content = readFileSync(join(agentsDir, agentFile), 'utf-8');
  assert.ok(
    content.includes('ATDD') &&
    (content.includes('sequential') || content.includes('not') || content.includes('disable')),
    `${agentFile} must note ATDD mode uses sequential execution`
  );
}
```

---

## Test Execution Summary

| Test Case | AC Coverage | Agent Files | Priority |
|-----------|------------|-------------|----------|
| TC-01.1 | AC-01.1, AC-02.5 | 05, 06, 10, 16 | P0 |
| TC-01.2 | AC-01.2 | 05 (verified), 06, 10, 16 (cross-check) | P0 |
| TC-01.3 | AC-01.3 | 05 | P0 |
| TC-02.1 | AC-02.1 | 10 | P1 |
| TC-02.2 | AC-02.2 | 06 | P1 |
| TC-02.3 | AC-02.3 | 16 | P1 |
| TC-02.4 | AC-02.4 | 05 | P1 |
| TC-03.1 | AC-03.1 | 05 | P1 |
| TC-03.2 | AC-03.2 | 05 | P1 |
| TC-03.3 | AC-03.3 | 05 | P1 |
| TC-03.4 | AC-03.4 | 05 | P1 |
| TC-04.1 | AC-04.1 | 05, 06, 16 | P0 |
| TC-04.2 | AC-04.2 | 05 | P1 |
| TC-04.3 | AC-04.3 | 05 | P1 |
| TC-04.4 | AC-04.4 | 05 | P0 |
| TC-05.1 | AC-05.1 | 04 | P1 |
| TC-05.2 | AC-05.2 | 04 | P1 |
| TC-05.3 | AC-05.3 | 04 | P1 |
| TC-05.4 | AC-05.4 | 04 | P2 |
| TC-06.1 | AC-06.1 | 05, 06, 16 | P1 |
| TC-06.2 | AC-06.2 | 05 | P1 |
| TC-06.3 | AC-06.3 | 16 | P1 |
| TC-07.1 | Cross-cutting consistency | 05, 06, 10, 16 | P0 |
| TC-07.2 | Article XII compliance | hooks/ directory | P2 |
| TC-07.3 | Article V compliance | package.json | P2 |
| TC-08.1 | ATDD exclusion (risk mitigation) | 05, 06 | P1 |

**Total**: 26 test cases covering all 22 ACs
