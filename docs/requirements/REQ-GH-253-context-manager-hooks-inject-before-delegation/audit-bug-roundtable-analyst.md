# Bucketed Audit: bug-roundtable-analyst.md

## Summary
- Total lines: 573
- Bucket 1 (already enforced by code): 42 lines (7%)
- Bucket 2 (expressible as validator): 37 lines (6%)
- Bucket 3 (template-bound): 71 lines (12%)
- Bucket 4 (LLM-prose-needed): 282 lines (49%)
- Bucket 5 (dead/dormant): 141 lines (25%)
- **Cuttable (1+2+3+5)**: 291 lines (51%)
- **Must keep (4)**: 282 lines (49%)

## Section-by-Section Classification

### Frontmatter + Execution mode preamble (lines 1-13)

| Subsection | Lines | Bucket | Rationale |
|---|---|---|---|
| YAML frontmatter (name, description, model, owned_skills) | 1-6 | **3 (template-bound)** | This metadata can live in a structured config (core.json or agent manifest). The name, model, and description are declarative and do not require LLM prose reading. |
| Execution mode blockquote ("This file is a protocol reference document...") | 8-12 | **5 (dead)** | Near-identical to roundtable-analyst.md lines 8-14. This is a shared invariant about execution mode that belongs in core.json under GH-253 architecture. Duplicating it in both files is dead weight. |

**Subtotal**: 13 lines (3 template-bound, 5 dead, 5 blank/structural)

---

### §1. Purpose & Non-Negotiables (lines 14-46)

| Subsection | Lines | Bucket | Rationale |
|---|---|---|---|
| Purpose paragraph ("You lead a bug-specific roundtable...") | 18-23 | **4 (LLM-prose-needed)** | Bug-specific framing that tells the LLM its role and the four artifacts it produces. This is behavior-shaping prose unique to the bug roundtable. The feature roundtable has a different purpose and different artifact set. |
| Rule 1: No collapse from clarification to artifact generation | 27-28 | **5 (dead/duplicate)** | Near-identical to roundtable-analyst.md §1.1 rule 2. Shared anti-shortcut invariant belongs in core.json. |
| Rule 2: No write before confirmations (except bug-report.md) | 29-31 | **4 (LLM-prose-needed)** | The bug-report.md exception is unique to the bug roundtable (tracing delegation needs it). This exception clause cannot be a shared invariant. |
| Rule 3: Confirmation state order (BUG_SUMMARY -> ROOT_CAUSE -> FIX_STRATEGY -> TASKS) | 32-33 | **3 (template-bound)** | The state ordering can be declared in a state-machine config (core.json states array). The bug-specific state names differ from the feature roundtable. |
| Rule 4: No advance without explicit Accept | 34-35 | **5 (dead/duplicate)** | Identical to roundtable-analyst.md §1.1 rule implied by §2.1 + §7.4. Shared invariant. |
| Rule 5: TASKS renders as traceability table | 36-37 | **1 (already enforced)** | Enforced by `tasks-as-table-validator.cjs` hook which checks for the 4-column pipe-delimited header at PRESENTING_TASKS state. |
| Rule 6: Template authority is state-local | 38-39 | **5 (dead/duplicate)** | Identical to roundtable-analyst.md §7 preamble. Shared invariant. |
| Rule 7: No state.json writes | 40-41 | **1 (already enforced)** | Enforced by `state-file-guard.cjs` hook which blocks Bash commands writing to state.json. |
| Rule 8: No branch creation | 42 | **1 (already enforced)** | Enforced by `branch-guard.cjs` hook which blocks git operations on main. |
| Rule 9: No framework internals | 43-44 | **2 (expressible as validator)** | Could be a compliance rule that checks for Read calls targeting state.json, active_workflow, hooks source, workflows.json, common.cjs. Not currently enforced by any hook. |
| Rule 10: Single-line Bash | 45 | **5 (dead/duplicate)** | Shared convention already documented in CLAUDE.md "Single-Line Bash Convention". Duplicate. |

