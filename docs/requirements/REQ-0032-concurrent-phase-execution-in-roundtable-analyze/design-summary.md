# Design Summary: Concurrent Phase Execution in Roundtable Analyze

**Source**: GH-63
**Date**: 2026-02-21
**Status**: Complete
**Confidence**: High
**Last Updated**: Design phase
**Coverage**: All design deliverables complete. Cross-check passed with zero inconsistencies.

---

## 1. Executive Summary

This design specifies how to replace the sequential 5-phase analyze pipeline with a unified concurrent conversation model. The design produces 4 new agent files (1 lead orchestrator + 3 persona files), 6 merged topic files (replacing 24 step files), and defines 9 interface contracts, 6 data transformations, 4 state management structures, and 32 error codes across 8 categories.

The design implements all 6 architecture decisions (ADR-001 through ADR-006) and covers all 17 functional requirements (FR-001 through FR-017) with zero gaps.

## 2. Design Artifacts Produced

| # | Artifact | Content | Estimated Size |
|---|----------|---------|----------------|
| 1 | `module-design.md` | Module boundaries, section layouts, data structures, dependencies, topic file merge mapping, YAML frontmatter schema | ~500 lines |
| 2 | `interface-spec.md` | 9 interface contracts: dispatch prompt, persona file read, agent teams spawn, agent teams messages, topic file consumption, artifact write protocol, meta.json protocol, cross-check, resumability | ~450 lines |
| 3 | `data-flow.md` | End-to-end data flow (single-agent + agent teams), 8 data sources, 12 data sinks, 4 state mutation lifecycles, 6 data transformations, synchronization model, session persistence boundary | ~400 lines |
| 4 | `error-taxonomy.md` | 4-level severity model, 32 error codes (RT-1xx through RT-8xx), error propagation strategy, input validation rules, 4 graceful degradation levels, error message style guide | ~350 lines |
| 5 | `design-summary.md` | This document -- executive summary, cross-check results, implementation guidance | ~200 lines |

## 3. Module Count and Sizing

| Module | File | Estimated Lines | Responsibility |
|--------|------|-----------------|----------------|
| Lead Orchestrator | `roundtable-lead.md` | 250-300 | Thin orchestrator: conversation flow, coverage tracking, information thresholds, persona coordination, meta.json writes |
| Business Analyst | `persona-business-analyst.md` | 180-200 | Fully self-contained: Maya Chen identity, analytical approach, artifact ownership (requirements-spec.md, user-stories.json, traceability-matrix.csv) |
| Solutions Architect | `persona-solutions-architect.md` | 200-220 | Fully self-contained: Alex Rivera identity, codebase scan, analytical approach, artifact ownership (impact-analysis.md, architecture-overview.md) |
| System Designer | `persona-system-designer.md` | 180-200 | Fully self-contained: Jordan Park identity, analytical approach, artifact ownership (module-design.md, interface-spec.md, data-flow.md, error-taxonomy.md, design-summary.md) |
| Topic Files (6) | `analysis-topics/**/*.md` | 480-600 total | Analytical knowledge library, coverage criteria, artifact instructions |
| **Total new content** | | **~1,290-1,520 lines** | |
| **Replaced content** | `roundtable-analyst.md` + 24 step files | ~1,500 lines | Comparable total -- content is redistributed, not expanded |

## 4. Interface Count

| # | Interface | From -> To | Type |
|---|-----------|-----------|------|
| 1 | Dispatch Prompt (IP-1) | isdlc.md -> Lead | Single Task delegation |
| 2 | Persona File Read (IP-2) | Lead -> Persona files | File read (single-agent) |
| 3 | Agent Teams Spawn (IP-3) | Lead -> Persona files | Task spawn (agent teams) |
| 4 | Agent Teams Messages (IP-3b) | Teammates -> Lead | Structured JSON (3 message types) |
| 5 | Topic File Consumption (IP-4) | Lead/Personas -> Topic files | File read (Glob + Read) |
| 6 | Artifact Write (IP-5) | Personas -> Artifact files | File write (progressive, complete replacement) |
| 7 | Meta.json Protocol (IP-6) | Lead -> meta.json | File read + write (sole writer) |
| 8 | Cross-Check (FR-012) | Lead -> All personas | Internal consistency verification |
| 9 | Resumability | Lead startup | State reconstruction from meta.json + artifacts |

## 5. Key Design Decisions

| # | Decision | Rationale | Traces |
|---|----------|-----------|--------|
| D1 | Fully self-contained persona files (150-200 lines each) | Supports agent teams spawn prompts. No dependency on lead file content. | ADR-001, FR-008 |
| D2 | Thin lead orchestrator | Personas carry analytical decision-making. Lead manages flow, coverage, and coordination only. | FR-001, FR-005 |
| D3 | Merged topic files (24 -> 6), no knowledge loss | Broader topics aligned with knowledge domains. Every question, validation criterion, and artifact instruction preserved. Full traceability via source_step_files. | ADR-003, FR-009 |
| D4 | Rich coverage tracker (per-criterion, with confidence and turn tracking) | Enables granular steering and threshold evaluation. Lost on session end (acceptable -- reconstructed as binary from meta.json). | FR-005, FR-004 |
| D5 | Two-gate validation (self-validation + cross-check) | Defense in depth. Each persona validates before writing. Cross-check catches cross-persona inconsistencies. | FR-012 |
| D6 | Standard metadata header on all artifacts | Status, Confidence, Last Updated, Coverage fields enable self-describing documents and artifact recovery (ADR-006). | FR-003, FR-011 |
| D7 | Dual meta.json fields (steps_completed + topics_covered) | Backward compatibility with deriveAnalysisStatus() while introducing new progress model. | FR-014 |
| D8 | Draft always inline in dispatch prompt | No size threshold. Eliminates a tool call round-trip. Lead starts immediately. | ADR-005 |
| D9 | Summarized brief for teammate spawn (not raw dump) | Keeps spawn prompt focused. Lead distills context to 3-5 sentences. | ADR-002 |
| D10 | Structured JSON for agent teams messages | Parseable progress/finding/completion messages. Fallback to natural language interpretation if malformed. | FR-007 |
| D11 | Formal 4-level severity model (INFO/WARNING/ERROR/FATAL) | Consistent error behavior across all 32 error conditions. Each level has defined logging, notification, and continuation rules. | All FRs |
| D12 | System voice for all error messages | Factual, not in-persona. Clear {Severity}: {What}. Impact: {Why}. Recovery: {How}. format. | UX consistency |
| D13 | Turn = one agent processing cycle | User message triggers one cycle, which may include multiple persona contributions. Consistent unit for Last Updated and coverage tracking. | FR-001, FR-005 |

