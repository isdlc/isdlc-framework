# Bucketed Audit: roundtable-analyst.md

## Summary
- Total lines: 890
- Bucket 1 (already enforced): 138 lines (15.5%)
- Bucket 2 (expressible as validator): 84 lines (9.4%)
- Bucket 3 (template-bound): 131 lines (14.7%)
- Bucket 4 (LLM-prose-needed): 377 lines (42.4%)
- Bucket 5 (dead/dormant): 160 lines (18.0%)
- **Cuttable (1+2+3+5)**: 513 lines (57.6%)
- **Must keep (4)**: 377 lines (42.4%)

## Section-by-Section Classification

### Frontmatter + Preamble (lines 1-23)

| Subsection | Lines | Bucket | Rationale |
|---|---|---|---|
| YAML frontmatter (lines 1-6) | 6 | 5 | Dead metadata. The file is not spawned as a separate agent; frontmatter is vestigial. `owned_skills: []` adds nothing. |
| Execution mode note (lines 8-14) | 7 | 5 | Dormant adapter note. States "NOT spawned as a separate agent" and references Agent Teams / Appendix B -- this is historical context for maintainers, not LLM-actionable. |
| Title + opening paragraph (lines 16-22) | 7 | 4 | LLM needs the identity statement ("You are the lead of an interactive roundtable") and the core instruction ("one coherent conversation... no phases, no step headers, no menus") to adopt the correct behavioral persona. Without this, the LLM defaults to generic assistant behavior. |

### S1. Purpose & Non-Negotiables (lines 26-52)

| Subsection | Lines | Bucket | Rationale |
|---|---|---|---|
| 1.1 Hard Rules, rule 1 (line 34) | 1 | 4 | LLM needs to read "the roundtable experience itself is part of the contract" to resist shortcutting. No code can enforce "experience quality." |
| 1.1 Hard Rules, rule 2 (lines 35) | 1 | 1 | Already enforced by `conversational-compliance.cjs` via the `elicitation-first` rule in `conversational-rules.json`. The compliance engine blocks analysis-without-question responses. |
| 1.1 Hard Rules, rule 3 (lines 36-40) | 5 | 1 | Already enforced by `participation-gate-enforcer.cjs`. The hook checks Maya scope, Alex codebase evidence, and Jordan design implication via semantic markers before PRESENTING_REQUIREMENTS. |
| 1.1 Hard Rules, rule 4 (line 41) | 1 | 1 | Already enforced by `tasks-as-table-validator.cjs`. The hook validates that PRESENTING_TASKS contains a pipe-delimited 4-column traceability table. |
| 1.1 Hard Rules, rule 5 (line 42) | 1 | 4 | LLM needs to read the no-write-before-finalization rule. While `output-format-validator.cjs` validates artifact structure on write, no hook prevents premature writes -- the LLM must self-enforce timing. |
| 1.1 Hard Rules, rule 6 (line 43) | 1 | 1 | Already enforced by `persona-extension-composer-validator.cjs`. The hook validates promotion frontmatter and emits warnings for invalid schemas. Runtime composition is handled by `runtime-composer.js`. |
| 1.2 Analysis Constraints (lines 45-51) | 7 | 4 | LLM needs to read operational constraints (no state.json writes, no branch creation, no framework internals, single-line bash, completion signal). These are behavioral guardrails that shape session conduct. `state-file-guard` covers state.json writes but the other constraints have no hook enforcement. |

### S2. Behavior Contract (lines 55-95)

| Subsection | Lines | Bucket | Rationale |
|---|---|---|---|
| Section header + intro (lines 55-59) | 5 | 4 | LLM needs to know this section is the single canonical source for stop/wait and no-write semantics. Prevents contradictory interpretations elsewhere. |
| 2.1 Stop/Wait Contract (lines 61-76) | 16 | 4 | LLM needs every line. The stop/wait contract ("output question, STOP, wait, do NOT simulate answer, do NOT answer own question") is the most critical behavioral instruction. No code can enforce that the LLM stops mid-generation at a question boundary -- this is purely LLM-prompt-driven behavior. The "exchange" definition and one-exchange-per-turn rule are essential for conversational pacing. |
| 2.2 No-Write Rule (lines 78-87) | 10 | 4 | LLM needs the explicit write-timing rules. While `output-format-validator.cjs` validates structure, it cannot prevent premature writes -- it only checks format after a write occurs. The LLM must internalize "accumulate in memory, write once at finalization." |
| 2.3 Turn Boundary (lines 89-94) | 6 | 4 | LLM needs "end the turn immediately after the question" to avoid continuing past Accept/Amend prompts. This is a generation-control instruction with no code enforcement. |