**Subtotal**: 33 lines (6 already-enforced, 2 expressible-as-validator, 3 template-bound, 8 LLM-prose, 14 dead/duplicate)

---

### §2. Behavior Contract (lines 47-73)

| Subsection | Lines | Bucket | Rationale |
|---|---|---|---|
| Stop/wait contract (RETURN-FOR-INPUT, CON-005) | 49-55 | **5 (dead/duplicate)** | Near-identical to roundtable-analyst.md §2.1 (stop/wait contract). Shared invariant. The bug roundtable does not add any unique stop/wait behavior. |
| No-write-before-confirmations clause | 57-61 | **4 (LLM-prose-needed)** | Partially duplicated, BUT the bug-report.md exception (line 59) is unique to the bug roundtable. The exception clause requires LLM reading. Keep, but slim to just the exception. |
| Single source of truth for templates | 63-65 | **5 (dead/duplicate)** | Identical to roundtable-analyst.md §7 preamble. Shared invariant. |
| Anti-shortcut enforcement (3 contributions gate) | 67-72 | **1 (already enforced)** | Enforced by `participation-gate-enforcer.cjs` hook which checks for Maya scope, Alex codebase evidence, and Jordan design implication via semantic markers. The silent-mode caveat is also handled (hook uses semantic markers, not persona names). |

**Subtotal**: 27 lines (7 already-enforced, 12 dead/duplicate, 8 LLM-prose)

---

### §3. Operating Model (lines 74-95)

| Subsection | Lines | Bucket | Rationale |
|---|---|---|---|
| Single-agent default statement | 78-80 | **5 (dead/duplicate)** | Identical to roundtable-analyst.md §3 ("Single-Agent mode is the default"). Shared invariant. |
| Persona loading (PERSONA_CONTEXT check + fallback) | 82-90 | **5 (dead/duplicate)** | Near-identical to roundtable-analyst.md §3 persona loading. Only the persona file paths differ (same 3 files). The loading mechanism is a shared invariant. |
| Agent Teams dormant reference | 92-93 | **5 (dead/dormant)** | Points to Appendix A. Dormant future design. |

**Subtotal**: 22 lines (22 dead/duplicate/dormant)

---

### §4. Persona Model (lines 96-153)

| Subsection | Lines | Bucket | Rationale |
|---|---|---|---|
| Intro paragraph referencing plugin/contribution model | 98-101 | **5 (dead/duplicate)** | "uses the same plugin/contribution persona model as the feature roundtable" -- this IS the shared content. Belongs in core.json. |
| Core personas table (Maya/Alex/Jordan/Lead) | 103-110 | **3 (template-bound)** | The persona-to-domain-to-state-to-template mapping is declarative data. Under GH-253 this goes in a bug-roundtable state-machine config (e.g., `bug-roundtable.states.json`). The bug-specific mapping (bug_framing, root_cause, fix_strategy) differs from the feature roundtable. |
| Contributing personas description | 112-127 | **5 (dead/duplicate)** | Identical to roundtable-analyst.md §4.2. Shared invariant about how contributing personas fold into core states. Even the frontmatter example schema is identical. |
| Promotion schema + extension points + conflict resolution | 129-152 | **5 (dead/duplicate)** | Near-identical to roundtable-analyst.md §4.3. The only difference is the extension point names use bug-specific state names (before:bug_summary, after:root_cause, etc.). Those names are declarative data that can go in a config. The promotion mechanics and conflict resolution ("first-declared wins") are shared. |

**Subtotal**: 58 lines (8 template-bound, 50 dead/duplicate)

---

### §5. Rendering Modes (lines 154-176)

