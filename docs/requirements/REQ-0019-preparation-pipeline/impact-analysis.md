# Impact Analysis: REQ-0019 Preparation Pipeline

**Generated**: 2026-02-16T08:00:00Z
**Feature**: Decouple requirements capture from implementation via Phase A (preparation) and Phase B (execution) split
**Based On**: Phase 01 Requirements (finalized -- requirements-spec.md)
**Phase**: 02-impact-analysis

---

## Scope Comparison

| Aspect | Original (Delegation Prompt) | Clarified (Phase 01) |
|--------|------------------------------|----------------------|
| Description | Preparation pipeline decoupling requirements from implementation | Phase A/B split with source-agnostic intake, meta tracking, staleness detection, BACKLOG restructure, intent detection |
| Keywords | preparation, pipeline, Phase A, Phase B | intake, analyze, start, meta.json, codebase_hash, staleness, BACKLOG index, intent detection, source-agnostic |
| Estimated Files | 4 files listed explicitly | 4 primary files confirmed, plus downstream consumers |
| Scope Change | - | REFINED (same files, much richer behavioral specification: 9 FRs, 4 NFRs, 35 ACs) |

---

## Executive Summary

This feature modifies **4 primary files** across **3 modules** (commands, agents/templates, project config). All changes are **prompt/markdown only** -- no JavaScript hooks, no state.json schema changes, no new agents. The blast radius is LOW because the 4 files are leaf nodes in the dependency graph: they are read by LLM agents at runtime but are not imported or required by JavaScript code. The main risk is behavioral correctness -- the new SCENARIO in `isdlc.md` must correctly integrate with the existing phase-loop controller (STEP 3), and the BACKLOG.md restructure must preserve all existing test assertions that verify BACKLOG.md content patterns. The feature introduces one entirely new artifact (`meta.json`) and one new concept (Phase A/B split) that must be documented clearly to avoid confusion with existing Phase 00/01 nomenclature.

**Blast Radius**: LOW (4 files directly modified, 0 JavaScript code changes)
**Risk Level**: LOW-MEDIUM
**Affected Files**: 4 direct, 6 downstream consumers
**Affected Modules**: 3 (commands, templates, project-root config)

---

## Impact Analysis

### M1: Files Directly Affected

| # | File | Change Type | Lines (current) | FRs Served |
|---|------|-------------|-----------------|------------|
| 1 | `src/claude/commands/isdlc.md` | MODIFY | 1,227 | FR-001, FR-002, FR-003, FR-004, FR-005, FR-006 |
| 2 | `src/claude/CLAUDE.md.template` | MODIFY | 254 | FR-008 |
| 3 | `CLAUDE.md` (project root) | MODIFY | 59 | FR-008 (dogfooding mirror) |
| 4 | `BACKLOG.md` | RESTRUCTURE | 650 | FR-007 |

### Detailed Change Map

#### 1. `src/claude/commands/isdlc.md` (1,227 lines)

**New content to add:**

- **New SCENARIO 5**: "Phase A -- Preparation Pipeline" section covering intake (FR-001), deep analysis (FR-002), source-agnostic intake (FR-003), meta.json tracking (FR-004). Estimated +80-120 lines.
- **Phase B consumption logic**: New `start` action alongside existing `feature`/`fix` actions covering Phase B validation, staleness check, and workflow init from Phase 02 (FR-005). Estimated +40-60 lines.
- **Artifact folder unification**: Documentation that Phase B writes to the same `docs/requirements/{slug}/` folder (FR-006). Estimated +10-15 lines.
- **Modify STEP 3 (phase-loop)**: Add conditional logic: when workflow is initiated via Phase B consumption (`start`), skip Phase 00 and Phase 01 in the phase array. The `phases[]` array in the init result would start from `02-impact-analysis`. Estimated +5-10 lines of clarification.

**Existing content modified:**

- **Workflows table** (line ~682-689): Add `start` action row.
- **Action commands section** (line ~232): Add `start` action documentation.
- **Phase-Loop Controller STEP 1** (line ~762): Add `start` as a recognized workflow command.

