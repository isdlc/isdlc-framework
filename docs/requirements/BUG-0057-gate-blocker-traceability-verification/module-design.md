# Module Design: BUG-0057 — Gate-Blocker Traceability Verification

**Status**: Accepted
**Created**: 2026-03-25

---

## 1. Module: validate-phase (Entry Point)

**Location**: `src/core/validators/validate-phase.js`
**Responsibility**: Single entry point for all phase validation. Determines applicable checks, runs validators in parallel, merges results.

**Public Interface**:

```js
/**
 * Run all applicable validators for a phase.
 *
 * @param {string} phaseKey - e.g. "05-test-strategy", "06-implementation"
 * @param {PhaseInputs} inputs - Content strings for all artifacts
 * @param {ValidateOptions} [options] - Provider-specific options
 * @returns {Promise<MergedResult>}
 */
export async function validatePhase(phaseKey, inputs, options = {})
```

**PhaseInputs**:
```js
{
  requirementsSpec: string | null,
  testStrategy: string | null,
  testFiles: { path: string, content: string }[] | null,
  modifiedFiles: string[] | null,       // from git diff
  testExecutionOutput: string | null,
  constitution: string | null,
  articleIds: string[] | null,
  artifactContents: { name: string, content: string }[] | null,
  priorPhaseGates: { phase: string, status: string }[] | null
}
```

**ValidateOptions**:
```js
{
  coverageRequired: boolean,          // default: true
  coverageThreshold: number | null,   // from config
  maxFileLines: number,               // default: 500 (Article V)
  useAgentTeams: boolean              // default: false (Claude sets true when available)
}
```

**MergedResult**:
```js
{
  pass: boolean,
  failures: { validator: string, result: ValidatorResult }[],
  details: {
    traceability: ValidatorResult | null,
    testImplementation: ValidatorResult | null,
    testExecution: ValidatorResult | null,
    coveragePresence: ValidatorResult | null,
    constitutional: ValidatorResult | null
  },
  validator_errors: string[]    // logged but non-blocking
}
```

**Algorithm**:
1. Read phase-to-validator mapping from iteration-requirements config
2. Filter to applicable validators for this phase
3. Run validators 1-4 via `Promise.all()` with per-validator try/catch
4. Run validator 5 via agent teams (if `options.useAgentTeams`) or `Promise.all`
5. Collect results; any validator crash → add to `validator_errors`, don't fail
6. Merge: `pass = true` only if all non-errored validators returned `pass: true`
7. Return merged result

**Estimated size**: ~60 lines

---

## 2. Module: traceability-validator (Validator 1)

**Location**: `src/core/validators/traceability-validator.js`
**Responsibility**: Verify every AC in requirements-spec has a mapped test case in test-strategy.

**Public Interface**:
```js
export function validateRequirementsToTests(requirementsSpecContent, testStrategyContent)
```

**Returns**:
```js
{
  pass: boolean,
  failure_reason: string | null,
  missing_artifacts: string[],
  details: {
    total_acs: number,
    covered_acs: number,
    coverage_percent: number,
    orphan_acs: string[],
    mapped_test_cases: [{ ac_id: string, test_ids: string[] }],
    unparseable_references: string[]
  }
}
```

**Algorithm**:
1. If either input is null → `{ pass: true, missing_artifacts: [...] }`
2. Extract AC IDs via `extractAcIds(requirementsSpecContent)`
3. Extract test→AC mappings via `extractTestToAcMappings(testStrategyContent)`
4. For each AC: check if any test mapping references it
5. Orphan ACs = ACs with no mapped test
6. `pass = orphan_acs.length === 0`

**Estimated size**: ~50 lines

---

## 3. Module: test-implementation-validator (Validator 2)

**Location**: `src/core/validators/test-implementation-validator.js`
**Responsibility**: Three-part check — (A) planned tests coded, (B) production imports modified, (C) AC→production file traceability.

**Public Interface**:
```js
export function validateTestImplementation(testStrategyContent, testFiles, modifiedFiles)
```

**Parameters**:
- `testStrategyContent: string` — test-strategy.md content
- `testFiles: { path: string, content: string }[]` — test file contents
- `modifiedFiles: string[]` — paths from git diff

**Returns**:
```js
{
  pass: boolean,
  failure_reason: string | null,
  missing_artifacts: string[],
  details: {
    // Part A
    total_planned: number,
    implemented: number,
    unimplemented_tests: string[],
    implemented_tests: string[],

    // Part B
    test_imports: [{ test_file: string, imports: string[], modified: boolean }],
    unmodified_imports: string[],

    // Part C
    ac_production_mappings: [{ ac_id: string, production_file: string, modified: boolean }],
    orphan_acs_no_production: string[],
    orphan_acs_no_test: string[]
  }
}
```

