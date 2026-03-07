---
Status: Draft
Confidence: High
Last Updated: 2026-03-07
Coverage: problem-discovery 95%, requirements-definition 95%
Source: REQ-0047 / GH-108a
Amendment: 2 (hackability review — 12 gaps addressed)
---

# Requirements Specification: Contributing Personas -- Roundtable Extension

## 1. Problem Statement

The roundtable analysis has 3 fixed personas (Maya/BA, Alex/Architect, Jordan/Designer). Users cannot add domain-specific perspectives (security, QA, UX, DevOps, compliance) without modifying framework internals. This limits the value of analysis for projects with specialized domain needs.

Additionally, the roundtable output is always conversational -- personas talk to each other and the user in full prose. Users who want concise, conclusion-only output have no mechanism to control verbosity. Some users may not want persona framing at all and prefer a straight unified analysis.

**Business impact**: Analyses miss domain-critical concerns that surface late in the build cycle, increasing rework cost. Verbose output slows down experienced users who want conclusions, not conversation.

**Success metric**: Users can activate domain-specific personas in a roundtable analysis without editing framework source files. The framework proposes relevant personas automatically based on issue content. Users control output verbosity at the project level and per-analysis, including the option to disable persona framing entirely. Users can suppress, override, or extend every framework default.

## 2. User Types

| User Type | Description | Pain Points |
|-----------|-------------|-------------|
| Framework user (primary) | Developer using iSDLC for analysis | Cannot get domain-specific review during roundtable; must mentally track security/UX/DevOps concerns themselves; output too verbose for experienced users; no option to disable persona framing; no per-analysis control over verbosity or roster |
| Framework customizer (secondary) | Developer who wants project-specific expertise | No mechanism to add custom domain perspectives; persona format is undocumented; no way to suppress unwanted built-in personas; personas not version-controlled with project |
| Roundtable lead (system) | The orchestrating agent | Fixed persona roster; no runtime flexibility to match analysis to issue needs |

## 3. Functional Requirements

### FR-001: Persona Discovery from User Directory
**Priority**: Must Have | **Confidence**: High

The framework SHALL scan `.isdlc/personas/*.md` at roundtable startup and load any valid persona files found alongside the built-in personas.

**Acceptance Criteria**:
- AC-001-01: Persona files in `.isdlc/personas/` matching `*.md` are discovered and loaded
- AC-001-02: Malformed persona files are skipped with a warning (fail-open)
- AC-001-03: User personas with the same filename as a built-in persona override the built-in (override-by-copy)
- AC-001-04: User personas with unique filenames are added alongside built-ins

### FR-002: Built-in Contributing Personas
**Priority**: Must Have | **Confidence**: High

The framework SHALL ship with contributing personas for common domains: Security Reviewer, QA/Test Strategist, UX/Accessibility Reviewer, DevOps/SRE Reviewer, and a blank Domain Expert template.

**Acceptance Criteria**:
- AC-002-01: 5 new persona files ship in `src/claude/agents/`: `persona-security-reviewer.md`, `persona-qa-tester.md`, `persona-ux-reviewer.md`, `persona-devops-reviewer.md`, `persona-domain-expert.md`
- AC-002-02: Each contributing persona has `role_type: contributing` in frontmatter
- AC-002-03: Each contributing persona has `owned_skills` referencing existing framework skills
- AC-002-04: Each contributing persona has a `triggers` array in frontmatter for roster inference
- AC-002-05: Each **shipped** contributing persona uses bullet-only body format (< 40 lines). User-authored personas in `.isdlc/personas/` have no format restrictions -- the user accepts the context cost of longer files.
- AC-002-06: Domain Expert template has blank/placeholder content for user to fill in
- AC-002-07: Domain Expert template includes inline comments explaining each section's purpose: what `triggers` should contain, how to write effective voice rules, what "Flag When You See" vs "Stay Silent About" means, and a note about context window trade-offs for longer files

### FR-003: Roster Proposal and User Confirmation
**Priority**: Must Have | **Confidence**: High

Before the roundtable conversation begins (unless in `silent` mode), the framework SHALL propose a roster of personas based on issue content, and wait for the user to confirm or amend the roster.

**Acceptance Criteria**:
- AC-003-01: Framework reads draft/issue content and matches keywords against persona `triggers` arrays
- AC-003-02: Framework presents proposed roster: "Based on the inputs so far, I think we need the following perspectives: [list]. What do you think?"
- AC-003-03: User can add or remove personas from the proposed roster before analysis begins
- AC-003-04: Framework respects the user's amended roster for the entire analysis session
- AC-003-05: Roster proposal includes domain needs even when no persona file exists for that domain (with guidance to create one)
- AC-003-06: Uncertain keyword matches are flagged in the proposal ("I'm also considering [domain] given [reason]")
- AC-003-07: When in doubt about a domain's relevance, the framework asks the user rather than silently including or excluding
- AC-003-08: Roster proposal is skipped entirely when verbosity is `silent`
- AC-003-09: When persona files were skipped due to validation errors, the roster proposal mentions them: "I found [filename] but couldn't load it ([reason]). Check the format?"
- AC-003-10: Roster proposal shows all available personas (not just matched ones) so the user can discover and add unmatched perspectives. Unmatched personas are listed separately: "Also available: [list]"

