---
Status: Draft
Confidence: High
Last Updated: 2026-03-07
Coverage: specification 95%
Amendment: 2 (hackability review — disabled_personas, per-analysis flags, gitignore, skipped-file feedback)
Source: REQ-0047 / GH-108a
---

# Interface Specification: Contributing Personas -- Roundtable Extension

## 1. getPersonaPaths() -- Extended

**Location**: `src/antigravity/analyze-item.cjs`

**Current signature**:
```javascript
function getPersonaPaths(projectRoot: string): string[]
```

**New signature**:
```javascript
function getPersonaPaths(projectRoot: string): {
    paths: string[],
    driftWarnings: DriftWarning[]
}
```

**DriftWarning type**:
```javascript
/** @typedef {{ filename: string, userVersion: string, shippedVersion: string, personaName: string }} DriftWarning */
```

**Behavior**:
1. Scan `src/claude/agents/persona-*.md` --> `builtInMap: Map<filename, fullPath>`
2. Scan `.isdlc/personas/*.md` --> `userMap: Map<filename, fullPath>`
3. For each `userMap` entry:
   - If `builtInMap` has same key: override (use user path), compare versions, collect warning if drift
   - If not: add user path as new persona
4. Collect `skippedFiles: SkippedFile[]` for any persona that failed validation
5. Return merged paths + drift warnings + skipped files

**SkippedFile type**:
```javascript
/** @typedef {{ filename: string, reason: string }} SkippedFile */
```

**Error handling**:
- `.isdlc/personas/` does not exist: return built-in paths only, no warnings, no skipped
- File read error on individual persona: add to `skippedFiles`, continue
- Missing/malformed frontmatter: add to `skippedFiles`, continue

## 2. ROUNDTABLE_CONTEXT Builder -- Extended

**Location**: `src/claude/hooks/lib/common.cjs` (line ~4268)

**Current behavior**: Reads 3 hardcoded persona files, builds section.

**New behavior**:
1. Read all `persona-*.md` from `src/claude/agents/`
2. Read all `*.md` from `.isdlc/personas/`
3. Apply override-by-copy (same filename in user dir wins)
4. Build persona sections for all resolved files
5. Append `ROUNDTABLE_CONFIG` sub-section from `.isdlc/roundtable.yaml`
6. Append `DRIFT_WARNINGS` sub-section if any version drift detected

**Output format addition**:
```markdown
### Roundtable Config
verbosity: bulleted
default_personas: [security-reviewer, qa-tester]

### Drift Warnings
- persona-security-reviewer.md: user v1.0.0, shipped v1.1.0
```

## 3. Roundtable Config File Schema

**Location**: `.isdlc/roundtable.yaml`

```yaml
# Required fields: none (all optional with defaults)
verbosity: bulleted              # "conversational" | "bulleted" | "silent"
                                 # Default: "bulleted"

default_personas:                # Personas always included in roster proposal
  - security-reviewer            # Matches persona filename without "persona-" prefix and ".md" suffix
  - qa-tester
                                 # Default: [] (empty, pure auto-roster)
                                 # Ignored in silent mode (no roster proposal)

disabled_personas:               # Personas excluded from roster proposals and auto-detection
  - ux-reviewer                  # User can still manually request during roster confirmation
                                 # Default: [] (no exclusions)
```

**Validation rules**:
- `verbosity`: must be one of `"conversational"`, `"bulleted"`, `"silent"`. Invalid value: default to `"bulleted"`, log warning.
- `default_personas`: must be array of strings. Invalid type: default to `[]`, log warning.
- `disabled_personas`: must be array of strings. Invalid type: default to `[]`, log warning.
- A persona in both `default_personas` and `disabled_personas`: `disabled_personas` wins (explicit exclusion overrides default inclusion).
- Unknown keys: ignored (forward-compatible).

## 4. Contributing Persona Frontmatter Schema

**Location**: `src/claude/agents/persona-*.md` and `.isdlc/personas/*.md`

```yaml
---
name: persona-{identifier}       # Required. Unique identifier.
role_type: contributing           # "primary" | "contributing". Default: "contributing" (user), "primary" (built-in BA/Arch/Design)
domain: {keyword}                 # Required for contributing. Used in roster display.
version: 1.0.0                   # Semver. Used for drift detection. Optional.
triggers:                         # Keywords for roster inference. Optional.
  - keyword1
  - keyword2
owned_skills:                     # Skill IDs wired through framework. Optional.
  - SKILL-ID  # description
---
```

**Validation rules**:
- `name` missing: skip file (minimum valid persona requirement)
- `role_type` missing: default to `contributing` for `.isdlc/personas/`, determine by filename for `src/claude/agents/` (the 3 primary names = `primary`, others = `contributing`)
- `domain` missing on contributing: use filename-derived domain (strip `persona-` prefix and `.md` suffix, replace `-` with space)
- `triggers` missing: persona is never auto-proposed but can be manually added by user or included via `default_personas`
- `version` missing: skip drift check for this file
- `owned_skills` missing: treated as `[]`

