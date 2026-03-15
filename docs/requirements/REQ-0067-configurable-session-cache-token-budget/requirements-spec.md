# Requirements Specification: Configurable Session Cache Token Budget

**REQ-0067** | **Status**: Analyzed | **Generated**: 2026-03-16

---

## 1. Business Context

The session cache (`rebuildSessionCache()` in common.cjs) assembles all static framework content into a single file injected at conversation start. It currently has hardcoded limits — a 128K character warning threshold and 5K character external skill truncation — that cannot be tuned per project.

With 1M context window models now available, these limits are unnecessarily conservative for large projects (the dogfooding project already exceeds 128K at 170K chars) while potentially too generous for small projects that want a lean cache to leave room for conversation.

**Problem**: No way to control how much context budget the session cache consumes. One size does not fit all projects.

**Success metric**: Users can set a single token budget and the framework automatically allocates across sections by configurable priority.

## 2. Stakeholders and Personas

**Primary user**: iSDLC framework user (developer or team lead) who installs iSDLC on their project and wants to tune context usage.

**Pain points**:
- Cannot control session cache size — it's whatever the framework generates
- Large projects may want more cache (200-300K tokens) for richer context
- Small projects may want less cache (50K tokens) to preserve conversation space
- No visibility into what's consuming the cache budget

## 3. User Journeys

**Journey 1: Configure budget**
- Entry: User creates or edits `.isdlc/config`
- Flow: Set `cache.budget_tokens` to desired value → run `node bin/rebuild-cache.js` → see budget usage report
- Exit: Cache rebuilt within budget, sections prioritized accordingly

**Journey 2: Default experience**
- Entry: User installs iSDLC, never touches config
- Flow: Framework uses 100K token default → cache sections filled by default priority order
- Exit: Cache works out of the box with sensible defaults

**Journey 3: Customize priorities**
- Entry: User overrides `cache.section_priorities` to prioritize roundtable context over skills
- Flow: Edit `.isdlc/config` → rebuild cache → higher-priority sections get budget first
- Exit: Cache reflects user's priority preferences

## 4. Technical Context

**Existing infrastructure**:
- `rebuildSessionCache()` in `src/claude/hooks/lib/common.cjs` (~270 lines)
- `bin/rebuild-cache.js` CLI wrapper
- `.isdlc/` directory for framework runtime files (state.json, session-cache.md)
- `.isdlc/process.json` exists for process config (separate concern)

**Conventions**: CommonJS for hooks (Article XIII), fail-open on errors (Article X), no new dependencies.

## 5. Quality Attributes and Risks

| Attribute | Priority | Threshold |
|-----------|----------|-----------|
| Backward compatibility | Critical | Zero breaking changes for projects without `.isdlc/config` |
| Fail-open behavior | Critical | Missing/malformed config → defaults, never crash |
| Performance | High | Cache rebuild time: no measurable regression |
| Accuracy | Medium | Token estimate within 20% of real token count |

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| chars/4 approximation too inaccurate | Low | Low | Sufficient for budget ceiling; can upgrade to tokenizer later |
| Users set budget too low, lose important sections | Medium | Medium | Warn on stderr when sections are skipped; document minimum recommended budget |
| Config file conflicts with future config needs | Low | Medium | JSON schema is extensible; future config lands in same file |

## 6. Functional Requirements

### FR-001: Create `.isdlc/config` JSON configuration file

**Description**: Introduce a new project-level configuration file at `.isdlc/config` (JSON, no extension) with a `cache` section containing `budget_tokens` and `section_priorities`.

**Confidence**: High

**Acceptance Criteria**:
- AC-001-01: Given `.isdlc/config` exists with `{"cache": {"budget_tokens": 150000}}`, when `readConfig()` is called, then it returns `cache.budget_tokens` as 150000.
- AC-001-02: Given `.isdlc/config` exists with partial overrides (only `budget_tokens`, no `section_priorities`), when `readConfig()` is called, then missing fields are filled from defaults.
- AC-001-03: Given `.isdlc/config` does not exist, when `readConfig()` is called, then full defaults are returned (budget_tokens: 100000, all 9 section priorities).

### FR-002: `readConfig()` utility function in common.cjs

**Description**: Add a `readConfig(projectRoot?)` function that reads `.isdlc/config`, deep-merges with defaults, caches per-process, and returns the merged config. Fail-open on all errors.

**Confidence**: High

**Acceptance Criteria**:
- AC-002-01: Given `.isdlc/config` contains valid JSON, when `readConfig()` is called twice, then the file is read only once (cached).
- AC-002-02: Given `.isdlc/config` contains malformed JSON, when `readConfig()` is called, then a warning is emitted to stderr and defaults are returned.
- AC-002-03: Given `budget_tokens` is negative, when `readConfig()` is called, then a warning is emitted and budget_tokens defaults to 100000.
- AC-002-04: Given an unknown section name in `section_priorities`, when `readConfig()` is called, then the unknown key is ignored (forward-compatible).

### FR-003: Budget-aware `rebuildSessionCache()`

**Description**: Update `rebuildSessionCache()` to allocate sections within the configured token budget using a priority-queue fill algorithm.

**Confidence**: High