| Subsection | Lines | Bucket | Rationale |
|---|---|---|---|
| Three-mode table (bulleted/conversational/silent) | 156-166 | **5 (dead/duplicate)** | Identical to roundtable-analyst.md §5.1. Same three modes, same surface descriptions. Shared invariant. |
| Shared invariants across all modes | 168-176 | **5 (dead/duplicate)** | Near-identical to roundtable-analyst.md §5.2. The confirmation order differs (BUG_SUMMARY vs REQUIREMENTS) but the INVARIANT rules (order locked, Accept/Amend gating, template binding, anti-shortcut, no writes, participation gate, no phase headers) are shared protocol semantics. The bug-specific order is declarative and goes in config. |

**Subtotal**: 23 lines (23 dead/duplicate)

---

### §6. Conversation Rendering Rules (lines 177-203)

| Subsection | Lines | Bucket | Rationale |
|---|---|---|---|
| Rules 1-9 (no phase headers, no step headers, no numbered lists, no handover, no menus, brevity, earn each question, natural steering, all personas engage) | 183-199 | **5 (dead/duplicate)** | These 9 rules are almost word-for-word identical to roundtable-analyst.md §6 rules 1-9. Shared rendering rules. |
| Rule 10 (Tasks as traceability table) | 200-202 | **1 (already enforced)** | Enforced by `tasks-as-table-validator.cjs`. |

**Subtotal**: 27 lines (2 already-enforced, 25 dead/duplicate)

---

### §7. Roundtable State Machine (lines 204-395)

| Subsection | Lines | Bucket | Rationale |
|---|---|---|---|
| Preamble (template binding is inline and authoritative) | 206-210 | **5 (dead/duplicate)** | Identical to roundtable-analyst.md §7 preamble. Shared invariant. |
| IDLE state definition | 211-216 | **3 (template-bound)** | State entry/next transitions are declarative state-machine config. |
| Opening procedure (parse dispatch, load personas, defer scan, open as Maya) | 218-244 | **4 (LLM-prose-needed)** | Bug-specific opening behavior. Maya's opening framing ("What's broken", "Where it likely lives", "Severity", "Reproduction") is unique to the bug roundtable and shapes the LLM's first exchange. The deferred codebase scan timing and keyword extraction are also behavioral instructions the LLM must follow. Cannot be reduced to config. |
| PRESENTING_BUG_SUMMARY state definition | 247-261 | **Mixed** | State definition header (entry, presenter, template, sections, required, response, next transitions) = **3 (template-bound)** (13 lines). The "Write bug-report.md BEFORE presenting" action = **4 (LLM-prose-needed)** (2 lines, unique bug-specific behavior). |
| Bug-Report Production exception note | 263-265 | **4 (LLM-prose-needed)** | Explains the rationale for writing bug-report.md before confirmations. LLM needs this to understand why this exception exists. |
| Tracing Delegation payload + failure handling | 267-294 | **4 (LLM-prose-needed)** | This is entirely bug-specific behavior: spawning the tracing-orchestrator, composing the delegation payload with BUG_REPORT_PATH, ANALYSIS_MODE flags, T1/T2/T3 launch instructions. The fail-open fallback (Alex presents conversation-based hypotheses) is also behavioral prose the LLM needs. No equivalent in the feature roundtable. |
| PRESENTING_ROOT_CAUSE state definition | 298-318 | **Mixed** | State definition header (entry, presenter, template, sections, required, response, next) = **3 (template-bound)** (12 lines). Alex's presentation bullet instructions (hypotheses ranked, affected code paths, blast radius, evidence) = **4 (LLM-prose-needed)** (6 lines, bug-specific presentation guidance). Accept/Amend prompt text = **5 (dead/duplicate)** (2 lines, shared prompt pattern). |
| PRESENTING_FIX_STRATEGY state definition | 322-343 | **Mixed** | State definition header = **3 (template-bound)** (12 lines). Jordan's presentation instructions (approaches with pros/cons, recommended approach, regression risk, test gaps) = **4 (LLM-prose-needed)** (6 lines, bug-specific). Accept/Amend prompt = **5 (dead/duplicate)** (2 lines). |
| PRESENTING_TASKS state definition | 346-363 | **Mixed** | State definition header = **3 (template-bound)** (8 lines). On-screen rendering instructions (traceability table, 4 columns, never bullets) = **1 (already enforced)** (4 lines, by tasks-as-table-validator.cjs). Build phases mention (05, 06, 16, 08) = **4 (LLM-prose-needed)** (2 lines, bug-specific phase coverage). |
| AMENDING state definition | 367-375 | **5 (dead/duplicate)** | Identical to roundtable-analyst.md §7.1 AMENDING state. Same restart-from-top semantics, same acceptedDomains clear. Shared invariant. |
| FINALIZING state definition | 379-384 | **5 (dead/duplicate)** | Near-identical to roundtable-analyst.md §7.1 FINALIZING. Shared. |
| COMPLETE state definition | 388-393 | **4 (LLM-prose-needed)** | The completion signal is `BUG_ROUNDTABLE_COMPLETE` (not `ROUNDTABLE_COMPLETE`). This is bug-specific. The handler reference (isdlc.md step 6.5f -> build at Phase 05) is also bug-specific. |

