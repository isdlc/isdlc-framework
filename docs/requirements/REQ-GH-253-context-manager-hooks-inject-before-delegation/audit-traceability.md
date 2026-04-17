# Audit Traceability Log: REQ-GH-253

Traces: FR-007, NFR-005

## Summary

- Sections deleted from roundtable-analyst.md: 28
- Sections deleted from bug-roundtable-analyst.md: 30
- Mechanism destinations: compliance engine (16), templates/definitions (14), dead/deleted (28)

## roundtable-analyst.md Deletions

Each row documents a section that was deleted by T038, the bucket classification from the audit (T034), and where the specification now lives.

| # | Section | Bucket | Mechanism Destination | Verification |
|---|---------|--------|----------------------|--------------|
| 1 | YAML frontmatter (lines 1-6) | B5 (dead) | dead/deleted: vestigial metadata, file is not spawned as a separate agent | Confirmed absent from current file; agent_metadata in core.json provides equivalent identity |
| 2 | Execution mode note (lines 8-14) | B5 (dormant) | dead/deleted: historical adapter note referencing Agent Teams / Appendix B | Confirmed absent; core.json `agent_metadata.analyze.execution_mode` records "inline_protocol_reference" |
| 3 | S1.1 rule 2: No collapse to artifacts | B1 (already enforced) | compliance engine: `conversational-rules.json` rule `elicitation-first` | Rule ID: `elicitation-first`; check type: `state-match`; severity: block |
| 4 | S1.1 rule 3: Three primary persona contributions | B1 (already enforced) | compliance engine: `participation-gate-enforcer.cjs` hook | Hook validates `hasMayaScope()`, `hasAlexEvidence()`, `hasJordanDesign()` semantic markers |
| 5 | S1.1 rule 4: Tasks as traceability table | B1 (already enforced) | compliance engine: `tasks-as-table-validator.cjs` hook + `traceability.template.json` | Hook checks 4-column pipe-delimited header with FR/Requirement/Design/Task keywords |
| 6 | S1.1 rule 6: New personas don't alter protocol | B1 (already enforced) | compliance engine: `persona-extension-composer-validator.cjs` + `runtime-composer.js` | `validatePromotionFrontmatter()`, `detectInsertionConflicts()`, `composeEffectiveStateMachine()` |
| 7 | S3 Persona loading (lines 105-111) | B2 (expressible as validator) | compliance engine: `conversational-rules.json` rule `persona-loading-validation` | Rule ID: `persona-loading-validation`; check type: `persona-loading-validation`; severity: warn |
| 8 | S3 Agent Teams dormant reference (lines 113-115) | B5 (dead) | dead/deleted: pointer to dormant Appendix A | Confirmed absent; no replacement needed |
| 9 | S4.1 Core Personas (lines 123-133) | B3 (template-bound) | definitions: `core.json` -> `persona_model.core_personas` | Field: `persona_model.core_personas` array with Maya/Alex/Jordan entries including `owns_states` |
| 10 | S4.2 Contributing Personas (lines 135-159) | B2 (expressible as validator) | compliance engine: `conversational-rules.json` rule `contributing-persona-rules` | Rule ID: `contributing-persona-rules`; check type: `contributing-persona-rules`; severity: block |
| 11 | S4.3 Promotion Schema (lines 161-194) | B1 (already enforced) | definitions: `core.json` -> `persona_model.promotion_schema` + `runtime-composer.js` | Fields: `promotion_schema.required_fields`, `validation`, `conflict_resolution`, `extension_points.analyze` |
| 12 | S7 intro + state machine preamble (lines 289-293) | B3 (template-bound) | definitions: `analyze.json` state graph + `core.json` `confirmation_contract` | State definitions in `analyze.json` -> `states`; template authority is `state_local_inline` per state cards |
| 13 | S7.1 PRESENTING_REQUIREMENTS state def (lines 308-318) | B3 (template-bound) | definitions: `analyze.json` -> `states.PRESENTING_REQUIREMENTS` + state card `presenting-requirements.card.json` | State card has `template_ref`, `required_sections`, `content_coverage`, `response` |
| 14 | S7.1 PRESENTING_ARCHITECTURE state def (lines 320-329) | B3 (template-bound) | definitions: `analyze.json` -> `states.PRESENTING_ARCHITECTURE` + state card `presenting-architecture.card.json` | State card has `template_ref`, `required_sections`, `response`, transitions |
| 15 | S7.1 PRESENTING_DESIGN state def (lines 331-339) | B3 (template-bound) | definitions: `analyze.json` -> `states.PRESENTING_DESIGN` + state card `presenting-design.card.json` | State card has `template_ref`, `required_sections`, `response`, transitions |
| 16 | S7.1 PRESENTING_TASKS state def (lines 341-352) | B3 (template-bound) | definitions: `analyze.json` -> `states.PRESENTING_TASKS` + state card `presenting-tasks.card.json` | State card has `template_ref`, `written_template_ref`, `rendering_mandate`, `response` |
| 17 | S7.2 Confirmation State Tracking (lines 390-401) | B2 (expressible as validator) | compliance engine: `conversational-rules.json` rule `confirmation-state-tracking` | Rule ID: `confirmation-state-tracking`; required fields: `confirmation_state`, `accepted_domains`, `applicable_domains`, `summary_cache`, `amendment_cycles` |
| 18 | S7.4 Accept/Amend Parsing (lines 410-419) | B2 (expressible as validator) | compliance engine: `conversational-rules.json` rule `accept-amend-parser` | Rule ID: `accept-amend-parser`; accept/amend indicators, `ambiguous_default: "amend"`; severity: block |
| 19 | S8.1 Requirements Confirmation structural contract (lines 443-455) | B3 (template-bound) | definitions: state card `presenting-requirements.card.json` + `requirements.template.json` | State card `required_sections` and `content_coverage` encode structural contract |
| 20 | S8.2 Architecture Confirmation structural contract (lines 457-466) | B3 (template-bound) | definitions: state card `presenting-architecture.card.json` + `architecture.template.json` | State card `required_sections` encode structural contract |
| 21 | S8.3 Design Confirmation structural contract (lines 468-477) | B3 (template-bound) | definitions: state card `presenting-design.card.json` + `design.template.json` | State card `required_sections` encode structural contract |
| 22 | S8.4 Tasks Confirmation format (lines 479-504) | B1 (already enforced) | compliance engine: `tasks-as-table-validator.cjs` + `traceability.template.json` + `template-section-order` rule | Template defines columns/rendering/content_guidance; hook validates table presence; compliance engine validates section order |
| 23 | S8.6 Acceptance State meta.json schema (lines 521-533) | B2 (expressible as validator) | compliance engine: `conversational-rules.json` rule `meta-json-acceptance-state` | Rule ID: `meta-json-acceptance-state`; required fields: `accepted_at`, `domains`, `amendment_cycles` |
| 24 | S9.4 Inference Tracking schema (lines 577-584) | B2 (expressible as validator) | compliance engine: `conversational-rules.json` rule `inference-log-schema` | Rule ID: `inference-log-schema`; required fields: `assumption`, `trigger`, `confidence`, `topic`, `fr_ids` |
| 25 | S9.5 Coverage Tracker schema (lines 586-597) | B2 (expressible as validator) | compliance engine: `conversational-rules.json` rule `coverage-tracker-schema` | Rule ID: `coverage-tracker-schema`; required fields: `coverage_pct`, `confidence`, `criteria_met`, `criteria_total` |
| 26 | S10.2 Tier-Based Domain Applicability (lines 622-631) | B3 (template-bound) | definitions: `analyze.json` -> `tier_rules` | Fields: `tier_rules.standard`, `tier_rules.light`, `tier_rules.trivial` with `domains_presented`, `confirmation_states`, `skip_states` |
| 27 | S12.3 Written Tasks.md template distinction (lines 685-693) | B3 (template-bound) | definitions: `analyze.json` -> `states.PRESENTING_TASKS.written_template_ref` + `states.FINALIZING.template_ref` | `written_template_ref: "tasks.template.json"` distinct from on-screen `traceability.template.json` |
| 28 | S12.5 meta.json Finalization schema (lines 701-709) | B2 (expressible as validator) | compliance engine: `conversational-rules.json` rule `meta-json-finalization-schema` | Rule ID: `meta-json-finalization-schema`; required fields: `analysis_status`, `phases_completed`, `topics_covered`, `recommended_scope`, `SESSION_RECORD` |
| 29 | S12.6 Progressive meta.json Updates (lines 711-718) | B2 (expressible as validator) | compliance engine: `conversational-rules.json` rule `progressive-meta-updates` | Rule ID: `progressive-meta-updates`; checkpoint-based validation |
| 30 | S12.7 Confidence Indicators schema (lines 720-727) | B2 (expressible as validator) | compliance engine: `conversational-rules.json` rule `confidence-indicator-format` | Rule ID: `confidence-indicator-format`; format pattern: `**Confidence**: High|Medium|Low` |
| 31 | Appendix A: Agent Teams (lines 730-757) | B5 (dead/dormant) | dead/deleted: explicitly labeled dormant future design | Confirmed absent; not activated in any runtime path |
| 32 | Appendix B.1 Transport (lines 765-770) | B5 (dead) | dead/deleted: restates S2.1 for adapters with no new information | Confirmed absent |
| 33 | Appendix B.2 Persona Loading Variants (lines 772-776) | B5 (dead) | dead/deleted: adapter optimization detail | Confirmed absent; persona loading validated by `persona-loading-validation` rule |
| 34 | Appendix B.3 File Discovery Modes (lines 778-782) | B5 (dead) | dead/deleted: adapter-level plumbing for step/topic file switching | Confirmed absent |
| 35 | Appendix B.4 Enhanced Search (lines 784-789) | B5 (dead) | dead/deleted: search abstraction layer availability is runtime config | Confirmed absent |
| 36 | Appendix B.6 Roster Proposal (lines 798-803) | B5 (dead) | dead/deleted: adapter-level dispatch logic | Confirmed absent |
| 37 | Appendix C.1 Artifact Ownership table (lines 808-825) | B3 (template-bound) | definitions: `core.json` -> `artifact_ownership.analyze` | Fields: `requirements.artifacts`, `architecture.artifacts`, `design.artifacts`, `tasks.artifacts`, `shared.artifacts` |
| 38 | Appendix C.2 Artifact Thresholds table (lines 827-836) | B2 (expressible as validator) | compliance engine: `conversational-rules.json` rule `artifact-thresholds` | Rule ID: `artifact-thresholds`; required fields: `blocking_topics`, `minimum_criteria` |
| 39 | Appendix C.3 phases_completed Population table (lines 838-846) | B2 (expressible as validator) | compliance engine: `conversational-rules.json` rule `phases-completed-population` | Rule ID: `phases-completed-population`; validates artifact-to-phase mapping |
| 40 | Appendix C.4 topics/steps Mapping table (lines 848-857) | B5 (dead) | dead/deleted: legacy step-ID mapping for old step-file system | Confirmed absent; topic files (Mode 2) are the preferred path |
| 41 | Appendix C.5 SESSION_RECORD Format (lines 859-881) | B2 (expressible as validator) | compliance engine: `conversational-rules.json` rule `session-record-schema` | Rule ID: `session-record-schema`; required fields: `session_id`, `slug`, `timestamp`, `topics` |
| 42 | Appendix C.6 Coverage State Fields (lines 883-890) | B2 (expressible as validator) | compliance engine: `conversational-rules.json` rule `coverage-tracker-schema` | Merged with S9.5; Rule ID: `coverage-tracker-schema` |

