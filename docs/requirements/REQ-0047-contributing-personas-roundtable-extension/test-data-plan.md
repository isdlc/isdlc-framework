# Test Data Plan: Contributing Personas -- Roundtable Extension

**Requirement**: REQ-0047 / GH-108a
**Last Updated**: 2026-03-07

---

## 1. Overview

Test data for REQ-0047 is generated programmatically at test setup time using `fs.writeFileSync()`. No external fixture files or databases are needed. Each test creates the exact filesystem state it requires in a temp directory (via `hook-test-utils.cjs`'s `setupTestEnv()`).

---

## 2. Persona File Fixtures

### 2.1 Valid Persona File (Minimal)

```yaml
---
name: persona-test-reviewer
role_type: contributing
domain: testing
version: 1.0.0
triggers:
  - test
  - coverage
owned_skills: []
---
# Test Reviewer -- Contributing Persona

## Identity
- **Name**: Test Reviewer
- **Role**: QA specialist
- **Domain**: testing

## Flag When You See
- Missing test coverage

## Stay Silent About
- UI design choices

## Voice Rules
- Keep observations concise
```

### 2.2 Valid Persona File (Full)

```yaml
---
name: persona-security-reviewer
role_type: contributing
domain: security
version: 1.0.0
triggers:
  - authentication
  - authorization
  - encryption
  - input validation
  - secrets
  - OWASP
  - vulnerability
  - XSS
  - CSRF
  - injection
owned_skills:
  - SEC-001  # security-review
---
# Security Reviewer -- Contributing Persona

## Identity
- **Name**: Sage
- **Role**: Security Reviewer
- **Domain**: security

## Flag When You See
- Unvalidated inputs at system boundaries
- Hardcoded credentials or secrets
- Missing authentication/authorization checks
- SQL injection, XSS, CSRF attack surfaces

## Stay Silent About
- Code style preferences
- Non-security architectural patterns

## Voice Rules
- Cite OWASP Top 10 when relevant
- Flag severity: Critical, High, Medium, Low
- DO NOT block on cosmetic issues
- DO NOT repeat findings already addressed
```

### 2.3 Valid Persona File (No Optional Fields)

```yaml
---
name: persona-minimal
---
# Minimal Persona
Just a name is enough to be valid.
```

---

## 3. Boundary Values

### 3.1 Persona File Count Boundaries

| Boundary | Value | Test Case | Expected Behavior |
|----------|-------|-----------|-------------------|
| Zero persona files | 0 user + 0 contributing built-in | TC-M1-05, TC-M1-06 | Returns only 3 primary personas |
| One persona file | 1 user persona | TC-M1-04 | Returns primaries + 1 user persona |
| Exactly 10 files | NFR-001 threshold | TC-NFR-01 | Completes within 500ms |
| 20 files (stress) | 2x NFR threshold | Performance test | Completes within 1000ms |
| 50 files (extreme) | Stress boundary | Not tested (out of expected range) | Documented: performance degrades linearly |

### 3.2 Persona File Size Boundaries

| Boundary | Value | Test Case | Expected Behavior |
|----------|-------|-----------|-------------------|
| Empty file (0 bytes) | 0 | TC-M1-12 variant | Skipped, added to skippedFiles |
| 1 line (frontmatter only) | `---\nname: x\n---` | Edge case | Loaded, body is empty |
| 39 lines (just under limit) | 39 | TC-M5-05 | Passes < 40 line check |
| 40 lines (at limit) | 40 | TC-M5-05 | Fails < 40 line check (must be < 40) |
| 41 lines (over limit) | 41 | TC-M5-05 | Fails check (for shipped personas only; user personas have no limit) |
| 1 MB file | ~20K lines | TC-M1-28 variant | Loaded (no size limit for user files) |

### 3.3 Version Field Boundaries

| Boundary | Value | Test Case | Expected Behavior |
|----------|-------|-----------|-------------------|
| No version field | missing | TC-M1-20, TC-M1-21 | No drift check, no warning |
| Same version | `1.0.0` vs `1.0.0` | TC-M1-18 | No drift warning |
| Older user version | `1.0.0` vs `1.1.0` | TC-M1-17 | Drift warning emitted |
| Newer user version | `2.0.0` vs `1.0.0` | TC-M1-19 | No drift warning (user is ahead) |
| Invalid semver | `not-a-version` | Edge case | Drift check skipped or warning |

### 3.4 Config Field Boundaries

| Boundary | Value | Test Case | Expected Behavior |
|----------|-------|-----------|-------------------|
| Empty config file | 0 bytes | TC-M2-05 | Defaults applied |
| Verbosity only | `verbosity: bulleted` | TC-M2-01 | Other fields default to empty |
| Empty arrays | `default_personas: []` | TC-M2-02 variant | Valid, treated as no defaults |
| Single-item array | `default_personas: [security-reviewer]` | TC-M2-02 | Array with 1 entry |
| Long array | 20 items | Stress variant | All 20 items processed |

---

## 4. Invalid Inputs

### 4.1 Invalid Persona Files

| Input | Test Case | Expected Result |
|-------|-----------|----------------|
| No frontmatter at all | TC-M1-12 | Skipped, reason: "no frontmatter" |
| Frontmatter without name | TC-M1-13 | Skipped, reason: "missing name field" |
| Malformed YAML (unclosed bracket) | TC-M1-14 | Skipped, reason: "invalid YAML" |
| Binary file (not text) | Edge variant | Skipped, reason: "not a text file" or parse error |
| File with `../` in name | TC-M1-27 | Rejected (path traversal) |
| File with null bytes in name | Security edge | Rejected |
| Persona file that is a directory | Edge variant | Skipped (fs.readFileSync fails on dir) |
| Symlink to nonexistent target | Edge variant | Skipped (read error) |

### 4.2 Invalid Config Values

| Input | Test Case | Expected Result |
|-------|-----------|----------------|
| `verbosity: loud` | TC-M2-06 | Defaults to `bulleted` |
| `verbosity: 42` | TC-M2-07 | Defaults to `bulleted` |
| `verbosity: null` | Variant | Defaults to `bulleted` |
| `verbosity: ""` | Variant | Defaults to `bulleted` |
| `default_personas: "security"` | TC-M2-08 | Defaults to `[]` |
| `default_personas: 42` | Variant | Defaults to `[]` |
| `disabled_personas: true` | TC-M2-09 | Defaults to `[]` |
| Entire file is `null` | TC-M2-10 variant | All defaults |
| YAML with tabs instead of spaces | Edge case | Depends on parser; should handle |
| Config with very long string values | Stress | Parsed, no crash |

### 4.3 Invalid CLI Flags

| Input | Test Case | Expected Result |
|-------|-----------|----------------|
| `--verbose` and `--silent` together | TC-FLAG-04 | Last flag wins |
| `--personas` with empty value | Edge variant | Treated as no pre-selection |
| `--personas` with unknown persona name | TC-INT-06 variant | Note shown, rest of roster proceeds |
| `--personas` with special characters | Edge variant | Rejected gracefully |

---

## 5. Maximum-Size Inputs

### 5.1 Maximum Persona Count

| Scenario | Count | Test | Expected |
|----------|-------|------|----------|
| 10 persona files (NFR target) | 10 | TC-NFR-01 | < 500ms |
| 20 persona files (2x target) | 20 | Stress test | < 1000ms |
| 50 persona files | 50 | Documented boundary | Linear performance |

### 5.2 Maximum File Sizes

| Scenario | Size | Test | Expected |
|----------|------|------|----------|
| Normal persona (~35 lines) | ~1KB | Standard tests | Fast |
| Large user persona (500 lines) | ~15KB | Edge case | Loaded (user files have no limit) |
| Very large persona (5000 lines) | ~150KB | Stress boundary | Loaded but context cost noted |

### 5.3 Maximum Config Complexity

| Scenario | Values | Test | Expected |
|----------|--------|------|----------|
| 20 default_personas entries | 20 | Stress | All processed |
| 20 disabled_personas entries | 20 | Stress | All processed |
| All personas both default and disabled | N | TC-INT-03 | disabled wins for all |

---

## 6. Test Data Generation Strategy

All test data is created programmatically in test `beforeEach()` hooks:

```javascript
// Example: create a valid persona file in temp directory
function createPersonaFile(dir, filename, overrides = {}) {
    const defaults = {
        name: filename.replace('.md', ''),
        role_type: 'contributing',
        domain: 'testing',
        version: '1.0.0',
        triggers: ['test'],
        owned_skills: []
    };
    const frontmatter = { ...defaults, ...overrides };
    const yaml = Object.entries(frontmatter)
        .map(([k, v]) => {
            if (Array.isArray(v)) return `${k}:\n${v.map(i => `  - ${i}`).join('\n')}`;
            return `${k}: ${v}`;
        })
        .join('\n');
    const body = '# Test Persona\n\n## Identity\n- Test\n';
    const content = `---\n${yaml}\n---\n${body}`;
    fs.writeFileSync(path.join(dir, filename), content, 'utf8');
}

// Example: create roundtable.yaml
function createRoundtableConfig(dir, config = {}) {
    const defaults = {
        verbosity: 'bulleted',
        default_personas: [],
        disabled_personas: []
    };
    const merged = { ...defaults, ...config };
    const yaml = Object.entries(merged)
        .map(([k, v]) => {
            if (Array.isArray(v)) {
                if (v.length === 0) return `${k}: []`;
                return `${k}:\n${v.map(i => `  - ${i}`).join('\n')}`;
            }
            return `${k}: ${v}`;
        })
        .join('\n');
    fs.writeFileSync(path.join(dir, '.isdlc', 'roundtable.yaml'), yaml, 'utf8');
}
```

---

## 7. Cleanup Strategy

- Each test uses `beforeEach()` to create a fresh temp directory via `setupTestEnv()`
- Each test uses `afterEach()` to recursively remove the temp directory via `cleanupTestEnv()`
- Temp directories are prefixed `isdlc-test-persona-` for identification if cleanup fails
- Tests use synchronous filesystem operations to avoid timing issues

---

## 8. Cross-Reference to Test Cases

| Data Category | Test Cases Using It |
|---------------|--------------------|
| Valid persona fixtures | TC-M1-01 through TC-M1-11, TC-INT-*, TC-OVR-*, TC-E2E-* |
| Invalid persona fixtures | TC-M1-12 through TC-M1-16, TC-M1-27, TC-M1-28 |
| Config fixtures (valid) | TC-M2-01 through TC-M2-05, TC-M2-12 through TC-M2-20 |
| Config fixtures (invalid) | TC-M2-06 through TC-M2-10 |
| Override fixtures (drift) | TC-M1-17 through TC-M1-22, TC-OVR-01 through TC-OVR-08 |
| Performance fixtures (10+ files) | TC-NFR-01, TC-E2E-06 |
| Schema fixtures (built-in files) | TC-M5-01 through TC-M5-12 |