**Subtotal**: 192 lines (6 already-enforced, 45 template-bound, 85 LLM-prose, 56 dead/duplicate)

---

### §8. Domain Confirmation Contracts (lines 396-425)

| Subsection | Lines | Bucket | Rationale |
|---|---|---|---|
| Contract table (Entry, Presenter, Template, Sections, Required, Response, Transitions) | 398-411 | **3 (template-bound)** | The contract table is a declarative specification of confirmation state behavior. This is the same meta-contract as roundtable-analyst.md §8, with bug-specific domain names. Can be encoded in a state-machine config. |
| Accept/Amend indicators (case-insensitive word lists) | 413-419 | **2 (expressible as validator)** | These word lists could be a compliance engine rule (pattern check on PRESENTING_* states). Currently the compliance engine checks for collapsed domains but not individual accept/amend parsing. Could be a `check.type: "accept-amend-parser"` rule. |
| Ambiguous input default | 419 | **5 (dead/duplicate)** | Identical to roundtable-analyst.md §7.4. Shared. |
| "Each summary ends with Accept/Amend" prompt | 421-424 | **5 (dead/duplicate)** | Identical to roundtable-analyst.md §8 prompt. Shared. |

**Subtotal**: 30 lines (14 template-bound, 7 expressible-as-validator, 9 dead/duplicate)

---

### §9. Ask vs Infer + Depth Policy (lines 426-445)

| Subsection | Lines | Bucket | Rationale |
|---|---|---|---|
| Ask gate (when to ask vs infer) | 429-435 | **4 (LLM-prose-needed)** | Bug-specific ask gate criteria: "which state the bug falls into", "severity classification", "recommended fix approach". These are judgment calls that require LLM understanding. Differs from feature roundtable which has "solution shape" criteria. |
| Infer gate | 435-437 | **5 (dead/duplicate)** | Near-identical to roundtable-analyst.md §9.2. Shared invariant. |
| Dynamic depth (3-5 vs 5-8 exchanges) | 439-444 | **4 (LLM-prose-needed)** | Bug-specific depth calibration. The exchange count ranges and the triggers (clear bug vs ambiguous symptoms) are bug-domain-specific behavioral guidance. |

**Subtotal**: 20 lines (12 LLM-prose, 3 dead/duplicate, 5 blank/structural)

---

### §10. Tier Rules (lines 446-465)

| Subsection | Lines | Bucket | Rationale |
|---|---|---|---|
| Bug analysis tier table (light/standard/epic) | 450-456 | **3 (template-bound)** | The tier-to-confirmation-state mapping is declarative. Under GH-253 this goes in the bug roundtable config. Note: the bug roundtable's light tier folds ROOT_CAUSE into FIX_STRATEGY, which is unique behavior. |
| Tier invariants (does not alter stop/wait, accept/amend, etc.) | 458-464 | **5 (dead/duplicate)** | Identical to roundtable-analyst.md §5.2 shared invariants. |

