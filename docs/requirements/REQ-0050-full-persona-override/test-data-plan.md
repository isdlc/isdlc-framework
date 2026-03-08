# Test Data Plan: Full Persona Override

**Requirement**: REQ-0050 / GH-108b
**Last Updated**: 2026-03-08

---

## 1. Overview

Test data is generated programmatically in test setup using `fs.writeFileSync()`. No external fixtures directory. Each test creates exactly the filesystem state it needs, following the established pattern from REQ-0047.

---

## 2. Boundary Values

### 2.1 Flag Values

| Parameter | Boundary | Test Value | Expected Behavior |
|-----------|----------|------------|-------------------|
| `--personas` | Empty string | `--personas ""` | Treated as no pre-selection; framework recommends |
| `--personas` | Single persona | `--personas "security-reviewer"` | Pre-selects 1 persona |
| `--personas` | All available personas | `--personas "ba,arch,design,security,devops,perf,qa,ux"` | Pre-selects all 8 |
| `--personas` | Unknown persona name | `--personas "nonexistent"` | Persona not found; excluded from roster |
| `active_roster` | 0 personas | `[]` | Falls back to no-persona mode (AC-003-06) |
| `active_roster` | 1 persona | `["security-reviewer"]` | Valid; single-persona roundtable |
| `active_roster` | Max personas (all available) | 8+ personas | All loaded; no artificial limit |
| `verbosity` | Valid values | `conversational`, `bulleted`, `silent` | Each accepted |
| `verbosity` | Invalid value | `verbose`, `quiet`, `123` | Falls back to `bulleted` default |
| `verbosity` | Empty string | `""` | Falls back to `bulleted` default |

### 2.2 Config File Values

| Parameter | Boundary | Test Value | Expected Behavior |
|-----------|----------|------------|-------------------|
| `default_personas` | Empty array | `[]` | No config-based recommendations |
| `default_personas` | 1 entry | `[security-reviewer]` | 1 persona added to recommendations |
| `default_personas` | Duplicate entries | `[security-reviewer, security-reviewer]` | De-duplicated to 1 |
| `disabled_personas` | Same as default | Entry in both lists | Disabled wins (AC-006-03) |
| `disabled_personas` | All personas disabled | All 8 names | All excluded from recommendation; all still available for manual add |
| YAML file | Missing entirely | No roundtable.yaml | Defaults: bulleted, empty lists |
| YAML file | Empty file | 0 bytes | Defaults returned |
| YAML file | Malformed YAML | `{{{broken` | Defaults returned, no crash |

### 2.3 Persona File Counts

| Scenario | Built-in Count | User Count | Expected Total |
|----------|---------------|------------|----------------|
| Minimum | 0 | 0 | 0 (no-persona mode or error) |
| Standard | 3 (primaries) | 0 | 3 |
| With contributing | 8 (3 primary + 5 contributing) | 0 | 8 |
| With user personas | 8 | 3 | 11 (8 built-in + 3 user, no overlap) |
| With overrides | 8 | 2 (overlapping filenames) | 9 (6 built-in + 2 user override + 1 user unique) |

---

## 3. Invalid Inputs

### 3.1 Flag Parsing Invalid Inputs

| Input | Expected Behavior | Test Case |
|-------|-------------------|----------|
| `--no-roundtable --personas "security"` | --no-roundtable wins; mode is no-personas | TC-MS-12 |
| `--silent --verbose` | Last flag wins | TC-MS-11 |
| `--personas` with no value | Treated as flag without value; ignored or error | TC-MS-13 |
| Unknown flag `--turbo` | Silently ignored (existing behavior) | N/A |
| Persona name with spaces `--personas "my persona"` | Treated as single persona name; may not match | Edge case |
| Persona name with special chars `--personas "../etc"` | Path traversal blocked by isSafeFilename | Security |

### 3.2 Config Invalid Inputs

| Input | Expected Behavior | Test Case |
|-------|-------------------|-----------|
| `verbosity: 42` (numeric) | Falls back to bulleted | TC-CP-04 |
| `verbosity: [array]` | Falls back to bulleted | TC-CP-04 |
| `default_personas: "string-not-array"` | Treated as empty or coerced | TC-CP-15 |
| `disabled_personas: 123` | Treated as empty | TC-CP-15 |
| Config with BOM marker | Parsed or gracefully defaulted | TC-CP-15 |
| Config with Windows line endings (CRLF) | Parsed correctly | Cross-platform |

