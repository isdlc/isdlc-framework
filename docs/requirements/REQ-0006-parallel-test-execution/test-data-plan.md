# Test Data Plan: REQ-0006 Parallel Test Execution

**Feature**: Parallel test execution (T4-B) and parallel test creation (T4-A)
**Phase**: 05-test-strategy
**Created**: 2026-02-13

---

## 1. Test Data Strategy

Since all changes are to agent .md files (prompts, not executable code), test data consists of:

1. **Agent file paths** -- the 5 agent .md files being modified
2. **Expected content patterns** -- strings, regex, and structural patterns that must appear in the modified files
3. **Baseline counts** -- hook file counts and dependency lists for regression testing

No temporary directories, no JSON factories, no subprocess execution needed for prompt verification tests.

---

## 2. Agent File Paths (Test Constants)

```javascript
const AGENTS_DIR = 'src/claude/agents/';
const EXECUTION_AGENTS = [
  '05-software-developer.md',
  '06-integration-tester.md',
  '10-dev-environment-engineer.md',
  '16-quality-loop-engineer.md'
];
const CREATION_AGENT = '04-test-design-engineer.md';
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
```

---

## 3. Expected Content Patterns

### 3.1 Framework Detection Table (TC-01)

Each execution agent must contain these exact framework names:

```javascript
const REQUIRED_FRAMEWORKS = [
  'Jest',
  'Vitest',
  'pytest',
  'node:test',
  'Cargo',
  'JUnit'
];
const GO_TEST_PATTERN = /[Gg]o\s+test/;
```

### 3.2 Parallel Flag Patterns (TC-01.2)

```javascript
const PARALLEL_FLAGS = {
  jest: ['--maxWorkers', '--workers'],
  vitest: ['--pool=threads', '--threads'],
  pytest: ['-n auto', 'pytest-xdist'],
  goTest: ['-parallel'],
  nodeTest: ['--test-concurrency'],
  cargoTest: ['--test-threads'],
  junitMaven: ['-T', 'maxParallelForks']
};
```

### 3.3 Sequential Fallback Patterns (TC-04)

```javascript
const FALLBACK_PATTERNS = {
  retryKeywords: ['retry', 're-run', 'rerun'],
  sequentialKeyword: 'sequential',
  flakinessKeywords: ['flak', 'flaky', 'flakiness'],
  warningKeyword: 'warn',
  onlyFailedFlags: ['--onlyFailures', '--lastFailed', '--lf']
};
```

### 3.4 CPU Core Detection Patterns (TC-03)

```javascript
const CPU_PATTERNS = {
  detection: ['os.cpus()', 'cpu', 'core'],
  formula: ['cores - 1', 'cores-1', 'N-1'],
  nodeTestFlag: '--test-concurrency',
  autoPreference: ['auto', 'prefer']
};
```

### 3.5 State Tracking Schema Fields (TC-06)

```javascript
const STATE_SCHEMA_FIELDS = [
  'parallel_execution',
  'enabled',
  'framework',
  'flag',
  'workers',
  'fallback_triggered',
  'flaky_tests'
];
```

### 3.6 Parallel Test Creation Patterns (TC-05)

```javascript
const CREATION_PATTERNS = {
  threshold: '10',
  subAgentKeywords: ['parallel', 'sub-agent'],
  independenceKeyword: 'independen',
  conflictKeywords: ['consolidat', 'conflict', 'resolv']
};
```

---

## 4. Baseline Data for Regression Tests

### 4.1 Hook File Count Baseline

Before implementation, capture the count of .cjs files in `src/claude/hooks/`:

```javascript
const EXPECTED_HOOK_COUNT = // capture at test time
  readdirSync(hooksDir).filter(f => f.endsWith('.cjs') && !f.includes('.test.')).length;
```

### 4.2 Dependency Baseline

```javascript
const EXPECTED_DEPENDENCIES = ['chalk', 'fs-extra', 'prompts', 'semver'];
```

---

## 5. Boundary and Edge Cases

Since we are testing prompt content (not runtime behavior), edge cases are:

| Scenario | What to Check |
|----------|--------------|
| Agent file is empty after edit | File length > 100 lines (sanity check) |
| Lookup table rows misaligned | All 7 frameworks present (no dropped rows) |
| Missing pipe characters in table | Regex match for table format `\| Framework \|` |
| Duplicate sections | No section heading appears more than once |
| ATDD note missing | ATDD exclusion check in agents 05 and 06 |
| Parallel section placed in wrong location | Section appears after existing test discovery section |

---

## 6. Test Data Lifecycle

1. **No setup needed**: Tests read existing source files directly
2. **No teardown needed**: No temp directories created
3. **Idempotent**: Tests can run any number of times with identical results
4. **Fast**: No subprocess execution, no file creation -- pure string parsing