**Net change estimate**: +135-205 lines added, ~15 lines modified.

#### 2. `src/claude/CLAUDE.md.template` (254 lines)

**New content to add:**

- **Intent detection table** (line ~11-18): Add three new rows:
  - Intake: "add to backlog", "import", "intake" -> Phase A intake flow
  - Analyze: "analyze", "deep analysis", "prepare" -> Phase A intake + deep analysis
  - Start: "start {item}", "let's work on", "begin {item}" -> Phase B consumption
- **Backlog Operations table** (line ~167-173): Already has "Let's work on" -> "Start item". Needs alignment with new Phase B consumption semantics. May need a note about `meta.json` validation.

**Existing content modified:**

- The "Let's work on" row in Backlog Operations (line 172) currently points to the backlog picker. Phase B consumption changes the semantics: it now validates `meta.json`, checks staleness, and starts from Phase 02 instead of Phase 01.

**Net change estimate**: +15-25 lines added, ~5 lines modified.

#### 3. `CLAUDE.md` (project root, 59 lines)

**New content to add:**

- Mirror the intent detection patterns from `CLAUDE.md.template` for dogfooding (AC-008-04).
- Add preparation pipeline section with same intake/analyze/start patterns.

**Net change estimate**: +10-15 lines added.

#### 4. `BACKLOG.md` (650 lines)

**Restructure (not incremental modify):**

- Transform from inline spec repository (~650 lines) to lightweight index (~80-120 lines).
- Each open item becomes a one-line entry: `- {id} [ ] {title} -> [requirements](docs/requirements/{slug}/)`.
- Inline specs for open items move to `docs/requirements/{slug}/draft.md`.
- Completed items become one-line entries with `[x]` checkbox and completion date.
- Section headings preserved.

**Net change**: From ~650 lines to ~80-120 lines. Content migrated, not deleted.

### Outward Dependencies (What Reads These Files)

| File Modified | Read By | Impact |
|---------------|---------|--------|
| `isdlc.md` | `gate-blocker.cjs` (references isdlc.md path) | No behavioral change -- gate-blocker checks for file existence only |
| `isdlc.md` | All phase agents (via phase-loop delegation) | Agents receive delegation prompts constructed from isdlc.md logic -- new `start` action affects orchestrator init only |
| `CLAUDE.md.template` | `install.sh`, `install.ps1`, `lib/installer.js` | Installers copy CLAUDE.md.template to project root. No structural change to template format, just added content |
| `BACKLOG.md` | `isdlc.md` (backlog picker references) | Backlog picker scans for `- N.N [ ] <text>` patterns. New index format changes the pattern to `- {id} [ ] {title} -> [requirements](...)`. **RISK: Pattern mismatch** |
| `BACKLOG.md` | `00-sdlc-orchestrator.md` (backlog picker) | Same pattern dependency as above |
| `BACKLOG.md` | `01-requirements-analyst.md` (references BACKLOG.md) | References backlog items for context -- format change needs attention |
| `BACKLOG.md` | `src/claude/CLAUDE.md.template` (backlog operations) | Template describes backlog format -- must match new index format |
| `BACKLOG.md` | Test files: `backlog-command-spec.test.cjs`, `backlog-claudemd-template.test.cjs`, `backlog-orchestrator.test.cjs`, `backlog-requirements-analyst.test.cjs`, `backlog-validation-rules.test.cjs` | **RISK: Tests verify BACKLOG.md content patterns.** Format change will break assertions. |

### Inward Dependencies (What These Files Depend On)

| File Modified | Depends On | Impact |
|---------------|------------|--------|
| `isdlc.md` | `workflows.json` (workflow definitions) | New `start` action may need a workflow entry or reuse `feature` workflow with modified phase list |
| `isdlc.md` | `state.json` schema (active_workflow) | No schema changes needed -- `start` reuses existing `active_workflow` structure with `type: "feature"` |
| `isdlc.md` | Agent files (phase delegation) | No agent changes -- Phase B delegates to same agents starting from Phase 02 |
| `CLAUDE.md.template` | MCP servers (Jira, Confluence) | Source-agnostic intake depends on MCP availability, with graceful fallback (already designed in NFR-004) |