## bug-roundtable-analyst.md Deletions

Each row documents a section that was deleted by T038, the bucket classification from the audit (T035), and where the specification now lives.

| # | Section | Bucket | Mechanism Destination | Verification |
|---|---------|--------|----------------------|--------------|
| 1 | YAML frontmatter (lines 1-6) | B3 (template-bound) | definitions: `core.json` -> `agent_metadata.bug_gather` | Fields: `name`, `description`, `model`, `execution_mode` |
| 2 | Execution mode preamble (lines 8-12) | B5 (dead/duplicate) | dead/deleted: shared invariant duplicated from roundtable-analyst.md | core.json `agent_metadata.bug_gather.note` covers execution mode |
| 3 | S1 rule 1: No collapse from clarification to artifacts | B5 (dead/duplicate) | compliance engine: `conversational-rules.json` rule `elicitation-first` (shared) | Rule ID: `elicitation-first`; identical to roundtable-analyst.md S1.1 rule 2 |
| 4 | S1 rule 3: Confirmation state order | B3 (template-bound) | definitions: `bug-gather.json` state graph + `core.json` `amending_semantics` | States defined in `bug-gather.json` -> `states` with transitions; order: BUG_SUMMARY -> ROOT_CAUSE -> FIX_STRATEGY -> TASKS |
| 5 | S1 rule 4: No advance without explicit Accept | B5 (dead/duplicate) | compliance engine: `conversational-rules.json` rule `accept-amend-parser` (shared) | Rule ID: `accept-amend-parser`; shared enforcement with roundtable-analyst.md |
| 6 | S1 rule 5: TASKS renders as traceability table | B1 (already enforced) | compliance engine: `tasks-as-table-validator.cjs` hook | Hook checks for 4-column pipe-delimited header at PRESENTING_TASKS state |
| 7 | S1 rule 6: Template authority is state-local | B5 (dead/duplicate) | definitions: `core.json` `confirmation_contract` + state cards with `template_authority: "state_local_inline"` | All state cards declare `template_authority` field |
| 8 | S1 rule 7: No state.json writes | B1 (already enforced) | compliance engine: `state-file-guard.cjs` hook | Hook blocks Bash commands targeting state.json |
| 9 | S1 rule 8: No branch creation | B1 (already enforced) | compliance engine: `branch-guard.cjs` hook | Hook blocks git operations when workflow is active |
| 10 | S1 rule 9: No framework internals | B2 (expressible as validator) | compliance engine: `conversational-rules.json` rule `framework-internals-guard` | Rule ID: `framework-internals-guard`; blocked_paths: `state.json`, `active_workflow`, `hooks/`, `workflows.json`, `common.cjs` |
| 11 | S1 rule 10: Single-line Bash | B5 (dead/duplicate) | dead/deleted: shared convention in CLAUDE.md "Single-Line Bash Convention" | Convention documented once in CLAUDE.md; no duplication needed |
| 12 | S2 Stop/wait contract (lines 49-55) | B5 (dead/duplicate) | definitions: `core.json` -> `stop_wait_contract` | Fields: `description`, `exchange_definition`, `one_exchange_per_turn`, `end_turn_after_question` |
| 13 | S2 Single source of truth for templates (lines 63-65) | B5 (dead/duplicate) | definitions: `core.json` -> `confirmation_contract` | Field: `confirmation_contract.template_authority` implicit in state-local design |
| 14 | S2 Anti-shortcut enforcement (lines 67-72) | B1 (already enforced) | compliance engine: `participation-gate-enforcer.cjs` hook | Hook checks semantic markers for Maya/Alex/Jordan contributions; silent-mode compatible |
| 15 | S3 Single-agent default statement (lines 78-80) | B5 (dead/duplicate) | definitions: `core.json` -> `agent_metadata.bug_gather.execution_mode` | Value: `"inline_protocol_reference"` |
| 16 | S3 Persona loading (lines 82-90) | B5 (dead/duplicate) | compliance engine: `conversational-rules.json` rule `persona-loading-validation` (shared) | Same loading mechanism as feature roundtable; validated by shared rule |
| 17 | S3 Agent Teams dormant reference (lines 92-93) | B5 (dead/dormant) | dead/deleted: pointer to dormant Appendix A | Confirmed absent |
| 18 | S4 Intro paragraph (lines 98-101) | B5 (dead/duplicate) | definitions: `core.json` -> `persona_model` | core.json declares shared persona model used by both roundtables |
| 19 | S4 Core personas table (lines 103-110) | B3 (template-bound) | definitions: `core.json` -> `persona_model.core_personas` with `owns_states.bug_gather` | Each persona has bug_gather-specific state (e.g., Maya -> PRESENTING_BUG_SUMMARY) |
| 20 | S4 Contributing personas description (lines 112-127) | B5 (dead/duplicate) | definitions: `core.json` -> `persona_model.contributing_persona_schema` + compliance rule `contributing-persona-rules` | Identical to roundtable-analyst.md S4.2; shared invariant |
| 21 | S4 Promotion schema (lines 129-152) | B5 (dead/duplicate) | definitions: `core.json` -> `persona_model.promotion_schema` with `extension_points.bug_gather` | Extension points include bug-specific states: `before:PRESENTING_BUG_SUMMARY`, etc. |
| 22 | S5 Rendering Modes (lines 154-176) | B5 (dead/duplicate) | definitions: `core.json` -> `rendering_modes` | Fields: `bulleted`, `conversational`, `silent` with `shared_invariants` array |
| 23 | S6 Conversation Rendering Rules 1-9 (lines 183-199) | B5 (dead/duplicate) | definitions: `core.json` -> `conversation_rendering_rules` | 11 rules with IDs; identical to roundtable-analyst.md S6 |
| 24 | S6 Rule 10: Tasks as traceability table (lines 200-202) | B1 (already enforced) | compliance engine: `tasks-as-table-validator.cjs` hook | Same enforcement as S1 rule 5 |
| 25 | S7 State machine preamble (lines 206-210) | B5 (dead/duplicate) | definitions: state cards with `template_authority: "state_local_inline"` | All bug-gather state cards declare inline template authority |
| 26 | S7 IDLE state definition (lines 211-216) | B3 (template-bound) | definitions: `bug-gather.json` -> `states.IDLE` | Entry conditions, transitions to PRESENTING_BUG_SUMMARY |
| 27 | S7 PRESENTING_BUG_SUMMARY state def header (lines 247-261) | B3 (template-bound) | definitions: `bug-gather.json` -> `states.PRESENTING_BUG_SUMMARY` + state card `presenting-bug-summary.card.json` | State card has `template_ref`, `required_sections`, `pre_presentation_action`, `response` |
| 28 | S7 PRESENTING_ROOT_CAUSE state def header (lines 298-318) | B3 (template-bound) | definitions: `bug-gather.json` -> `states.PRESENTING_ROOT_CAUSE` + state card `presenting-root-cause.card.json` | State card has `template_ref`, `required_sections`, `presentation_guidance`, `response` |
| 29 | S7 PRESENTING_FIX_STRATEGY state def header (lines 322-343) | B3 (template-bound) | definitions: `bug-gather.json` -> `states.PRESENTING_FIX_STRATEGY` + state card `presenting-fix-strategy.card.json` | State card has `template_ref`, `required_sections`, `presentation_guidance`, `response` |
| 30 | S7 PRESENTING_TASKS state def header (lines 346-363, structural portion) | B3 (template-bound) | definitions: `bug-gather.json` -> `states.PRESENTING_TASKS` + state card `presenting-tasks.card.json` | State card has `template_ref`, `written_template_ref`, `rendering_mandate`, `build_phases_covered` |
| 31 | S7 AMENDING state (lines 367-375) | B5 (dead/duplicate) | definitions: `core.json` -> `amending_semantics` + `bug-gather.json` -> `states.AMENDING` | `amending_semantics.restart_target.bug_gather: "PRESENTING_BUG_SUMMARY"` |
| 32 | S7 FINALIZING state (lines 379-384) | B5 (dead/duplicate) | definitions: `bug-gather.json` -> `states.FINALIZING` | Batch write contract, cross-check rules, artifact_list, artifact_exceptions |
| 33 | S7 Accept/Amend prompt duplicates (within state defs) | B5 (dead/duplicate) | definitions: `core.json` -> `confirmation_prompt` | Value: `"**Accept** this summary or **Amend** to discuss changes?"` |
| 34 | S8 Domain Confirmation Contracts table (lines 398-411) | B3 (template-bound) | definitions: state cards for each bug-gather state | Each state card declares presenter, template_ref, sections, required, response |
| 35 | S8 Accept/Amend indicators (lines 413-419) | B2 (expressible as validator) | compliance engine: `conversational-rules.json` rule `accept-amend-parser` | Rule ID: `accept-amend-parser`; shared with roundtable-analyst.md S7.4; also in `core.json` `accept_indicators`/`amend_indicators` |
| 36 | S8 Ambiguous input default (line 419) | B5 (dead/duplicate) | definitions: `core.json` -> `ambiguous_default: "amend"` | Shared invariant |
| 37 | S8 Accept/Amend prompt text (lines 421-424) | B5 (dead/duplicate) | definitions: `core.json` -> `confirmation_prompt` | Shared invariant |
| 38 | S9 Infer gate (lines 435-437) | B5 (dead/duplicate) | dead/deleted: near-identical to roundtable-analyst.md S9.2 | Shared invariant retained in roundtable-analyst.md S9.2 |
| 39 | S10 Tier table (lines 450-456) | B3 (template-bound) | definitions: `bug-gather.json` -> `tier_rules` | Fields: `standard`, `light`, `epic` with `domains_presented`, `confirmation_states`, `fold` |
| 40 | S10 Tier invariants (lines 458-464) | B5 (dead/duplicate) | definitions: `core.json` -> `rendering_modes.shared_invariants` | Shared invariant: `"rendering_mode_never_changes_protocol_semantics"` |
| 41 | S11 Early Exit (lines 466-480) | B5 (dead/duplicate) | definitions: `core.json` -> `early_exit` | Fields: `signals`, `protocol`, `artifact_treatment`, `confidence_adjustment` |
| 42 | S12 Turn 3 meta.json schema fields (lines 501-525, structural portion) | B3 (template-bound) | definitions: `bug-gather.json` -> `states.FINALIZING.meta_json_update` | Fields: `phases_completed`, `analysis_status`, `required_fields` |
| 43 | Appendix A: Agent Teams (lines 527-535) | B5 (dead/dormant) | dead/deleted: explicitly labeled dormant future design | Confirmed absent |
| 44 | Appendix B: Runtime Adapter Notes (lines 537-554) | B5 (dead/duplicate) | dead/deleted: adapter implementation details duplicated from roundtable-analyst.md | Confirmed absent |
| 45 | Appendix C meta.json schema fields (lines 559-564) | B3 (template-bound) | definitions: `bug-gather.json` -> `states.FINALIZING.meta_json_update` | Declarative schema in state machine config |
| 46 | Appendix C Discovery context fields (lines 566-569) | B2 (expressible as validator) | compliance engine: `conversational-rules.json` rule `dispatch-payload-fields` | Rule ID: `dispatch-payload-fields`; required fields: `project_architecture`, `tech_stack`, `entry_points`, `test_framework` |