**Acceptance Criteria**:
- AC-003-01: Given budget is 50000 tokens and all sections total 80000 tokens, when cache is rebuilt, then only sections fitting within 50000 tokens are included (by priority order), and remaining sections are marked `SKIPPED: budget_exceeded`.
- AC-003-02: Given a section partially fits the remaining budget, when cache is rebuilt, then the section is truncated at the last newline before the budget limit with `[... truncated for context budget ...]` appended.
- AC-003-03: Given budget is 500000 tokens and all sections total 50000 tokens, when cache is rebuilt, then all sections are included in full (budget is a ceiling, not a target).
- AC-003-04: Given sections have priorities [constitution=1, roundtable_context=3, skills_manifest=2], when budget forces truncation, then roundtable_context (priority 3) is truncated/skipped before skills_manifest (priority 2).

### FR-004: Replace hardcoded 128K warning with budget-based warning

**Description**: Replace the `output.length > 128000` warning with a budget-aware check using the configured token budget.

**Confidence**: High

**Acceptance Criteria**:
- AC-004-01: Given budget is 100000 tokens and generated cache is 120000 tokens equivalent, when cache is rebuilt, then a stderr warning is emitted with actual vs budget token counts.
- AC-004-02: Given budget is 100000 tokens and generated cache is 80000 tokens equivalent, when cache is rebuilt, then no warning is emitted.

### FR-005: Replace hardcoded 5K external skill truncation

**Description**: Replace the hardcoded 5000 character external skill truncation with a budget-derived limit: remaining budget after higher-priority sections, divided by skill count, with a minimum of 1000 chars per skill.

**Confidence**: High

**Acceptance Criteria**:
- AC-005-01: Given 3 external skills and 40000 chars of remaining budget, when external skills section is built, then each skill gets up to ~13333 chars (40000/3).
- AC-005-02: Given 10 external skills and 5000 chars of remaining budget, when external skills section is built, then each skill gets the minimum 1000 chars (not 500).
- AC-005-03: Given no `.isdlc/config` exists (defaults), when external skills section is built, then the truncation limit is derived from the default 100K token budget, not hardcoded 5000.

### FR-006: Default configuration values

**Description**: Define sensible defaults for all configuration values.

**Confidence**: High

**Acceptance Criteria**:
- AC-006-01: Given no `.isdlc/config` exists, when `readConfig()` is called, then `budget_tokens` is 100000.
- AC-006-02: Given no `.isdlc/config` exists, when `readConfig()` is called, then section priorities are: constitution=1, workflow_config=2, iteration_requirements=3, artifact_paths=4, skills_manifest=5, skill_index=6, external_skills=7, roundtable_context=8, instructions=9.

### FR-007: Fail-open behavior

**Description**: All config reading and budget allocation errors must fail open — never crash, never block cache generation.

**Confidence**: High

**Acceptance Criteria**:
- AC-007-01: Given `.isdlc/config` is missing, when `rebuildSessionCache()` runs, then cache is generated with defaults (no error, no crash).
- AC-007-02: Given `.isdlc/config` contains `{"cache": {"budget_tokens": "not_a_number"}}`, when `readConfig()` is called, then a warning is emitted and budget defaults to 100000.

### FR-008: CLI budget usage reporting

**Description**: Update `rebuild-cache.js` to report budget usage after rebuilding.

**Confidence**: High

**Acceptance Criteria**:
- AC-008-01: Given cache is rebuilt within budget, when CLI output is displayed, then it includes `Budget: {used}/{budget} tokens ({percent}%)` and `Sections: {N}/{total} included`.
- AC-008-02: Given sections were skipped due to budget, when CLI output is displayed, then skipped section names are listed.

## 7. Out of Scope

| Item | Reason |
|------|--------|
| Real tokenizer integration | No new dependencies (NFR). chars/4 is sufficient for a ceiling. Can revisit later. |
| Per-section max limits | Overcomplicates config. Priority-based allocation achieves the same goal. |
| Dynamic budget based on model context window | Model detection is unreliable. User sets budget explicitly. |
| Migration of existing configs to `.isdlc/config` | Separate ticket (noted in draft). This ticket creates the file and cache config only. |

## 8. MoSCoW Prioritization

| FR | Title | Priority | Rationale |
|----|-------|----------|-----------|
| FR-001 | `.isdlc/config` file | Must Have | Foundation for all other FRs |
| FR-002 | `readConfig()` utility | Must Have | Required by FR-003 |
| FR-003 | Budget-aware cache rebuild | Must Have | Core feature |
| FR-004 | Budget-based warning | Must Have | Replaces broken hardcoded check |
| FR-005 | Dynamic external skill truncation | Must Have | Removes arbitrary hardcoded limit |
| FR-006 | Default values | Must Have | Backward compatibility |
| FR-007 | Fail-open behavior | Must Have | Article X compliance |
| FR-008 | CLI budget reporting | Should Have | Visibility into budget usage |

## 9. Constraints

### CON-001: No new dependencies
The implementation must use only existing Node.js APIs and framework infrastructure. Token estimation uses `Math.ceil(chars / 4)`.

### CON-002: CommonJS only
All changes are in hook files (common.cjs, rebuild-cache CLI uses createRequire bridge). Article XIII compliance.

### CON-003: `.isdlc/config` is extensible
The JSON schema must support future config sections beyond `cache`. Use top-level keys for namespacing.