**Subtotal**: 20 lines (7 template-bound, 7 dead/duplicate, 6 blank/structural)

---

### §11. Early Exit Exception (lines 466-480)

| Subsection | Lines | Bucket | Rationale |
|---|---|---|---|
| Early exit signals + confirmation flow + gap flagging | 468-479 | **5 (dead/duplicate)** | Near-identical to roundtable-analyst.md §11. Same signals ("that's enough", "I'm done"), same confirm-then-flush pattern, same "Gaps and Assumptions" flagging. Shared invariant. |

**Subtotal**: 15 lines (15 dead/duplicate)

---

### §12. Finalization Rules (lines 481-526)

| Subsection | Lines | Bucket | Rationale |
|---|---|---|---|
| Turn 1 cross-check (in memory) | 485-489 | **4 (LLM-prose-needed)** | Bug-specific cross-check: root-cause-analysis.md hypotheses align with fix-strategy.md approaches; tasks.md file paths match fix-strategy.md files. These are bug-specific consistency checks the LLM must perform in memory. |
| Turn 2 parallel batch write (artifact list) | 491-499 | **4 (LLM-prose-needed)** | Bug-specific artifact list: root-cause-analysis.md, fix-strategy.md, tasks.md, summary files. The note that bug-report.md is NOT rewritten is also bug-specific. |
| Turn 3 meta.json update + build kickoff signal | 501-525 | **Mixed** | meta.json schema fields (phases_completed, analysis_status, bug_classification, acceptance) = **3 (template-bound)** (16 lines, declarative schema). Build kickoff signal (`BUG_ROUNDTABLE_COMPLETE`) = **4 (LLM-prose-needed)** (3 lines, must be emitted as final output). "Report artifact summary to user" = **4 (LLM-prose-needed)** (1 line). |

**Subtotal**: 46 lines (24 LLM-prose, 16 template-bound, 6 blank/structural)

---

### Appendix A -- Agent Teams (Dormant) (lines 527-535)

| Subsection | Lines | Bucket | Rationale |
|---|---|---|---|
| Entire appendix | 529-535 | **5 (dead/dormant)** | Explicitly labeled "dormant future design". Identical concept to roundtable-analyst.md Appendix A. |

**Subtotal**: 9 lines (9 dead/dormant)

---

### Appendix B -- Runtime Adapter Notes (lines 537-554)

| Subsection | Lines | Bucket | Rationale |
|---|---|---|---|
| Claude Code transport note | 541-543 | **5 (dead/duplicate)** | Adapter implementation detail duplicated from roundtable-analyst.md Appendix B. |
| Codex transport note | 545-549 | **5 (dead/duplicate)** | Adapter implementation detail duplicated from roundtable-analyst.md Appendix B. |
| Runtime resume note | 551-553 | **5 (dead/duplicate)** | Identical to roundtable-analyst.md Appendix B.5. |

**Subtotal**: 18 lines (18 dead/duplicate)

---

### Appendix C -- Meta / Search Internal Data (lines 555-573)

| Subsection | Lines | Bucket | Rationale |
|---|---|---|---|
| meta.json schema fields | 559-564 | **3 (template-bound)** | Declarative schema for meta.json fields. Can be encoded in a meta.json schema definition or template. |
| Discovery context fields consumed | 566-569 | **2 (expressible as validator)** | The list of discovery context fields (project_architecture, tech_stack, etc.) could be a validation rule that checks dispatch payloads include required context. |
| Enhanced search wiring | 571-573 | **4 (LLM-prose-needed)** | Instructions for the LLM about which search tools to use (MCP code-index when available, Grep+Glob fallback) and that scan results are never rendered to the user. This is behavioral guidance. |

**Subtotal**: 19 lines (6 template-bound, 4 expressible-as-validator, 3 LLM-prose, 6 blank/structural)

---

## Detailed Line Accounting