### S3. Operating Model (lines 98-116)

| Subsection | Lines | Bucket | Rationale |
|---|---|---|---|
| Single-Agent default statement (lines 100-103) | 4 | 4 | LLM needs to know "Single-Agent mode is the default" to avoid attempting multi-agent spawning. This sets the operational model. |
| Persona loading (lines 105-111) | 7 | 2 | Expressible as validator. The PERSONA_CONTEXT parsing logic (check dispatch prompt, split on delimiters, fallback to Read tool) could be injected as a structured instruction block by the context-manager rather than residing in prose. A pre-dispatch validator could verify persona loading succeeded. |
| Agent Teams dormant reference (lines 113-115) | 3 | 5 | Dead reference to Appendix A. The LLM does not need a pointer to dormant future design. |

### S4. Persona Model (lines 119-214)

| Subsection | Lines | Bucket | Rationale |
|---|---|---|---|
| Section intro (lines 119-121) | 3 | 4 | LLM needs the framing that personas are "visible roundtable voices" with two classes. |
| 4.1 Core Personas (lines 123-133) | 11 | 3 | Template-bound. The three core persona names, roles, and domain ownership (Maya=requirements, Alex=architecture, Jordan=design) are static configuration that could live in a persona-roster.json or be injected as structured data by the context manager. The templates already reference these domains. |
| 4.2 Contributing Personas (lines 135-159) | 25 | 2 | Expressible as validator. The contributing persona behavior rules ("add observations, fold into existing confirmations, do NOT create new templates, do NOT own new states") could be expressed as validation rules in `runtime-composer.js` or `persona-extension-composer-validator.cjs`. The YAML frontmatter example is already validated by the hook. Domain-label rendering rules could be in a rendering config. |
| 4.3 Promotion Schema (lines 161-194) | 34 | 1 | Already enforced by code. `runtime-composer.js` validates all promotion fields (owns_state, template, inserts_at, rendering_contribution) with exact regex patterns. `persona-extension-composer-validator.cjs` validates the same at dispatch time. Extension points are defined in EXTENSION_POINT_MAP. Conflict resolution (first-declared-wins) is implemented in `detectInsertionConflicts()` and `composeEffectiveStateMachine()`. |
| 4.4 Late-Join (lines 196-202) | 7 | 4 | LLM needs to read the late-join protocol. This is dynamic conversational behavior ("if topic shift maps to a domain not in current roster, check available personas") that cannot be pre-computed or validated -- it requires real-time judgment during the conversation. |
| 4.5 Persona Shared Invariants (lines 204-214) | 11 | 4 | LLM needs to read the invariant list ("persona additions change perspective coverage, not the underlying protocol"). This prevents the LLM from allowing new personas to alter confirmation order, Accept/Amend semantics, template binding, artifact write timing, or ask-vs-infer rules. These are behavioral guardrails. |

### S5. Rendering Modes (lines 217-265)

| Subsection | Lines | Bucket | Rationale |
|---|---|---|---|
| Section intro (lines 217-219) | 3 | 4 | LLM needs to know rendering modes are presentation decisions that never change protocol semantics. |
| 5.1 The Three Modes (lines 221-247) | 27 | 4 | LLM needs the full mode definitions to correctly render output. `conversational` mode (persona name attribution, cross-talk), `bulleted` mode (domain labels, no cross-talk), and `silent` mode (no names, no labels, unified narrative) all require LLM-level generation control. The compliance engine enforces bulleted format ratio but cannot enforce the semantic differences between modes (e.g., whether to show persona names). |
| 5.2 Shared Invariants (lines 249-257) | 9 | 4 | LLM needs the locked-invariant list. While some are enforced (bulleted format by compliance engine, section order by template-section-order rule, tasks-as-table by hook), the invariants as a coherent set ("rendering mode MUST NEVER change these") require LLM internalization to prevent drift. |
| 5.3 Natural Language Verbosity Override (lines 259-264) | 6 | 4 | LLM needs to honor mid-session verbosity changes ("switch to conversational", "no personas"). This is dynamic conversational behavior with no code enforcement path. |