### FR-004: Verbosity Mode Toggle
**Priority**: Must Have | **Confidence**: High

The framework SHALL support three verbosity modes for roundtable output: `conversational`, `bulleted`, and `silent`.

**Acceptance Criteria**:
- AC-004-01: `conversational` mode: personas talk naturally, cross-talk visible, questions to each other visible (current behavior)
- AC-004-02: `bulleted` mode: personas deliberate internally, user sees only labeled conclusion bullets per domain, no visible cross-talk
- AC-004-03: In `bulleted` mode, interaction mode is automatically "conclusions only" -- no visible inter-persona dialogue
- AC-004-04: `silent` mode: no persona framing at all -- no roster proposal, no persona voices, no domain labels, no persona names; output is a unified analysis as if written by a single analyst
- AC-004-05: In `silent` mode, persona files are still loaded internally for analytical knowledge, but their identity is invisible to the user
- AC-004-06: In `silent` mode, mid-conversation persona invitation (FR-006) is disabled -- no persona announcements
- AC-004-07: Verbosity mode is a rendering change only; persona files and internal agent behavior are unchanged
- AC-004-08: Project default is `bulleted`
- AC-004-09: In `silent` mode, version drift notifications (FR-010) are suppressed from user-facing output. They are logged internally but not displayed, consistent with the "no persona framing" contract.

### FR-005: Roundtable Configuration File
**Priority**: Must Have | **Confidence**: High

The framework SHALL read roundtable preferences from `.isdlc/roundtable.yaml` and inject them into the dispatch context. CLAUDE.md SHALL reference this config file.

**Acceptance Criteria**:
- AC-005-01: `.isdlc/roundtable.yaml` is read by the session cache builder (`common.cjs`)
- AC-005-02: Config supports `verbosity` field (`conversational` | `bulleted` | `silent`)
- AC-005-03: Config supports optional `default_personas` array (always-include list)
- AC-005-04: Config values are injected into the roundtable dispatch prompt as `ROUNDTABLE_VERBOSITY` and `ROUNDTABLE_ROSTER_DEFAULTS`
- AC-005-05: CLAUDE.md instructions reference the config file so the agent knows to look for it
- AC-005-06: Missing config file defaults to `verbosity: bulleted` with no default personas and no disabled personas
- AC-005-07: Config supports optional `disabled_personas` array (never-propose list). Personas in this list are excluded from roster proposals and auto-detection. Users can still manually request them during roster confirmation.
- AC-005-08: `.isdlc/personas/` directory MUST NOT be gitignored. Persona files are declarative project configuration (not runtime state) and should be version-controlled and shareable across the team.

### FR-006: Mid-Conversation Persona Invitation
**Priority**: Should Have | **Confidence**: High

The roundtable lead SHALL be able to invite a new persona mid-conversation when the topic demands expertise not present in the current roster. This feature is disabled in `silent` mode.

**Acceptance Criteria**:
- AC-006-01: Roundtable lead detects topic shift mapping to an unconfigured domain
- AC-006-02: Lead reads the persona file from built-in or `.isdlc/personas/` directory on demand
- AC-006-03: Lead announces the new persona naturally: "[Name] joining for [domain] perspective"
- AC-006-04: Late-joined persona contributes from that point forward using the same voice rules
- AC-006-05: In `silent` mode, late-join is suppressed -- the analytical knowledge is used internally but not announced

### FR-007: Skill Wiring for Contributing Personas
**Priority**: Must Have | **Confidence**: High

Contributing personas SHALL have `owned_skills` in frontmatter, wired and loaded through the same skill framework as all other agents.

**Acceptance Criteria**:
- AC-007-01: Contributing persona frontmatter includes `owned_skills` array referencing skill IDs
- AC-007-02: Skills are loaded and available to the persona during roundtable analysis
- AC-007-03: Skill observability logging applies to contributing persona skill usage

### FR-008: Contributing Persona Output Integration
**Priority**: Must Have | **Confidence**: Medium

Contributing persona observations SHALL be integrated into existing artifacts owned by the 3 primary personas, not into separate artifact files.

**Acceptance Criteria**:
- AC-008-01: Contributing persona flags/observations are folded into the closest existing artifact section
- AC-008-02: No new artifact files are created by contributing personas
- AC-008-03: Contributing personas do not appear in the confirmation sequence as separate domains
- AC-008-04: In `conversational` and `bulleted` modes, contributing persona observations are attributed (e.g., "[Security]:" prefix on bullets)
- AC-008-05: In `silent` mode, contributing persona observations are folded into the unified output without attribution

### FR-009: Override-by-Copy Mechanism
**Priority**: Must Have | **Confidence**: High

Users SHALL be able to override any built-in persona (primary or contributing) by placing a file with the same name in `.isdlc/personas/`.

