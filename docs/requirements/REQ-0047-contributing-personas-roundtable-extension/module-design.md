---
Status: Draft
Confidence: High
Last Updated: 2026-03-07
Coverage: specification 95%
Amendment: 2 (hackability review — disabled_personas, per-analysis flags, skipped-file feedback, authoring guidance)
Source: REQ-0047 / GH-108a
---

# Module Design: Contributing Personas -- Roundtable Extension

## 1. Module Map

| Module | Responsibility | Owner | Files |
|--------|---------------|-------|-------|
| M1: Persona Loader | Discover, validate, and resolve persona files with override-by-copy and version drift detection | Alex (architecture) | `analyze-item.cjs`, `common.cjs` |
| M2: Config Reader | Read `.isdlc/roundtable.yaml` and inject into dispatch context | Alex (architecture) | `common.cjs` |
| M3: Roster Proposer | Infer relevant personas from issue content, propose to user, handle amendments. Skipped in `silent` mode. | Jordan (design) | `roundtable-analyst.md` |
| M4: Verbosity Renderer | Control output format based on verbosity mode (`conversational`, `bulleted`, `silent`) | Jordan (design) | `roundtable-analyst.md` |
| M5: Contributing Persona Files | Built-in contributing persona definitions with skills and triggers | N/A (content) | `src/claude/agents/persona-*.md` |
| M6: Late-Join Handler | Read and integrate new persona mid-conversation. Disabled in `silent` mode. | Jordan (design) | `roundtable-analyst.md` |

## 2. Module Details

### M1: Persona Loader

**Current behavior** (`getPersonaPaths()`):
```javascript
function getPersonaPaths(projectRoot) {
    const agentsDir = path.join(projectRoot, 'src', 'claude', 'agents');
    return [
        'persona-business-analyst.md',
        'persona-solutions-architect.md',
        'persona-system-designer.md'
    ].map(f => path.join(agentsDir, f)).filter(f => fs.existsSync(f));
}
```

**New behavior**:
- Scan `src/claude/agents/persona-*.md` for all built-in personas (primary + contributing)
- Scan `.isdlc/personas/*.md` for user personas
- For each user persona: check if same filename exists in built-ins
  - If yes: use user version (override), compare `version` fields, collect drift warnings
  - If no: add as new persona
- Collect `skippedFiles: SkippedFile[]` for files that failed validation
- Return `{ paths: string[], driftWarnings: DriftWarning[], skippedFiles: SkippedFile[] }`

**Data structures**:
```typescript
interface DriftWarning {
    filename: string;           // e.g., "persona-security-reviewer.md"
    userVersion: string;        // e.g., "1.0.0"
    shippedVersion: string;     // e.g., "1.1.0"
    personaName: string;        // e.g., "Security Reviewer"
}

interface SkippedFile {
    filename: string;           // e.g., "persona-bad.md"
    reason: string;             // e.g., "missing name field in frontmatter"
}
```

**Validation rules**:
- File must have YAML frontmatter with `name` field (minimum valid persona)
- Missing `role_type` defaults to `contributing` for user personas, `primary` for built-ins in `src/claude/agents/`
- Missing `version` field: skip drift check for that file
- Malformed YAML: skip file, add to `skippedFiles`, log warning
- No format restrictions on user-authored persona body content (user accepts context cost)

### M2: Config Reader

**Location**: New section in `common.cjs` `buildSessionCache()`, after ROUNDTABLE_CONTEXT.

**Behavior**:
- Read `.isdlc/roundtable.yaml` if it exists
- Parse YAML for `verbosity`, `default_personas`, and `disabled_personas` fields
- Inject as `ROUNDTABLE_CONFIG` section in session cache:
  ```
  --- ROUNDTABLE_CONFIG ---
  verbosity: bulleted
  default_personas: [security-reviewer, qa-tester]
  disabled_personas: [ux-reviewer]
  ---
  ```
- Missing file: default to `{ verbosity: 'bulleted', default_personas: [], disabled_personas: [] }`
- Malformed YAML: log warning, use defaults
- Per-analysis flags (`--verbose`, `--silent`, `--personas`) override config values for that session only

**Config schema**:
```yaml
# .isdlc/roundtable.yaml
verbosity: bulleted              # "conversational" | "bulleted" | "silent" (default: "bulleted")
default_personas:                # optional, always-include in roster proposal
  - security-reviewer
  - qa-tester
disabled_personas:               # optional, never-propose in roster (user can still manually add)
  - ux-reviewer
```

### M3: Roster Proposer

**Location**: New protocol section in `roundtable-analyst.md`, executes before Maya's opening question.

**Mode gating**: Skipped entirely when `ROUNDTABLE_VERBOSITY` is `silent`.

**Behavior** (conversational and bulleted modes):
1. Check for `--personas` pre-selection flag. If present: use pre-selected roster + primaries, skip steps 2-9.
2. Read all available persona files (built-in + user)
3. Filter out personas listed in `disabled_personas` from config
4. Extract `triggers` arrays from each remaining persona's frontmatter
5. Match draft/issue content keywords against triggers
6. Classify matches:
   - **Confident**: 2+ trigger keyword hits = include in proposal
   - **Uncertain**: 1 trigger keyword hit = flag as "also considering"
   - **No match**: 0 hits = list under "Also available"
7. Always include the 3 primary personas (Maya, Alex, Jordan)
8. Always include personas listed in `default_personas` from config (unless also in `disabled_personas` -- disabled wins)
9. If skipped files exist (from persona loading): mention them with reason
10. Present proposal to user showing all three categories (confident, uncertain, available), wait for confirmation
11. User can add any persona -- including disabled ones -- during confirmation (manual override)
12. Apply user amendments to finalize roster