### 3.3 Persona File Invalid Inputs

| Input | Expected Behavior | Test Case |
|-------|-------------------|-----------|
| Persona file with no frontmatter | Skipped with reason | TC-M1-12 (existing) |
| Persona file with missing name | Skipped with reason | TC-M1-13 (existing) |
| Persona file with broken YAML | Skipped, no crash | TC-M1-14 (existing) |
| Empty persona file (0 bytes) | Skipped | Edge case |
| Binary file in personas dir | Skipped | Edge case |

---

## 4. Maximum-Size Inputs

| Scenario | Size | Expected Behavior |
|----------|------|-----------|
| Maximum persona count | 50 persona files (built-in + user) | All loaded within 2 seconds |
| Maximum persona file size | 100 KB persona file | Loaded normally |
| Maximum config file size | 10 KB roundtable.yaml | Parsed normally |
| Maximum persona name length | 100-character persona name | Accepted |
| Maximum --personas flag length | 20 comma-separated names | Parsed correctly |
| Maximum trigger keywords per persona | 50 triggers | All matched |
| Large issue content for trigger matching | 10,000 word issue description | Trigger matching completes < 500ms |

---

## 5. Persona File Fixtures

### 5.1 Valid Primary Persona

```yaml
---
name: persona-business-analyst
description: Business Analyst - Requirements and stakeholder analysis
role_type: primary
triggers: []
owned_skills: [REQ-001, REQ-002]
version: 1.0.0
---

# Maya - Business Analyst
...
```

### 5.2 Valid Contributing Persona

```yaml
---
name: persona-security-reviewer
description: Security Reviewer - OWASP, threat modeling, auth
role_type: contributing
triggers:
  - security
  - authentication
  - authorization
  - OWASP
owned_skills: [SEC-001, SEC-002]
version: 1.0.0
---

# Security Reviewer
...
```

### 5.3 Valid User Persona (Custom)

```yaml
---
name: persona-compliance
description: Compliance Officer - regulatory requirements
role_type: contributing
triggers:
  - compliance
  - GDPR
  - regulation
owned_skills: []
version: 1.0.0
---

# Compliance Officer
...
```

### 5.4 Malformed Persona (Missing Name)

```yaml
---
version: 1.0.0
role_type: contributing
---

# Missing name field
```

### 5.5 Malformed Persona (No Frontmatter)

```markdown
# No YAML frontmatter at all

Just plain markdown content.
```

---

## 6. Config File Fixtures

### 6.1 Standard Config (REQ-0047 Era)

```yaml
verbosity: bulleted
default_personas:
  - security-reviewer
disabled_personas:
  - ux-reviewer
```

### 6.2 Config With All Fields

```yaml
verbosity: conversational
default_personas:
  - security-reviewer
  - devops-engineer
disabled_personas:
  - ux-reviewer
```

### 6.3 Empty Config

```yaml
# Empty config -- all defaults apply
```

### 6.4 Conflicting Config

```yaml
default_personas:
  - security-reviewer
disabled_personas:
  - security-reviewer
```

### 6.5 Malformed Config

```
{{{broken yaml content not valid
verbosity bulleted missing colon
```

---

## 7. Dispatch Context Fixtures

### 7.1 No-Persona Mode Context

```json
{
  "analysis_mode": "no-personas",
  "persona_paths": [],
  "active_roster": [],
  "verbosity": null,
  "artifact_types": ["requirements-spec", "impact-analysis", "architecture-overview", "module-design"]
}
```

### 7.2 Personas Mode Context

```json
{
  "analysis_mode": "personas",
  "persona_paths": ["/path/to/persona-security-reviewer.md", "/path/to/persona-devops-engineer.md"],
  "active_roster": ["security-reviewer", "devops-engineer"],
  "verbosity": "bulleted",
  "artifact_types": ["requirements-spec", "impact-analysis", "architecture-overview", "module-design"]
}
```

### 7.3 Silent Mode Context

```json
{
  "analysis_mode": "personas",
  "persona_paths": ["/path/to/persona-business-analyst.md", "/path/to/persona-solutions-architect.md", "/path/to/persona-system-designer.md"],
  "active_roster": ["business-analyst", "solutions-architect", "system-designer"],
  "verbosity": "silent",
  "artifact_types": ["requirements-spec", "impact-analysis", "architecture-overview", "module-design"]
}
```