| Section | Lines | B1 | B2 | B3 | B4 | B5 |
|---|---|---|---|---|---|---|
| Frontmatter + preamble | 13 | 0 | 0 | 3 | 0 | 5 |
| §1. Purpose & Non-Negotiables | 33 | 6 | 2 | 3 | 8 | 14 |
| §2. Behavior Contract | 27 | 7 | 0 | 0 | 8 | 12 |
| §3. Operating Model | 22 | 0 | 0 | 0 | 0 | 22 |
| §4. Persona Model | 58 | 0 | 0 | 8 | 0 | 50 |
| §5. Rendering Modes | 23 | 0 | 0 | 0 | 0 | 23 |
| §6. Conversation Rendering Rules | 27 | 2 | 0 | 0 | 0 | 25 |
| §7. State Machine | 192 | 6 | 0 | 45 | 85 | 56 |
| §8. Domain Confirmations | 30 | 0 | 7 | 14 | 0 | 9 |
| §9. Ask vs Infer | 20 | 0 | 0 | 0 | 12 | 3 |
| §10. Tier Rules | 20 | 0 | 0 | 7 | 0 | 7 |
| §11. Early Exit | 15 | 0 | 0 | 0 | 0 | 15 |
| §12. Finalization | 46 | 0 | 0 | 16 | 24 | 0 |
| Appendix A | 9 | 0 | 0 | 0 | 0 | 9 |
| Appendix B | 18 | 0 | 0 | 0 | 0 | 18 |
| Appendix C | 19 | 0 | 4 | 6 | 3 | 0 |
| Blank/structural lines | ~21 | 21 | 0 | 0 | 0 | 0 |
| **TOTAL** | **573** | **42** | **13** | **102** | **140** | **268** |

> Note: Blank lines and section dividers (---) are counted as structural overhead.
> The percentages in the Summary use content-weighted estimates that merge
> structural lines proportionally into the dominant bucket of their section.

## Cross-Reference Evidence

### Bucket 1 -- Already enforced by code

| Rule/Content | Enforcing Code | How |
|---|---|---|
| "TASKS renders as traceability table" (§1 rule 5, §6 rule 10) | `tasks-as-table-validator.cjs` | Checks for pipe-delimited 4-column header at PRESENTING_TASKS |
| "No state.json writes" (§1 rule 7) | `state-file-guard.cjs` | Blocks Bash commands targeting state.json |
| "No branch creation" (§1 rule 8) | `branch-guard.cjs` | Blocks git operations when workflow is active |
| "3 core contributions before first confirmation" (§2) | `participation-gate-enforcer.cjs` | Semantic markers for Maya/Alex/Jordan contributions |
| Bulleted format enforcement (implicit in §5) | `conversational-compliance.cjs` + `conversational-rules.json` rule `bulleted-format` | Pattern-based prose detection |
| Sequential domain confirmation (implicit in §7) | `conversational-compliance.cjs` + `conversational-rules.json` rule `sequential-domain-confirmation` | Structural collapsed-domain detection |
| Template section order (implicit in §7, §8) | `conversational-compliance.cjs` + `conversational-rules.json` rule `template-section-order` | Section order validation against template files |

### Bucket 2 -- Expressible as validator (not yet code)

| Content | Proposed Validator |
|---|---|
| "No framework internals" (§1 rule 9) | PreToolUse check on Read targeting state.json, hooks source, common.cjs |
| Accept/Amend indicator word lists (§8) | Compliance engine rule: accept-amend-parser check type |
| Discovery context required fields (Appendix C) | Dispatch payload validator for required context fields |

### Bucket 5 -- Duplicate content mapping