**Acceptance Criteria**:
- AC-009-01: `.isdlc/personas/persona-security-reviewer.md` overrides the shipped `src/claude/agents/persona-security-reviewer.md`
- AC-009-02: Override applies to the full file -- no partial merge
- AC-009-03: Built-in primary personas (Maya, Alex, Jordan) can also be overridden via this mechanism

### FR-010: Persona Version Drift Notification
**Priority**: Should Have | **Confidence**: High

When a user override exists and the shipped persona has been updated to a newer version, the framework SHALL notify the user at roundtable startup.

**Acceptance Criteria**:
- AC-010-01: Each built-in persona file includes a `version` field in YAML frontmatter
- AC-010-02: On override detection, framework compares `version` in user file vs shipped file
- AC-010-03: If shipped version is newer, framework emits a non-blocking notification: "Your override of [persona] is based on v[old] but the framework now ships v[new]. Review the changes?"
- AC-010-04: Analysis proceeds with the user's version regardless -- notification is informational only
- AC-010-05: In `silent` mode, drift notifications are suppressed from user output (logged internally only), per AC-004-09

### FR-011: Per-Analysis Override Flags
**Priority**: Should Have | **Confidence**: High

The framework SHALL support per-analysis overrides for verbosity mode and roster composition, allowing the user to override project-level defaults without editing config files.

**Acceptance Criteria**:
- AC-011-01: `--verbose` flag on the analyze verb sets verbosity to `conversational` for that analysis only
- AC-011-02: `--silent` flag on the analyze verb sets verbosity to `silent` for that analysis only
- AC-011-03: `--personas security,compliance` flag pre-selects the roster (in addition to primaries), skipping the roster proposal dialogue
- AC-011-04: Natural language override honored during analysis: user can say "switch to conversational" or "show me the full discussion" and the roundtable agent adjusts verbosity for the remainder of the session
- AC-011-05: Per-analysis overrides do not modify `.isdlc/roundtable.yaml`

## 4. Non-Functional Requirements

| NFR | Description | Threshold |
|-----|-------------|-----------|
| NFR-001 | Persona loading time | < 500ms for 10 persona files |
| NFR-002 | Context window impact | Shipped contributing persona files < 40 lines each. No format restriction on user-authored personas. |
| NFR-003 | Fail-open safety | Bad persona files skip with warning, never crash or corrupt state |
| NFR-004 | Backward compatibility | Existing projects with no `.isdlc/personas/` or `.isdlc/roundtable.yaml` work identically to today |
| NFR-005 | Version control friendliness | `.isdlc/personas/` is not gitignored; persona files are shareable via version control |

## 5. Out of Scope

- **Full persona override** (disable/replace primary personas' artifact ownership) -- deferred to #108b
- **New artifact types** owned by contributing personas
- **Confirmation sequence changes** for contributing persona domains
- **Persona marketplace or sharing mechanism**
- **Automatic persona generation** from project analysis
- **Contributing persona blocker authority** (contributing personas flag, they do not gate decisions)

## 6. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Too many personas dilute signal quality | Medium | Medium | Roster proposal mechanism lets framework and user jointly decide; bulleted mode compresses output; silent mode eliminates persona framing; `disabled_personas` config suppresses unwanted defaults |
| User-authored personas with poor voice rules cause incoherent output | Low | Medium | Fail-open design; framework ships high-quality defaults; Domain Expert template with inline authoring guidance |
| Context window pressure from many persona files | Medium | High | Shipped contributing personas are bullet-only format (< 40 lines); only activated personas are loaded; user accepts context cost of longer custom files |
| Config file schema drift | Low | Low | Simple YAML schema with 3 fields; versioned if needed later |
| Version drift on overridden personas | Medium | Low | FR-010 notification mechanism alerts user to review (suppressed in silent mode per AC-004-09) |
| Roster inference false positives/negatives | Medium | Low | User confirms/amends; uncertain matches flagged explicitly; framework asks when in doubt; all available personas shown for discovery (AC-003-10) |
| Silent mode loses domain-specific attribution | Low | Medium | Artifacts still contain domain analysis; only user-facing output is unified. User can switch modes per-analysis (FR-011) |
| User persona silently skipped due to validation error | Medium | Medium | Skipped files mentioned during roster proposal (AC-003-09) so user can fix the issue |
| User personas not shared across team | Low | High | `.isdlc/personas/` explicitly not gitignored (AC-005-08); personas are declarative config |

## 7. Dependency Map

```
FR-001 (Discovery) <-- FR-009 (Override-by-copy) <-- FR-010 (Version drift)
FR-002 (Built-in personas) <-- FR-007 (Skill wiring)
FR-003 (Roster proposal) <-- FR-001, FR-002, FR-004 (skipped in silent), FR-005 (disabled_personas filtering)
FR-004 (Verbosity) <-- FR-005 (Config file)
FR-006 (Mid-conversation) <-- FR-001, FR-004 (disabled in silent mode)
FR-008 (Output integration) <-- FR-002, FR-004 (attribution varies by mode)
FR-011 (Per-analysis overrides) <-- FR-004 (verbosity), FR-003 (roster)
```
