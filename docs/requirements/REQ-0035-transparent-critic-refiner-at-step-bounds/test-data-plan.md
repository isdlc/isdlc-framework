# Test Data Plan: REQ-0035 Transparent Confirmation at Analysis Boundaries

**Status**: Complete
**Phase**: 05-test-strategy
**Confidence**: High
**Last Updated**: 2026-02-22

## 1. Overview

This feature modifies two markdown prompt files. Tests read file content and assert structural patterns. Test data consists of:
1. **File paths** -- the target files to read and verify
2. **Content patterns** -- expected strings, keywords, and structural markers to find
3. **Count expectations** -- expected counts for hooks, dependencies, and state machine states

No external test data files, fixtures, or databases are needed. All test data is embedded as constants in the test file.

## 2. Test Data Constants

### File Paths

```javascript
const PROJECT_ROOT = join(import.meta.dirname, '..', '..');
const ROUNDTABLE_ANALYST_PATH = join(PROJECT_ROOT, 'src', 'claude', 'agents', 'roundtable-analyst.md');
const ISDLC_MD_PATH = join(PROJECT_ROOT, 'src', 'claude', 'commands', 'isdlc.md');
const HOOKS_DIR = join(PROJECT_ROOT, 'src', 'claude', 'hooks');
const PACKAGE_JSON_PATH = join(PROJECT_ROOT, 'package.json');
```

### State Machine States (8 total)

```javascript
const CONFIRMATION_STATES = [
  'IDLE',
  'PRESENTING_REQUIREMENTS',
  'PRESENTING_ARCHITECTURE',
  'PRESENTING_DESIGN',
  'AMENDING',
  'TRIVIAL_SHOW',
  'FINALIZING',
  'COMPLETE'
];
```

### Domain Names

```javascript
const DOMAINS = ['requirements', 'architecture', 'design'];
```

### Tier Names

```javascript
const TIERS = ['trivial', 'light', 'standard', 'epic'];
```

### Summary Artifact Filenames

```javascript
const SUMMARY_ARTIFACTS = [
  'requirements-summary.md',
  'architecture-summary.md',
  'design-summary.md'
];
```

### Source Artifact Filenames (per domain)

```javascript
const SOURCE_ARTIFACTS = {
  requirements: ['requirements-spec.md', 'user-stories.json'],
  architecture: ['architecture-overview.md'],
  design: ['module-design.md', 'interface-spec.md', 'data-flow.md']
};
```

### Persona Names

```javascript
const PERSONAS = {
  requirements: 'Maya',
  architecture: 'Alex',
  design: 'Jordan'
};
```

### Infrastructure Guards

```javascript
const EXPECTED_HOOK_COUNT = 28;
const EXPECTED_RUNTIME_DEPS = ['chalk', 'fs-extra', 'prompts', 'semver'];
```

## 3. Boundary Values

### Tier Boundaries

| Boundary | Value | Expected Behavior |
|----------|-------|-------------------|
| Trivial tier | `effective_intensity: "trivial"` | Brief mention, no Accept/Amend, auto-finalize |
| Light tier | `effective_intensity: "light"` | Requirements + Design summaries (architecture skipped) |
| Standard tier | `effective_intensity: "standard"` | All 3 summaries sequentially |
| Epic tier | `effective_intensity: "epic"` | All 3 summaries sequentially (same as standard) |

### Domain Count Boundaries

| Scenario | Applicable Domains | Summaries Presented |
|----------|-------------------|---------------------|
| All artifacts present (standard) | requirements, architecture, design | 3 |
| Architecture missing (light or artifact gap) | requirements, design | 2 |
| Only requirements present | requirements | 1 |
| Trivial | none (brief mention) | 0 (no formal summaries) |

### Amendment Cycle Boundaries

| Boundary | Value | Expected Behavior |
|----------|-------|-------------------|
| Zero amendments | `amendment_cycles: 0` | First-pass acceptance; summaries persisted immediately |
| One amendment | `amendment_cycles: 1` | Full conversation, restart from requirements, re-accept all |
| Multiple amendments | `amendment_cycles: N` | Each restarts from requirements; accepted state always reflects final cycle |

## 4. Invalid Inputs

### Ambiguous User Responses

The interface spec defines that ambiguous user input should be treated as amendment. The test verifies this instruction is present in the agent prompt.

| Invalid/Ambiguous Input | Expected Handling |
|------------------------|-------------------|
| "hmm" (neither accept nor amend) | Treated as amendment conversation start |
| Empty response | Treated as amendment (safer to clarify) |
| Mixed signals ("looks good but I wonder about...") | Treated as amendment |

### Missing Artifacts

| Missing Data | Expected Handling |
|-------------|-------------------|
| Architecture artifacts not produced | Architecture summary skipped in sequence |
| Design artifacts not produced | Design summary skipped in sequence |
| No artifacts produced (degenerate) | Should not reach confirmation (coverage tracker would not signal completion) |

### Missing Tier Information

| Missing Data | Expected Handling |
|-------------|-------------------|
| No sizing_decision in meta.json | Agent must have fallback tier determination logic or default |
| Null effective_intensity | Should default to standard tier behavior (safest default) |

## 5. Maximum-Size Inputs

### Agent File Size

The `roundtable-analyst.md` file is the largest modified file (~430 lines currently, will grow to ~530-580 lines with confirmation sequence additions). Tests must handle reading the full file content, which is well within `readFileSync` limits.

| Input | Current Size | Post-Implementation Size | Test Impact |
|-------|-------------|--------------------------|-------------|
| `roundtable-analyst.md` | ~430 lines | ~530-580 lines | No impact; `readFileSync` handles files of any size |
| `isdlc.md` | ~740 lines | ~745 lines | No impact; minor addition |

### Pattern Matching Limits

All content assertions use `String.includes()` or `RegExp.test()` which are O(n) in file size. No performance concerns at these file sizes.

## 6. Test Data Lifecycle

1. **Setup**: Each test group reads target files using `readFileSync` with a file cache helper (same pattern as `preparation-pipeline.test.js`)
2. **Execution**: Content assertions using `assert.ok`, `assert.match`, `assert.equal`
3. **Teardown**: None needed -- tests are read-only, no state mutation
4. **Isolation**: Each test reads files independently; no shared mutable state between tests

## 7. No External Data Dependencies

- No database connections
- No API calls
- No network access
- No environment variables
- No temporary files
- No random data generation

All test data is deterministic and embedded in the test file.