---

## Entry Points

### M2: Implementation Entry Points

#### Recommended Implementation Order

| Order | File | Rationale |
|-------|------|-----------|
| 1 | `BACKLOG.md` restructure | Foundation change. All other files reference BACKLOG.md patterns. Must be done first so downstream pattern references can target the new format. |
| 2 | `src/claude/commands/isdlc.md` | Core logic. New SCENARIO + `start` action + Phase B consumption + phase-loop modifications. Largest change, most complex. |
| 3 | `src/claude/CLAUDE.md.template` | Intent detection. Adds new intent patterns and updates backlog operations table. Depends on isdlc.md having the new actions defined. |
| 4 | `CLAUDE.md` (project root) | Dogfooding mirror. Simply mirrors what was added to CLAUDE.md.template. |

#### Entry Points per Functional Requirement

**FR-001 (Phase A Intake):**
- Entry: `isdlc.md` -> New SCENARIO section
- Chain: User intent -> CLAUDE.md.template intent table -> isdlc.md SCENARIO -> create `docs/requirements/{slug}/draft.md` + BACKLOG.md index entry

**FR-002 (Phase A Deep Analysis):**
- Entry: `isdlc.md` -> Same SCENARIO, conditional "deep analysis" offer
- Chain: User accepts -> run Phase 00 logic (quick-scan) + Phase 01 logic (requirements capture with personas) -> write artifacts to `docs/requirements/{slug}/`

**FR-003 (Source-Agnostic Intake):**
- Entry: `isdlc.md` -> Intake SCENARIO with source detection
- Chain: Detect source type (Jira URL, GitHub URL, manual) -> use appropriate adapter -> write `draft.md`

**FR-004 (Meta Tracking):**
- Entry: `isdlc.md` -> Intake SCENARIO, meta.json creation
- Chain: After intake/analysis -> write `meta.json` with source, slug, codebase_hash, phase_a_completed

**FR-005 (Phase B Consumption):**
- Entry: `isdlc.md` -> New `start` action
- Chain: User says "start {item}" -> locate `docs/requirements/{slug}/` -> validate `meta.json` -> staleness check -> init workflow from Phase 02

**FR-006 (Artifact Folder Unification):**
- Entry: `isdlc.md` -> Phase B init logic
- Chain: Set `artifact_folder` to the `{slug}` from Phase A -> all phase agents write to same folder

**FR-007 (BACKLOG.md Restructure):**
- Entry: `BACKLOG.md` (direct edit)
- Chain: For each open item with inline spec -> extract to `docs/requirements/{slug}/draft.md` -> replace with index entry

**FR-008 (Intent Detection):**
- Entry: `CLAUDE.md.template` -> Intent detection table
- Chain: Add intake/analyze/start patterns -> mirror to project `CLAUDE.md`

**FR-009 (Documentation):**
- Entry: Multiple files (inline documentation within isdlc.md and CLAUDE.md.template)
- Chain: Document Phase A/B split, folder structure, example UX flows

#### New Entry Points to Create

| Entry Point | Type | File |
|-------------|------|------|
| Phase A intake flow | New SCENARIO in isdlc.md | `isdlc.md` |
| `start` action | New action in isdlc.md | `isdlc.md` |
| Intake intent pattern | New row in intent table | `CLAUDE.md.template` |
| Analyze intent pattern | New row in intent table | `CLAUDE.md.template` |
| Start intent pattern | New row in intent table | `CLAUDE.md.template` |
| `meta.json` schema | New concept (documented inline) | `isdlc.md` |
| `docs/requirements/{slug}/` folders | New directories per backlog item | Created during BACKLOG.md restructure |

---

## Risk Assessment

### M3: Risk Analysis

#### Test Coverage for Affected Files