## 5. Dispatch Prompt Additions

The following fields are added to the roundtable dispatch prompt:

| Field | Source | Format | Example |
|-------|--------|--------|---------|
| `ROUNDTABLE_VERBOSITY` | `.isdlc/roundtable.yaml` or per-analysis flag | String | `bulleted` |
| `ROUNDTABLE_ROSTER_DEFAULTS` | `.isdlc/roundtable.yaml` | Comma-separated | `security-reviewer,qa-tester` |
| `ROUNDTABLE_ROSTER_DISABLED` | `.isdlc/roundtable.yaml` | Comma-separated | `ux-reviewer` |
| `ROUNDTABLE_DRIFT_WARNINGS` | Version comparison | Newline-separated | `persona-security-reviewer.md: user v1.0.0, shipped v1.1.0` |
| `ROUNDTABLE_SKIPPED_FILES` | Persona loading | Newline-separated | `persona-bad.md: missing name field` |
| `ROUNDTABLE_PRESELECTED_ROSTER` | `--personas` flag | Comma-separated | `security-reviewer,compliance` (empty if not specified) |

**Mode-specific dispatch behavior**:

| Field | conversational | bulleted | silent |
|-------|---------------|----------|--------|
| `ROUNDTABLE_VERBOSITY` | `conversational` | `bulleted` | `silent` |
| `ROUNDTABLE_ROSTER_DEFAULTS` | Sent | Sent | Ignored (no roster proposal) |
| `ROUNDTABLE_ROSTER_DISABLED` | Sent | Sent | Sent (still filters auto-detection) |
| `ROUNDTABLE_DRIFT_WARNINGS` | Sent | Sent | Suppressed (logged internally only) |
| `ROUNDTABLE_SKIPPED_FILES` | Sent | Sent | Suppressed (logged internally only) |
| `ROUNDTABLE_PRESELECTED_ROSTER` | Sent | Sent | Sent (personas still loaded internally) |
| Persona files in context | All activated | All activated | All loaded (used internally) |

## 6. Topic File Contributing Personas Array

**Location**: `src/claude/skills/analysis-topics/**/*.md`

**Existing schema** (no change needed):
```yaml
contributing_personas:
  - "solutions-architect"
  - "system-designer"
```

**Population updates needed**:

| Topic | Current | Add |
|-------|---------|-----|
| problem-discovery | solutions-architect | ux-reviewer |
| requirements-definition | solutions-architect, system-designer | ux-reviewer, qa-tester |
| technical-analysis | business-analyst | security-reviewer, devops-reviewer |
| architecture | system-designer | security-reviewer, devops-reviewer |
| specification | solutions-architect | qa-tester |
| security | system-designer | security-reviewer |

## 7. Per-Analysis Override Flags

**Location**: `src/antigravity/analyze-item.cjs` CLI argument parsing

**New flags**:

| Flag | Effect | Example |
|------|--------|---------|
| `--verbose` | Sets `ROUNDTABLE_VERBOSITY` to `conversational` for this analysis | `analyze REQ-047 --verbose` |
| `--silent` | Sets `ROUNDTABLE_VERBOSITY` to `silent` for this analysis | `analyze REQ-047 --silent` |
| `--personas <list>` | Pre-selects roster (comma-separated), skips roster proposal | `analyze REQ-047 --personas security,compliance` |

**Precedence**: Per-analysis flag > `.isdlc/roundtable.yaml` > built-in defaults.

**Mutual exclusion**: `--verbose` and `--silent` are mutually exclusive. If both provided, last one wins.

**`--personas` behavior**:
- Primary personas (Maya, Alex, Jordan) are always included regardless of flag
- Named personas are resolved against available persona files (built-in + user)
- Unresolvable names are noted: "No persona file found for 'compliance'. Create one in .isdlc/personas/?"
- When `--personas` is provided, roster proposal dialogue is skipped
- `disabled_personas` config is ignored when `--personas` is explicit (user override wins)

**Natural language override**:
- During an active roundtable, the agent honors verbosity change requests like "switch to conversational" or "show me the full discussion"
- The agent responds with the mode change and continues in the new mode for the remainder of the session
- This is agent behavior, not a code interface -- documented in `roundtable-analyst.md`

## 8. Gitignore Requirements

**Location**: `.gitignore` at project root

**Requirement**: `.isdlc/personas/` MUST NOT be covered by `.gitignore` patterns.

If `.isdlc/` is gitignored (as is common for runtime state), an explicit exception must be added:

```gitignore
# iSDLC runtime state (gitignored)
.isdlc/state.json
.isdlc/projects/

# iSDLC persona files (version-controlled, shareable)
!.isdlc/personas/
```

**Rationale**: Persona files are declarative project configuration, not runtime state. Team members need to share custom personas via version control.