**Algorithm**:
1. Part A: Extract planned IDs from strategy → search each test file for ID string → collect unimplemented
2. Part B: Parse `import ... from '...'` and `require('...')` from test files → resolve to relative paths → check against modifiedFiles
3. Part C: Parse AC→production file mappings from strategy (format: `production: path/to/file`) → check against modifiedFiles
4. `pass = unimplemented_tests.length === 0 && unmodified_imports.length === 0 && orphan_acs_no_production.length === 0`

**Estimated size**: ~100 lines

---

## 4. Module: test-execution-validator (Validator 3)

**Location**: `src/core/validators/test-execution-validator.js`
**Responsibility**: Verify all planned test cases were executed.

**Public Interface**:
```js
export function validateTestExecution(testStrategyContent, testExecutionOutput)
```

**Returns**:
```js
{
  pass: boolean,
  failure_reason: string | null,
  missing_artifacts: string[],
  details: {
    total_planned: number,
    executed: number,
    unexecuted_tests: string[],
    executed_tests: string[],
    failed_tests: string[]
  }
}
```

**Algorithm**:
1. Extract planned IDs from strategy
2. Extract executed IDs from output (patterns: `✓ ID:`, `✔ ID:`, `pass ID:`, `ok N ID:`, `# Subtest: ID:`)
3. Extract failed IDs (patterns: `✗ ID:`, `✖ ID:`, `fail ID:`, `not ok N ID:`)
4. Unexecuted = planned minus (executed ∪ failed)
5. `pass = unexecuted_tests.length === 0 && failed_tests.length === 0`

**Estimated size**: ~60 lines

---

## 5. Module: coverage-presence-validator (Validator 4)

**Location**: `src/core/validators/coverage-presence-validator.js`
**Responsibility**: Verify coverage data is present in test output; surface absence.

**Public Interface**:
```js
export function validateCoveragePresence(testExecutionOutput, options = {})
```

**Options**: `{ required: boolean, threshold: number | null }`

**Returns**:
```js
{
  pass: boolean,
  failure_reason: string | null,
  missing_artifacts: string[],
  details: {
    coverage_found: boolean,
    coverage_percent: number | null,
    threshold: number | null,
    source_pattern: string | null
  }
}
```

**Algorithm**:
1. Run shared COVERAGE_PATTERNS regexes (extracted from test-watcher) against output
2. If not found and `options.required`: `{ pass: false, failure_reason: "no_coverage_data" }`
3. If found and below threshold: `{ pass: false }` with details
4. If found and meets threshold: `{ pass: true }`

**Shared regex module**: `src/core/validators/lib/coverage-patterns.js` — extracted from `test-watcher.cjs` lines 111-122. Single source of truth for both test-watcher and this validator.

**Estimated size**: ~40 lines

---

## 6. Module: constitutional-validator (Validator 5)

**Location**: `src/core/validators/constitutional-validator.js`
**Responsibility**: Orchestrate per-article checks for a phase's required articles.

**Public Interface**:
```js
export async function validateConstitutionalCompliance(constitutionContent, articleIds, artifactContents, options = {})
```

**Returns**:
```js
{
  pass: boolean,
  failure_reason: string | null,
  missing_artifacts: string[],
  details: {
    articles_checked: string[],
    articles_compliant: string[],
    articles_violated: string[],
    violations: [{ article: string, description: string }]
  }
}
```

**Algorithm**:
1. For each articleId in articleIds: load check function from `constitutional-checks/article-{id}.js`
2. If `options.useAgentTeams`: spawn parallel agent teams per article
3. Else: run via `Promise.all`
4. Collect results, merge violations
5. `pass = articles_violated.length === 0`

---

## 7. Constitutional Checks (`constitutional-checks/`)

Each file exports: `export function check(artifactContents, options?) → { compliant: boolean, violations: string[] }`

| File | Article | Concrete Check |
|---|---|---|
| `article-ii.js` | Test-First | At least one test file in artifacts; test case count > 0 |
| `article-iii.js` | Security | No `/API[_-]?KEY\|PASSWORD\|SECRET\|TOKEN/i` in non-test code |
| `article-v.js` | Simplicity | No file exceeds `options.maxFileLines` (default 500) lines |
| `article-vii.js` | Traceability | AC references present in test files; traceability matrix artifact exists |
| `article-viii.js` | Documentation | If agent/skill counts changed, docs artifacts include CLAUDE.md or AGENTS.md |
| `article-ix.js` | Gate Integrity | All prior phase gates show completed status (takes `priorPhaseGates` input) |
| `article-x.js` | Fail-Safe | New code contains error handling patterns (`try`, `catch`, `.catch(`, `\|\| default`) |