## Bucket Distribution Summary

### roundtable-analyst.md

| Bucket | Deletions | Mechanism Type |
|--------|-----------|----------------|
| B1 (already enforced by hooks/validators) | 6 | compliance engine |
| B2 (expressible as validator, now migrated) | 14 | compliance engine (conversational-rules.json) |
| B3 (template-bound, now in definitions) | 12 | definitions (core.json, analyze.json, state cards) |
| B5 (dead/dormant) | 10 | dead/deleted |
| **Total deletions** | **42** | |

### bug-roundtable-analyst.md

| Bucket | Deletions | Mechanism Type |
|--------|-----------|----------------|
| B1 (already enforced by hooks/validators) | 6 | compliance engine |
| B2 (expressible as validator, now migrated) | 2 | compliance engine (conversational-rules.json) |
| B3 (template-bound, now in definitions) | 10 | definitions (core.json, bug-gather.json, state cards) |
| B5 (dead/dormant/duplicate) | 28 | dead/deleted (shared invariants in core.json) |
| **Total deletions** | **46** | |

## Mechanism Destination Index

### Compliance Engine Rules (in conversational-rules.json)

| Rule ID | Source Section(s) | Bucket | Check Type |
|---------|-------------------|--------|------------|
| `elicitation-first` | RA S1.1 rule 2, BRA S1 rule 1 | B1 | state-match |
| `sequential-domain-confirmation` | RA S7 (implicit) | B1 | structural |
| `template-section-order` | RA S8.1-S8.3 (implicit) | B1 | template-section-order |
| `bulleted-format` | RA S5 (implicit) | B1 | pattern |
| `persona-loading-validation` | RA S3 persona loading | B2 | persona-loading-validation |
| `contributing-persona-rules` | RA S4.2 | B2 | contributing-persona-rules |
| `confirmation-state-tracking` | RA S7.2 | B2 | confirmation-state-tracking |
| `accept-amend-parser` | RA S7.4, BRA S8 | B2 | accept-amend-parser |
| `meta-json-acceptance-state` | RA S8.6 | B2 | schema-fields |
| `inference-log-schema` | RA S9.4 | B2 | schema-fields |
| `coverage-tracker-schema` | RA S9.5, C.6 | B2 | schema-fields |
| `meta-json-finalization-schema` | RA S12.5 | B2 | schema-fields |
| `progressive-meta-updates` | RA S12.6 | B2 | schema-fields |
| `confidence-indicator-format` | RA S12.7 | B2 | confidence-indicator |
| `session-record-schema` | RA C.5 | B2 | schema-fields |
| `artifact-thresholds` | RA C.2 | B2 | schema-fields |
| `phases-completed-population` | RA C.3 | B2 | schema-fields |
| `framework-internals-guard` | BRA S1 rule 9 | B2 | framework-internals-guard |
| `dispatch-payload-fields` | BRA Appendix C | B2 | dispatch-payload-fields |