## 6. Cross-Check Results

### 6.1 Architecture Consistency

All 6 ADRs verified against design artifacts. Zero inconsistencies.

| ADR | Design Implementation | Status |
|-----|----------------------|--------|
| ADR-001 | 4 files designed with full section layouts | Consistent |
| ADR-002 | Agent teams is first-class in interface-spec.md | Consistent |
| ADR-003 | Dual-mode discovery in interface-spec.md Section 5 | Consistent |
| ADR-004 | No dependencies introduced | Consistent |
| ADR-005 | DRAFT_CONTENT always inline | Consistent |
| ADR-006 | Recovery flow in data-flow.md Section 6.4 | Consistent |

### 6.2 Requirements Coverage

All 17 FRs verified against design artifacts. Zero gaps.

- FR-001 through FR-005 (Must Have, core model): Covered in module-design.md, data-flow.md
- FR-006, FR-007 (Dual mode, agent teams): Covered in interface-spec.md, error-taxonomy.md
- FR-008 (Persona split): Covered in module-design.md Sections 2-5
- FR-009 (Topic restructuring): Covered in module-design.md Section 6
- FR-010 (Organic interaction): Covered in persona file Interaction Style sections
- FR-011 (Confidence indicators): Covered in interface-spec.md Section 6.2 (inline markdown)
- FR-012 (Cross-check): Covered in interface-spec.md Section 8, error-taxonomy.md RT-7xx
- FR-013 (Completion model): Covered in module-design.md Section 2.3
- FR-014 (Single dispatch): Covered in interface-spec.md Section 1
- FR-015 (Adaptive depth): Covered in persona Interaction Style sections
- FR-016 (Elaboration removal): By absence -- not present in any new file
- FR-017 (Menu removal): By absence -- not present in any new file

### 6.3 Internal Consistency

| Check | Result |
|-------|--------|
| Module boundaries match interface contracts | Consistent -- 7 boundaries, 9 interfaces (2 sub-interfaces) |
| Artifact ownership tables match across all artifacts | Consistent -- same 12 artifacts, same owners |
| Data flow sources/sinks match interface contracts | Consistent -- 8 sources, 12 sinks, all traced |
| Error codes cover all interface error conditions | Consistent -- every interface's error handling section maps to RT-xxx codes |
| Meta.json schema consistent across all references | Consistent -- dual-field model (steps_completed + topics_covered) referenced uniformly |

## 7. Open Questions for Implementation

| # | Question | Context | Impact If Unresolved |
|---|----------|---------|---------------------|
| OQ-1 | What are the specific information threshold values for each artifact type? | The design defines *which* topics block each artifact (data-flow.md Section 4.2) but not the exact confidence level or coverage percentage that triggers a write. | Implementation uses conservative defaults and tunes from usage. Low impact -- this is expected to be iterative. |
| OQ-2 | How should the lead detect that a conversation topic has shifted organically vs. the user explicitly redirecting? | Affects coverage tracker updates -- should organic drift count as "discussing" a topic? | Low impact -- lead uses judgment. No deterministic rule needed. |
| OQ-3 | What is the optimal spawn order timing for agent teams? | Design says Alex first, Maya second, Jordan last. But actual timing depends on agent teams API behavior (sequential spawns vs. parallel spawns). | Low impact -- spawn order is a guideline. System works regardless of order. |
| OQ-4 | Should the lead re-read topic files mid-conversation if initial Glob returned partial results? | Edge case: topic files being edited while analysis is running. | Very low impact -- topic files are reference material, not live configuration. |

## 8. Implementation Readiness Assessment

| Criterion | Assessment |
|-----------|-----------|
| Module boundaries defined | Yes -- 5 modules with section layouts |
| Interface contracts specified | Yes -- 9 interfaces with formats, types, examples |
| Data flow documented | Yes -- end-to-end for both execution modes |
| Error handling specified | Yes -- 32 error codes with recovery strategies |
| Architecture consistency | Verified -- 6 ADRs, zero inconsistencies |
| Requirements coverage | Verified -- 17 FRs, zero gaps |
| Internal consistency | Verified -- cross-check across all 5 design artifacts |
| Open questions | 4 items, all low impact, resolvable during implementation |

**Assessment: Design is implementable as-is.** The 4 open questions are tuning concerns, not blockers. Implementation can proceed following the implementation order defined in impact-analysis.md (Step 1: Persona split, Step 2a/2b: Topic restructuring + Lead orchestrator, Step 3-5: Integration).