| File | Test Files | Coverage Level | Risk |
|------|-----------|----------------|------|
| `src/claude/commands/isdlc.md` | `backlog-command-spec.test.cjs` | PARTIAL -- tests verify specific patterns (no-description flow, BACKLOG.md references) | MEDIUM |
| `src/claude/CLAUDE.md.template` | `backlog-claudemd-template.test.cjs` | PARTIAL -- tests verify backlog operations table patterns | MEDIUM |
| `CLAUDE.md` | None | ZERO -- no tests cover project-root CLAUDE.md | LOW (trivial mirror) |
| `BACKLOG.md` | `backlog-validation-rules.test.cjs`, `backlog-orchestrator.test.cjs`, `backlog-requirements-analyst.test.cjs`, `backlog-command-spec.test.cjs` | MODERATE -- 4 test files verify BACKLOG.md patterns | HIGH (format change) |

#### Risk Zones

**RISK-1: BACKLOG.md Pattern Breakage (HIGH)**
- **What**: The BACKLOG.md restructure changes the item format from `- N.N [ ] <text>\n  <multi-line spec>` to `- {id} [ ] {title} -> [requirements](docs/requirements/{slug}/)`. Five test files scan BACKLOG.md for specific patterns.
- **Impact**: Tests in `backlog-command-spec.test.cjs`, `backlog-orchestrator.test.cjs`, `backlog-requirements-analyst.test.cjs`, `backlog-claudemd-template.test.cjs`, and `backlog-validation-rules.test.cjs` may fail.
- **Mitigation**: Update test assertions to match new index format. Run all backlog tests after restructure. Consider updating tests first (test-first approach for the restructure).
- **Severity**: HIGH -- will cause test failures if not addressed.

**RISK-2: Backlog Picker Pattern Mismatch (MEDIUM)**
- **What**: The orchestrator's backlog picker (in `00-sdlc-orchestrator.md` line ~294) scans for `- N.N [ ] <text>` patterns. The new index format uses `- {id} [ ] {title} -> [requirements](...)`. If the picker regex/pattern is not updated, it will fail to parse items.
- **Impact**: `/isdlc feature` (no description) and `/isdlc fix` (no description) backlog picker broken.
- **Mitigation**: Update the backlog picker pattern description in `00-sdlc-orchestrator.md` to match new format. Note: the spec says "no changes to existing agent files" -- this may need revision or the new BACKLOG format must be backward-compatible with the existing pattern.
- **Severity**: MEDIUM -- affects UX flow but not core implementation.

**RISK-3: Phase B / Existing "start" Semantics Overlap (MEDIUM)**
- **What**: `CLAUDE.md.template` already has "Let's work on PROJ-1234" / "Start item N.N" in the Backlog Operations table (line 172). This currently routes to the backlog picker -> standard workflow. Phase B consumption changes these semantics to: validate meta.json -> skip Phase 00/01 -> start from Phase 02.
- **Impact**: Behavioral regression for users who say "start X" expecting the full workflow. Need clear distinction between items with prepared requirements vs. items without.
- **Mitigation**: Phase B logic checks `meta.json.phase_a_completed`. If false or missing, falls back to full workflow. This is already specified in AC-005-02 and AC-005-03.
- **Severity**: MEDIUM -- well-mitigated by the spec's fallback design.

**RISK-4: Naming Confusion (Phase A/B vs. Phase 00/01) (LOW)**
- **What**: The framework already uses "Phase 00" through "Phase 16" for workflow phases. Introducing "Phase A" and "Phase B" as a parallel concept may confuse developers.
- **Impact**: Documentation confusion, potential misuse.
- **Mitigation**: Clear documentation in isdlc.md distinguishing "Phase A (preparation, outside workflow)" from "Phase 00-16 (inside workflow)". Use "Preparation" and "Execution" as primary labels, "Phase A/B" as shorthand.
- **Severity**: LOW -- documentation-only concern.

**RISK-5: BACKLOG.md Migration Data Integrity (LOW)**
- **What**: Migrating ~650 lines of inline specs to individual `docs/requirements/{slug}/draft.md` files is a one-time bulk operation. Risk of content loss or misattribution during migration.
- **Impact**: Lost backlog item details.
- **Mitigation**: Git tracks all changes. Migration can be verified by diffing before/after. Completed items need only one-line preservation.
- **Severity**: LOW -- git provides safety net.