**Estimated size**: ~20-30 lines each

---

## 8. Shared Parser: test-id-parser

**Location**: `src/core/validators/lib/test-id-parser.js`
**Responsibility**: Common parsing functions for test IDs and AC IDs.

**Public Interface**:
```js
export function extractTestCaseIds(content) → string[]
export function extractAcIds(content) → string[]
export function extractTestToAcMappings(content) → [{ test_id: string, ac_ids: string[], production_file: string | null }]
```

**Parsing rules**:
- `extractTestCaseIds`: Match `/^[A-Z]+-\d+/gm` — captures VR-01, DM-01, TC-BUILD-01, etc.
- `extractAcIds`: Match `/AC-\d{3}-\d{2}/g` — captures AC-001-01, AC-006-03, etc.
- `extractTestToAcMappings`: Parse lines containing test ID + `(AC-NNN-NN)` references + optional `production: path`

**Estimated size**: ~40 lines

---

## 9. CJS Bridge Update

**Location**: `src/core/bridge/validators.cjs`

**Change**: Add lazy-loaded dynamic `import()` for `validate-phase.js`:

```js
let _validatePhaseModule;
async function getValidatePhase() {
  if (!_validatePhaseModule) {
    _validatePhaseModule = await import('../validators/validate-phase.js');
  }
  return _validatePhaseModule;
}

module.exports.validatePhase = async function(phaseKey, inputs, options) {
  const mod = await getValidatePhase();
  return mod.validatePhase(phaseKey, inputs, options);
};
```

**Estimated change**: ~20 lines

---

## 10. gate-logic.cjs Update

**New function**: `checkTraceabilityRequirement(phaseState, phaseRequirements, state, currentPhase)`

1. Read artifact folder from state
2. Resolve file paths for the current phase's required artifacts
3. Read file contents from disk
4. Get git diff modified files via `execSync('git diff --name-only HEAD~1')`
5. Call bridge `validatePhase()` with contents
6. If `pass: false`: return `{ satisfied: false, reason: structured_failure_message }`

Added to the checks array in `check()` alongside existing 5 checks.

**Estimated change**: ~40 lines

---

## 11. runtime.js Update (Codex)

**New function**: `validatePhaseGate(phaseKey, artifactFolder, projectRoot)`

1. Read artifact files from disk based on phase requirements
2. Get git diff modified files
3. Import and call `validatePhase()` directly
4. If `pass: false`: return structured failure for re-delegation
5. If `pass: true`: allow phase advancement

Called after `codex exec` returns, before incrementing phase index.

**Estimated change**: ~50 lines

---

## 12. Iteration Requirements Update

New requirement type per phase in `iteration-requirements.json`:

```json
"traceability_validation": {
  "enabled": true,
  "checks": ["requirements_to_tests"]
}
```

Phase 05: `["requirements_to_tests"]`
Phase 06: `["test_implementation", "coverage_presence"]`
Phase 07: `["test_execution", "coverage_presence"]`
All phases with constitutional: `["constitutional"]` (replaces self-attestation)

---

## 13. Error Handling

| Condition | Behavior |
|---|---|
| Validator function throws | Caught; `{ pass: true, failure_reason: "validator_error: ..." }`; logged warning |
| Missing artifact content (null input) | `{ pass: true, missing_artifacts: ["name"] }`; non-blocking |
| Successful parse finds failures | `{ pass: false, ... }`; blocks phase advancement |
| Bridge dynamic import fails | Fall back to existing inline gate-logic checks |
| Git diff command fails | `modifiedFiles = []`; Validator 2 Part B/C skip with warning |

---

## 14. File Summary

| Category | Files | Count |
|---|---|---|
| Core validators | validate-phase.js, traceability-validator.js, test-implementation-validator.js, test-execution-validator.js, coverage-presence-validator.js, constitutional-validator.js | 6 |
| Constitutional checks | article-ii.js, article-iii.js, article-v.js, article-vii.js, article-viii.js, article-ix.js, article-x.js | 7 |
| Shared libs | lib/test-id-parser.js, lib/coverage-patterns.js | 2 |
| Modified | gate-logic.cjs, bridge/validators.cjs, runtime.js, iteration-requirements.json | 4 |
| Config | .isdlc/config.json (default_tier key) | 1 |
| **Total new** | | **15** |
| **Total modified** | | **4** |