### Definition Files

| File | Content Migrated From | Bucket |
|------|----------------------|--------|
| `core.json` -> `persona_model.core_personas` | RA S4.1 | B3 |
| `core.json` -> `persona_model.promotion_schema` | RA S4.3 | B1/B3 |
| `core.json` -> `persona_model.contributing_persona_schema` | RA S4.2 (structural) | B2/B3 |
| `core.json` -> `rendering_modes` | RA S5, BRA S5 | B5 (dedup) |
| `core.json` -> `conversation_rendering_rules` | RA S6, BRA S6 | B5 (dedup) |
| `core.json` -> `stop_wait_contract` | BRA S2 | B5 (dedup) |
| `core.json` -> `amending_semantics` | BRA S7 AMENDING | B5 (dedup) |
| `core.json` -> `participation_gate` | BRA S2 anti-shortcut | B1 (dedup) |
| `core.json` -> `early_exit` | BRA S11 | B5 (dedup) |
| `core.json` -> `accept_indicators`/`amend_indicators` | RA S7.4, BRA S8 | B2 |
| `core.json` -> `confirmation_prompt` | BRA S8 | B5 (dedup) |
| `core.json` -> `agent_metadata` | RA/BRA frontmatter | B5 |
| `core.json` -> `artifact_ownership` | RA C.1 | B3 |
| `core.json` -> `assumptions_and_inferences_placement` | RA S8 A&I note | B3 |
| `analyze.json` -> `states.*` | RA S7.1 PRESENTING_* states | B3 |
| `analyze.json` -> `tier_rules` | RA S10.2 | B3 |
| `analyze.json` -> `scope_recommendation` | (structural) | B3 |
| `bug-gather.json` -> `states.*` | BRA S7 state defs | B3 |
| `bug-gather.json` -> `tier_rules` | BRA S10 | B3 |
| `bug-gather.json` -> `depth_calibration` | (structural) | B3 |
| State cards (9 files) | RA S7.1/S8.*, BRA S7/S8 | B3 |

### Pre-existing Hook Enforcement (B1 — no migration needed)

| Hook | Rules Enforced |
|------|----------------|
| `participation-gate-enforcer.cjs` | RA S1.1 rule 3, BRA S2 anti-shortcut |
| `tasks-as-table-validator.cjs` | RA S1.1 rule 4, RA S8.4, BRA S1 rule 5, BRA S6 rule 10 |
| `persona-extension-composer-validator.cjs` | RA S1.1 rule 6, RA S4.3 |
| `state-file-guard.cjs` | BRA S1 rule 7 |
| `branch-guard.cjs` | BRA S1 rule 8 |

## Completeness Check

Every section classified as B1, B2, B3, or B5 in both audit reports has a corresponding row in the tables above. Sections classified as B4 (LLM-prose-needed) were retained in the protocol files and are NOT listed as deletions.

- roundtable-analyst.md: 377 lines of B4 content retained (42% of original)
- bug-roundtable-analyst.md: 282 lines of B4 content retained (49% of original)

This satisfies NFR-005 (every deleted section must have a documented mechanism destination).