#### Complexity Hotspots

| Area | Complexity | Reason |
|------|-----------|--------|
| Phase B consumption (isdlc.md STEP 1/3) | MEDIUM | Must integrate with existing phase-loop controller, handle `start` as new workflow command, correctly skip Phase 00/01 |
| Staleness detection (AC-005-04) | LOW | Simple git rev-list count between two SHAs |
| Source-agnostic intake (FR-003) | MEDIUM | Multiple source types (Jira, GitHub, manual, migration), each with different error handling |
| Meta.json validation (NFR-001) | LOW | Straightforward JSON schema validation with clear error messages |
| BACKLOG.md restructure (FR-007) | LOW | Mechanical migration, git-tracked |

#### Technical Debt Markers

- **isdlc.md is already 1,227 lines**: Adding 135-205 more lines pushes it further. Consider if Phase A SCENARIO should be extracted to a separate file in a future refactor (outside this feature's scope).
- **CLAUDE.md.template backlog operations overlap**: The existing "Let's work on" pattern and the new "start" Phase B pattern serve different purposes but look identical to the user. Needs careful UX documentation.

---

## Implementation Recommendations

Based on the impact analysis:

1. **Suggested Order**: BACKLOG.md restructure first (foundation), then isdlc.md (core logic), then CLAUDE.md.template (intent detection), then CLAUDE.md (mirror).

2. **High-Risk Areas -- Add Tests First**:
   - Update the 5 backlog test files (`backlog-command-spec.test.cjs`, `backlog-claudemd-template.test.cjs`, `backlog-orchestrator.test.cjs`, `backlog-requirements-analyst.test.cjs`, `backlog-validation-rules.test.cjs`) to expect the new BACKLOG.md index format BEFORE performing the restructure.
   - Verify that the backlog picker pattern in `00-sdlc-orchestrator.md` is compatible with the new format, or document this as an out-of-scope change that must accompany the restructure.

3. **Dependencies to Resolve**:
   - Determine whether `start` is a new workflow type in `workflows.json` or reuses the `feature` workflow with a modified phase list. The spec implies reuse (same phases minus 00/01) but this needs explicit architecture decision.
   - Confirm that the orchestrator's backlog picker pattern (`- N.N [ ] <text>`) will be updated to handle the new index format. If the spec constraint "no changes to existing agent files" stands, the new BACKLOG.md format must remain parseable by the existing pattern.

4. **Out-of-Scope but Noted**:
   - `00-sdlc-orchestrator.md` backlog picker may need a pattern update (not listed in spec's "Files to Change" but affected by BACKLOG.md restructure).
   - `workflows.json` may need a `start` or `prepared-feature` workflow entry.
   - The 5 backlog test files need updates to match the new BACKLOG.md format.

---

## Impact Analysis Metadata

The following JSON block is required for automated sizing analysis (REQ-0011).
All fields are required. The `parseSizingFromImpactAnalysis()` function reads
the LAST JSON block in the file to extract sizing metrics.

```json
{
  "analysis_completed_at": "2026-02-16T08:00:00Z",
  "sub_agents": ["M1", "M2", "M3"],
  "requirements_document": "docs/requirements/REQ-0019-preparation-pipeline/requirements-spec.md",
  "quick_scan_used": "N/A (no quick-scan.md exists for this feature)",
  "scope_change_from_original": "refined",
  "requirements_keywords": ["intake", "analyze", "start", "preparation", "pipeline", "Phase A", "Phase B", "meta.json", "codebase_hash", "staleness", "BACKLOG", "index", "intent", "detection", "source-agnostic"],
  "files_directly_affected": 4,
  "modules_affected": 3,
  "risk_level": "low-medium",
  "blast_radius": "low",
  "coverage_gaps": 1
}
```

**`coverage_gaps` derivation**: Of the 4 directly affected files, only `CLAUDE.md` (project root) has zero test coverage. The other 3 files have partial-to-moderate test coverage through the backlog test suite.