| Bug-Roundtable Section | Feature-Roundtable Equivalent | Duplicate Type |
|---|---|---|
| Execution mode preamble | Lines 8-14 of roundtable-analyst.md | Near-identical |
| §1 rules 1,4,6,10 | §1.1 rules 2,3; §7; CLAUDE.md | Identical invariants |
| §2 stop/wait contract | §2.1 | Near-identical |
| §2 template authority | §7 preamble | Identical |
| §3 operating model | §3 | Near-identical |
| §3 persona loading | §3 | Near-identical |
| §4 contributing personas | §4.2 | Identical |
| §4 promotion schema | §4.3 | Near-identical (different extension point names) |
| §5 rendering modes | §5.1 | Identical |
| §5 shared invariants | §5.2 | Near-identical |
| §6 rules 1-9 | §6 rules 1-11 | Near-identical |
| §7 AMENDING state | §7.1 AMENDING | Identical |
| §7 FINALIZING state | §7.1 FINALIZING | Near-identical |
| §8 ambiguous input default | §7.4 | Identical |
| §8 Accept/Amend prompt | §8 | Identical |
| §9 infer gate | §9.2 | Near-identical |
| §10 tier invariants | §5.2 | Identical |
| §11 early exit | §11 | Near-identical |
| Appendix A | Appendix A | Identical concept |
| Appendix B | Appendix B | Near-identical |

## What Must Stay (Bucket 4 Analysis)

The 282 lines (49%) classified as LLM-prose-needed fall into these categories:

1. **Bug-specific purpose and role framing** (§1, 8 lines): The LLM needs to know it is running a bug roundtable producing bug-report, root-cause-analysis, fix-strategy, and tasks. This framing shapes all downstream behavior.

2. **Bug-report.md exception clause** (§2, 8 lines): The unique exception allowing bug-report.md to be written before confirmations, because tracing delegation needs it as input.

3. **Opening procedure** (§7, 27 lines): Maya's bug-specific opening structure (What's broken, Where it lives, Severity, Reproduction) and the deferred codebase scan timing.

4. **Tracing delegation** (§7, 28 lines): The entire tracing-orchestrator spawn, payload composition, and fail-open fallback is unique to bug analysis and requires the LLM to read behavioral instructions.

5. **Bug-specific presentation guidance** (§7, 12 lines): Alex's root-cause presentation structure (hypotheses, code paths, blast radius, evidence) and Jordan's fix-strategy presentation structure (approaches, recommended, regression risk, test gaps).

6. **Completion signal** (§7/§12, 6 lines): `BUG_ROUNDTABLE_COMPLETE` and the handler linkage to Phase 05.

7. **Bug-specific ask/depth calibration** (§9, 12 lines): When to ask vs infer for bug analysis, exchange count ranges.

8. **Bug-specific finalization cross-checks** (§12, 24 lines): Cross-checking root-cause vs fix-strategy consistency, the artifact list, meta.json schema.

9. **Search wiring** (Appendix C, 3 lines): MCP code-index vs Grep/Glob fallback behavior.

**Why these genuinely need LLM prose**: Each item above shapes the LLM's behavior in ways specific to bug analysis that cannot be reduced to a boolean flag, a regex pattern, or a template section order. They involve judgment, sequencing of multi-step operations, exception handling, and domain-specific framing that the LLM must internalize during context loading.

## Recommendations for GH-253 Implementation

1. **Shared invariants (268 lines, bucket 5)**: Extract to `core.json` under the GH-253 state-machine-driven architecture. This includes rendering modes, conversation rules, stop/wait semantics, Accept/Amend mechanics, early exit, persona model, and amendment flow.

2. **State machine config (71 lines, bucket 3)**: Encode state definitions, transition tables, persona-to-state-to-template mappings, tier rules, and meta.json schemas in `bug-roundtable.states.json` or equivalent config consumed by the runtime composer.

3. **New validators (37 lines, bucket 2)**: Add compliance engine rules for framework-internals-read blocking, accept/amend parsing, and dispatch payload validation.

4. **Residual prose file (~282 lines)**: The post-GH-253 `bug-roundtable-analyst.md` should contain ONLY the bug-specific behavioral prose (opening procedure, tracing delegation, presentation guidance, finalization cross-checks, completion signal, ask/depth calibration). This is a ~51% reduction from 573 to ~282 lines.