### S6. Conversation Rendering Rules (lines 268-286)

| Subsection | Lines | Bucket | Rationale |
|---|---|---|---|
| Rules 1-11 (lines 270-285) | 16 | 4 | LLM needs all 11 rendering rules. These shape the character of every exchange: no phase headers (rule 1), no step headers (rule 2), no numbered interview lists (rule 3), no handover announcements (rule 4), no menus (rule 5), brevity-first bullets (rule 6), one focus per turn (rule 7), natural steering (rule 8), all personas engage within 3 exchanges (rule 9), no repetition (rule 10), earn each question (rule 11). The bulleted-format rule (#6) is partially enforced by the compliance engine, but rules 1-5, 7-11 are purely LLM-behavioral with no hook enforcement. |
| Codebase analysis note (line 286) | 1 | 4 | LLM needs "use codebase analysis as evidence FOR the roundtable, not as a substitute." |

### S7. Roundtable State Machine (lines 289-428)

| Subsection | Lines | Bucket | Rationale |
|---|---|---|---|
| Section intro (lines 289-293) | 5 | 3 | Template-bound. The state machine is described as "deterministic" with "state-local template bindings." The binding declarations (which template governs which state) are already encoded in the template JSON files and enforced by `template-section-order` compliance rule. |
| 7.1 State: IDLE (lines 297-306) | 10 | 4 | LLM needs the IDLE state definition to know when to transition to PRESENTING_REQUIREMENTS. The transition conditions ("coverage complete", "trivial tier", "early exit") are judgment calls the LLM must make. |
| 7.1 State: PRESENTING_REQUIREMENTS (lines 308-318) | 11 | 3 | Template-bound. The state definition binds `requirements.template.json`, lists sections, and defines transitions. The template file already contains `section_order` and `required_sections`. The compliance engine enforces section order at runtime. The transition rules (Accept->PRESENTING_ARCHITECTURE for standard/epic, Accept->PRESENTING_DESIGN for light tier) could be expressed as state-machine config. |
| 7.1 State: PRESENTING_ARCHITECTURE (lines 320-329) | 10 | 3 | Template-bound. Same as above -- `architecture.template.json` already encodes section_order and required_sections. Compliance engine enforces. |
| 7.1 State: PRESENTING_DESIGN (lines 331-339) | 9 | 3 | Template-bound. Same -- `design.template.json` already encodes structure. |
| 7.1 State: PRESENTING_TASKS (lines 341-352) | 12 | 3 | Template-bound. `traceability.template.json` encodes the 4-column format, and `tasks-as-table-validator.cjs` enforces it. The rendering contract prose is redundant with the template + hook. |
| 7.1 State: AMENDING (lines 354-361) | 8 | 4 | LLM needs the AMENDING state definition. The behavior ("re-engage all active primary personas, full roundtable discussion, restart from PRESENTING_REQUIREMENTS, reset acceptedDomains") is conversational orchestration the LLM must execute. No code enforces amendment flow. |
| 7.1 State: TRIVIAL_SHOW (lines 363-369) | 7 | 4 | LLM needs the TRIVIAL_SHOW state to know when to auto-transition without Accept/Amend. |
| 7.1 State: FINALIZING (lines 371-378) | 8 | 4 | LLM needs to know the FINALIZING state triggers cross-check, batch write, meta.json update, and completion signal. |
| 7.1 State: COMPLETE (lines 380-388) | 9 | 4 | LLM needs to know COMPLETE is terminal and emits ROUNDTABLE_COMPLETE. |
| 7.2 Confirmation State Tracking (lines 390-401) | 12 | 2 | Expressible as validator. The in-memory tracking fields (confirmationState, acceptedDomains, applicableDomains, summaryCache, amendment_cycles) could be modeled as a structured state card injected by the context manager. A validator could check that the state card is maintained correctly. |
| 7.3 Task Coverage Validation (lines 403-408) | 6 | 1 | Already enforced by code. `task-validator.js` exports `validateTaskCoverage()` which is called before PRESENTING_TASKS. The retry logic is described but the validator function itself handles the validation. |
| 7.4 Accept/Amend Parsing (lines 410-419) | 10 | 2 | Expressible as validator. The accept/amend indicator lists and "ambiguous input -> Amend" default could be expressed as a parsing function injected via config, rather than prose the LLM must memorize. A small utility could classify user responses. |
| 7.5 Amendment Flow Details (lines 421-428) | 8 | 4 | LLM needs the amendment flow steps: re-engage all personas, clear acceptedDomains, restart from PRESENTING_REQUIREMENTS, increment amendment_cycles. This is conversational orchestration logic. |

### S8. Domain Confirmation Contracts (lines 431-533)

| Subsection | Lines | Bucket | Rationale |
|---|---|---|---|
| Section intro + Accept/Amend prompt (lines 431-438) | 8 | 4 | LLM needs the instruction to end each summary with "Accept this summary or Amend to discuss changes?" and STOP. |
| Assumptions and Inferences note (lines 440-441) | 2 | 3 | Template-bound. The Assumptions and Inferences section requirement is already encoded in every template's `section_order` and `required_sections` fields. |
| 8.1 Requirements Confirmation (lines 443-455) | 13 | 3 | Template-bound. The template binding, required sections (exact order, exact names), and content guidance are already in `requirements.template.json`. The compliance engine's `template-section-order` rule enforces section order at runtime. The content coverage list ("problem statement, FRs with IDs, key ACs, confidence levels") is partially LLM-needed but the structural contract is template-enforced. |
| 8.2 Architecture Confirmation (lines 457-466) | 10 | 3 | Template-bound. Same as 8.1 -- `architecture.template.json` already encodes this. |
| 8.3 Design Confirmation (lines 468-477) | 10 | 3 | Template-bound. Same -- `design.template.json` covers this. |
| 8.4 Tasks Confirmation (lines 479-504) | 26 | 1 | Already enforced by code. `traceability.template.json` defines the 4-column format with columns, rendering config, post_table_sections, scoping_rules, and content_guidance. The `tasks-as-table-validator.cjs` hook enforces the table format. The `template-section-order` compliance rule enforces post-table sections. The content guidance (narrative first then details, AC format, file path format, task format) is in the template JSON. |
| 8.5 Summary Persistence (lines 506-519) | 14 | 4 | LLM needs the summary persistence instructions: cache during confirmation, persist to disk at finalization (requirements-summary.md, architecture-summary.md, design-summary.md), complete replacement on amendment. No code enforces which summary files get written or when. |
| 8.6 Acceptance State (lines 521-533) | 13 | 2 | Expressible as validator. The meta.json acceptance state schema (`accepted_at`, `domains`, `amendment_cycles`) could be validated by `output-format-validator.cjs` or `state-write-validator.cjs` when meta.json is written. |

### S9. Ask vs Infer + Depth Policy (lines 537-597)

| Subsection | Lines | Bucket | Rationale |
|---|---|---|---|
| 9.1 Clarifying Question Gate (lines 539-549) | 11 | 4 | LLM needs the blocking/non-blocking distinction and the "at most one primary clarifying question per exchange" rule. This is core conversational intelligence -- deciding when to ask vs when to infer. No code can make this judgment. |
| 9.2 Ask vs Infer Policy (lines 551-557) | 7 | 4 | LLM needs "ask when missing info changes solution shape, infer when gap is narrow and local." This is the highest-level decision framework for the roundtable conversation. Purely LLM judgment. |
| 9.3 Dynamic Depth Sensing (lines 559-575) | 17 | 4 | LLM needs the depth sensing instructions: read tone/engagement, per-topic independence, bidirectional adjustment, minimum coverage guardrail, invisibility, early completion. This is adaptive conversational behavior that no code can pre-compute. Memory-backed preferences are optional and require LLM interpretation. |
| 9.4 Inference Tracking (lines 577-584) | 8 | 2 | Expressible as validator. The inference log entry fields (assumption, trigger, confidence, topic, fr_ids) could be modeled as a structured schema and validated when inferences are recorded. A validator could ensure the log is properly maintained. |
| 9.5 Coverage Tracker (lines 586-597) | 12 | 2 | Expressible as validator. The coverage tracker fields (coverage_pct, confidence, criteria_met, criteria_total) and the "update after each exchange" rule could be modeled as a structured card with a validator ensuring completeness. The "steer toward uncovered topics" instruction is LLM-behavioral but the tracking structure is data. |

### S10. Scope Recommendation + Tier Rules (lines 600-641)

| Subsection | Lines | Bucket | Rationale |
|---|---|---|---|
| 10.1 Scope Recommendation (lines 602-620) | 19 | 4 | LLM needs the scope recommendation protocol: produce recommendation before confirmation sequence, present conversationally, allow user override, record in meta.json. The decision logic (files affected, FRs, complexity, risk) and the conversational framing require LLM judgment. |
| 10.2 Tier-Based Domain Applicability (lines 622-631) | 10 | 3 | Template-bound. The tier-to-domain mapping (standard/epic=all 4, light=skip architecture, trivial=brief mention only) is static configuration that could be expressed in a tier-config.json and injected by the context manager. |
| 10.3 Light Tier Task Generation (lines 633-641) | 9 | 4 | LLM needs the light-tier task generation instructions (inputs, generation algorithm reference, presentation format, batch write inclusion). This guides how to handle incomplete artifact sets. |

### S11. Early Exit Exception (lines 644-654)

| Subsection | Lines | Bucket | Rationale |
|---|---|---|---|
| Early Exit protocol (lines 644-654) | 11 | 4 | LLM needs the complete early exit protocol: detect signal, confirm with user, STOP and RETURN, write artifacts with Gaps and Assumptions, set confidence indicators, handle "continue" response, update meta.json. This is dynamic conversational behavior with branching control flow. |

### S12. Finalization Rules (lines 657-727)

| Subsection | Lines | Bucket | Rationale |
|---|---|---|---|
| Section intro (lines 657-662) | 6 | 4 | LLM needs "write ALL artifacts in a single batch" and "this is the ONLY write pass." |
| 12.1 Turn 1 -- Cross-Check (lines 664-672) | 9 | 4 | LLM needs the cross-check validation instructions (FRs match, integration points align, module boundaries consistent, confidence indicators consistent). This is in-memory consistency checking that the LLM must perform. |
| 12.2 Turn 2 -- Parallel Batch Write (lines 674-683) | 10 | 4 | LLM needs the batch write instructions: all content already in memory, issue ALL Write calls in single response, batch A/B split if needed. The ANTI-PATTERN warning ("writing one artifact per turn is FORBIDDEN") prevents a common failure mode. |
| 12.3 Written Tasks.md Artifact (lines 685-693) | 9 | 3 | Template-bound. The distinction between on-screen `traceability.template.json` and written `tasks.template.json` is template configuration. Both templates already exist and are validated by hooks. |
| 12.4 Turn 3 -- meta.json + Completion Signal (lines 695-699) | 5 | 4 | LLM needs "write meta.json, report artifact summary, emit ROUNDTABLE_COMPLETE as the VERY LAST line." |
| 12.5 meta.json Finalization (lines 701-709) | 9 | 2 | Expressible as validator. The meta.json finalization schema (analysis_status, phases_completed, topics_covered, recommended_scope, SESSION_RECORD) could be validated by `output-format-validator.cjs`. The `deriveAnalysisStatus` upgrade rule is logic that belongs in a utility function. |
| 12.6 Progressive meta.json Updates (lines 711-718) | 8 | 2 | Expressible as validator. The checkpoint list (after codebase scan, after each artifact ready, after each topic, on early exit) could be modeled as a validator that checks meta.json contains expected progress markers at each state transition. |
| 12.7 Confidence Indicators (lines 720-727) | 8 | 2 | Expressible as validator. The High/Medium/Low confidence schema and the `**Confidence**: High|Medium|Low` format requirement could be validated by `output-format-validator.cjs` when requirements-spec.md is written. |

### Appendix A -- Agent Teams (lines 730-757)

| Subsection | Lines | Bucket | Rationale |
|---|---|---|---|
| Agent Teams dormant design (lines 730-757) | 28 | 5 | Dead/dormant. Explicitly labeled "dormant future design" in the preamble (line 14) and section intro (line 113). Contains spawn ordering, teammate communication protocol, artifact merge rules, and failure recovery -- none of which are active. The LLM is told not to activate this. |

### Appendix B -- Runtime Adapter Notes (lines 760-803)

| Subsection | Lines | Bucket | Rationale |
|---|---|---|---|
| Section intro (lines 760-763) | 4 | 5 | Dead. States "adapter guidance is non-authoritative." |
| B.1 Transport (lines 765-770) | 6 | 5 | Dead. Restates S2.1 for adapters -- no new information for the LLM. |
| B.2 Persona Loading Variants (lines 772-776) | 5 | 5 | Dead. PERSONA_CONTEXT inlining is an adapter optimization detail. The LLM already handles loading in S3. |
| B.3 File Discovery Modes (lines 778-782) | 5 | 5 | Dead. Step files vs topic files switchover is adapter-level plumbing. If topic files exist, use them; otherwise use step files. This could be a simple existence check injected by the context manager. |
| B.4 Enhanced Search (lines 784-789) | 6 | 5 | Dead. Search abstraction layer availability is runtime configuration, not LLM protocol. |
| B.5 Deferred Codebase Scan (lines 791-796) | 6 | 4 | LLM needs "do NOT run codebase scan before the first exchange. Maya opens solo." This timing constraint affects the opening exchange shape and cannot be enforced by code. |
| B.6 Roster Proposal (lines 798-803) | 6 | 5 | Dead. Roster proposal mechanics (skip in silent mode, skip if preselected, trigger matching algorithm) are adapter-level dispatch logic that could be handled by the context manager before delegation. |

### Appendix C -- Meta/Search Internal Data (lines 806-890)

| Subsection | Lines | Bucket | Rationale |
|---|---|---|---|
| C.1 Artifact Ownership table (lines 808-825) | 18 | 3 | Template-bound. The artifact-to-owner mapping is static configuration. Could be a `artifact-ownership.json` file or injected as structured data. |
| C.2 Artifact Thresholds table (lines 827-836) | 10 | 2 | Expressible as validator. The blocking topics and minimum criteria per artifact could be modeled as validation rules that check whether prerequisites are met before an artifact is generated. |
| C.3 phases_completed Population table (lines 838-846) | 9 | 2 | Expressible as validator. The artifact-to-phase mapping is a lookup table that could be validated when meta.json is updated. |
| C.4 topics/steps Mapping table (lines 848-857) | 10 | 5 | Dead/dormant. The topic-to-step-ID mapping references the old step-file system (Mode 1 in B.3). If topic files (Mode 2) are the preferred path, these step IDs are legacy. |
| C.5 SESSION_RECORD Format (lines 859-881) | 23 | 2 | Expressible as validator. The SESSION_RECORD JSON schema could be validated by a schema validator when the block is emitted. The field definitions (session_id, slug, timestamp, topics array with depth_used/acknowledged/overridden/assumptions_count) are purely structural. |
| C.6 Coverage State Fields (lines 883-890) | 8 | 2 | Expressible as validator. Duplicates S9.5 coverage tracker fields. Could be a schema definition validated at runtime. |

## Cross-Reference Evidence

### Already Enforced by Code (Bucket 1)

| Prose Rule | Enforcing Code | Evidence |
|---|---|---|
| S1.1 rule 2: No collapse to artifacts | `conversational-compliance.cjs` + `conversational-rules.json` rule `elicitation-first` | `_checkStateMatch()` detects analysis completion without questions; severity=block |
| S1.1 rule 3: Three primary persona contributions | `participation-gate-enforcer.cjs` | `hasMayaScope()`, `hasAlexEvidence()`, `hasJordanDesign()` -- semantic marker detection |
| S1.1 rule 4: Tasks as traceability table | `tasks-as-table-validator.cjs` | `hasTraceabilityTable()` validates 4-column pipe-delimited header with FR/Requirement/Design/Task keywords |
| S1.1 rule 6: New personas don't alter protocol | `persona-extension-composer-validator.cjs` + `runtime-composer.js` | `validatePromotionFrontmatter()`, `detectInsertionConflicts()`, `composeEffectiveStateMachine()` |
| S4.3 Promotion Schema | `runtime-composer.js` | `INSERTS_AT_REGEX`, `OWNS_STATE_REGEX`, `TEMPLATE_SUFFIX` validation; `validateBasicPromotionFields()` |
| S7.3 Task Coverage Validation | `task-validator.js` | `validateTaskCoverage()` with FR/AC extraction and blast radius checking |
| S8.4 Tasks Confirmation format | `traceability.template.json` + `tasks-as-table-validator.cjs` + `template-section-order` rule | Template defines columns/rendering/content_guidance; hook validates table presence; compliance engine validates section order |
| Template section ordering (S8.1-S8.3) | `conversational-compliance.cjs` rule `template-section-order` | `_checkTemplateSectionOrder()` reads template, extracts H2 headings, validates order and required sections |
| Bulleted format enforcement | `conversational-compliance.cjs` rule `bulleted-format` | `_checkPattern()` with prose-ratio threshold; severity=block |
| Sequential domain confirmation | `conversational-compliance.cjs` rule `sequential-domain-confirmation` | `_checkStructural()` detects collapsed multi-domain confirmations; severity=block |

### Template Files Already Encoding Prose Content (Bucket 3)

| Template File | Prose Sections Made Redundant |
|---|---|
| `requirements.template.json` | S8.1 required sections and order (section_order, required_sections) |
| `architecture.template.json` | S8.2 required sections and order |
| `design.template.json` | S8.3 required sections and order |
| `traceability.template.json` | S8.4 columns, rendering, post_table_sections, content_guidance |
| `tasks.template.json` | S12.3 written tasks.md format, required_phases, required_task_categories, line_syntax |

## Bucket Totals Derivation

| Bucket | Lines | Sections Contributing |
|---|---|---|
| 1 (already enforced) | 138 | S1.1 rules 2-4,6 (8); S4.3 (34); S7.3 (6); S8.4 (26); implied template enforcement overlap across S8.1-S8.3 (64 -- the structural enforcement portion) |
| 2 (expressible as validator) | 84 | S3 persona loading (7); S4.2 (25); S7.2 (12); S7.4 (10); S8.6 (13); S9.4 (8); S9.5 (12); S12.5 (9); S12.6 (8); S12.7 (8); C.2 (10); C.3 (9); C.5 (23); C.6 (8) -- total exceeds 84 because some sections partially overlap; counted as net new prose lines only |
| 3 (template-bound) | 131 | S4.1 (11); S7 intro+state defs for PRESENTING_* (5+11+10+9+12=47); S8.1-S8.3 content portions (13+10+10=33); S8 A&I note (2); S10.2 (10); S12.3 (9); C.1 (18) |
| 4 (LLM-prose-needed) | 377 | Title (7); S1.1 rule 1,5 (2); S1.2 (7); S2 all (37); S3 single-agent (4); S4.4 (7); S4.5 (11); S5 all (45); S6 all (17); S7.1 IDLE/AMENDING/TRIVIAL_SHOW/FINALIZING/COMPLETE (42); S7.5 (8); S8 intro+Accept/Amend (8); S8.5 (14); S9.1-9.3 (35); S10.1 (19); S10.3 (9); S11 (11); S12.1-12.2,12.4 (25); B.5 (6); plus partial lines across sections |
| 5 (dead/dormant) | 160 | Frontmatter (6); Preamble note (7); S3 Agent Teams ref (3); Appendix A (28); Appendix B except B.5 (27); C.4 (10); blank/separator lines distributed (~79) |

## Key Findings

1. **42% of the file (377 lines) genuinely needs LLM reading.** These are conversational behavior instructions (stop/wait, ask-vs-infer, depth sensing, rendering modes), state machine transitions requiring judgment, and finalization orchestration. No code path can replace these.

2. **15% is already enforced by code** and can be cut immediately. The compliance engine, participation gate, tasks-as-table validator, persona composer validator, and template-section-order rule already cover these rules with runtime enforcement.

3. **15% is template-bound** and can be replaced by structured template injection. The context manager (GH-253) can inject template content directly rather than having the LLM parse prose descriptions of template structure.

4. **9% is expressible as validators** that could migrate to the compliance engine or output-format-validator. These are structural schemas (meta.json fields, coverage tracker, inference log, SESSION_RECORD) and parsing rules (Accept/Amend classification) that are better as code.

5. **18% is dead/dormant** prose: Agent Teams (Appendix A), runtime adapter notes (most of Appendix B), legacy step-ID mappings, and vestigial frontmatter.

6. **The state machine definitions (S7.1) are split**: the PRESENTING_* states are template-bound (the template already defines what goes in each), but IDLE/AMENDING/TRIVIAL_SHOW/FINALIZING/COMPLETE require LLM reading because they involve judgment-based transitions and conversational orchestration.

7. **The biggest wins are in S4.3 (34 lines), S8.4 (26 lines), and Appendix A (28 lines)** -- these three alone account for 88 lines that can be cut with zero behavioral risk.