**Output format**:
```
Based on this issue, I think we need the following perspectives:
BA, Architecture, System Design, Security, QA

I'm also considering UX given the user-facing workflow mentioned.

Also available: DevOps

Note: persona-bad.md couldn't be loaded (missing name field). Check the format?

What do you think?
```

### M4: Verbosity Renderer

**Location**: New rendering rules in `roundtable-analyst.md`.

**`conversational` mode** (current behavior):
- Personas speak with name attribution: "**Maya**: ..."
- Cross-talk visible: personas reference each other
- Questions between personas visible
- Full dialogue format

**`bulleted` mode** (new default):
- No persona name attribution in output
- Conclusions grouped by domain label:
  ```
  **Requirements**:
  - [conclusion bullet]
  - [conclusion bullet]

  **Architecture**:
  - [conclusion bullet]

  **Security**:
  - [conclusion bullet from contributing persona]
  ```
- No visible cross-talk or inter-persona dialogue
- Internal deliberation happens but is not rendered
- Questions to the user still appear naturally

**`silent` mode**:
- No persona names, no domain labels, no persona framing
- Output is a unified analysis narrative
- No roster proposal at start
- No mid-conversation persona announcements
- Questions to the user still appear naturally
- Internal persona knowledge is used for analytical depth but is invisible to the user
- Example output:
  ```
  Looking at this feature, the key considerations are:
  - The authentication boundary needs input validation at...
  - The deployment pipeline should account for...
  - From a testability standpoint, the module boundaries suggest...
  ```

### M5: Contributing Persona Files

**Frontmatter schema** (all contributing personas):
```yaml
---
name: persona-{domain}
role_type: contributing
domain: {domain-keyword}
version: 1.0.0
triggers: [keyword1, keyword2, ...]
owned_skills:
  - SKILL-ID  # skill-name
---
```

**Body format** (bullet-only):
```markdown
# {Name} -- {Role}

## Identity
- **Name**: {Name}
- **Role**: {Role}
- **Domain**: {domain}

## Flag When You See
- {trigger condition 1}
- {trigger condition 2}
- ...

## Stay Silent About
- {boundary 1}
- {boundary 2}
- ...

## Voice Rules
- {DO rule 1}
- {DO rule 2}
- {DO NOT rule 1}
- {DO NOT rule 2}
```

**Planned personas**:

| Persona | Domain | Triggers | Owned Skills |
|---------|--------|----------|-------------|
| Security Reviewer | security | authentication, authorization, encryption, input validation, secrets, OWASP, vulnerability, XSS, CSRF, injection | `SEC-001` |
| QA/Test Strategist | testing | test, coverage, regression, edge case, boundary, integration test, unit test, testability | `TEST-001`, `TEST-002` |
| UX/Accessibility Reviewer | ux | user experience, accessibility, a11y, WCAG, usability, onboarding, workflow, UI, interaction | (new or none) |
| DevOps/SRE Reviewer | devops | deployment, CI/CD, monitoring, observability, scaling, infrastructure, container, pipeline, SLA | `OPS-007`, `SRE-001` |
| Domain Expert | domain | (blank -- user fills in) | `owned_skills: []` |

**Domain Expert template authoring guidance** (inline comments in template file):
- `triggers`: List keywords that indicate this domain is relevant. More specific = fewer false positives. Example: "HIPAA, PHI, patient data" for healthcare compliance.
- `Flag When You See`: Conditions where this persona should speak up. Be specific to avoid noise.
- `Stay Silent About`: Boundaries to prevent overlap with other personas.
- `Voice Rules`: DO/DO NOT rules that keep the persona focused. Mirror the style of shipped personas.
- Context window note: "Shipped personas are < 40 lines for efficiency. Your persona can be longer, but each line costs context. Be concise where possible."

### M6: Late-Join Handler

**Location**: New protocol in `roundtable-analyst.md`.

**Mode gating**: Disabled in `silent` mode (analytical knowledge is used internally without announcement).

**Behavior** (conversational and bulleted modes):
1. During conversation, roundtable lead detects topic needing expertise outside current roster
2. Check available personas (built-in + user) for a matching domain
3. If found: read persona file, announce join, integrate
4. If not found: note the gap to the user ("This would benefit from a [domain] perspective, but no persona is configured for that")
5. Late-joined persona follows all existing voice/contribution rules

**Behavior** (silent mode):
1. Topic shift detected -- use available persona knowledge internally
2. No announcement, no persona naming
3. Domain-specific analysis is woven into unified output

## 3. Dependency Graph

```
M2 (Config Reader) --> M3 (Roster Proposer) [verbosity + default_personas + disabled_personas; M3 skipped if silent]
M2 (Config Reader) --> M4 (Verbosity Renderer) [verbosity mode]
M1 (Persona Loader) --> M3 (Roster Proposer) [available personas + triggers + skippedFiles]
M1 (Persona Loader) --> M6 (Late-Join Handler) [persona file access; M6 disabled if silent]
M5 (Persona Files) --> M1 (Persona Loader) [file content]
M5 (Persona Files) --> M3 (Roster Proposer) [triggers arrays]
Per-analysis flags --> M2 (Config Reader) [override verbosity]
Per-analysis flags --> M3 (Roster Proposer) [--personas pre-selection skips proposal]
```

No circular dependencies.
