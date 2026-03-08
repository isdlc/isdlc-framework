---
topic_id: "architecture"
topic_name: "Architecture"
primary_persona: "solutions-architect"
contributing_personas:
  - "system-designer"
coverage_criteria:
  - "At least 2 architecture options considered for each significant decision"
  - "Each option has documented pros, cons, and existing pattern alignment"
  - "A recommended option is selected with rationale (ADR format)"
  - "Technology decisions documented with alternatives considered"
  - "Integration points mapped with source, target, interface, and data format"
  - "Data flow documented end-to-end"
artifact_sections:
  - artifact: "architecture-overview.md"
    sections: ["1. Architecture Options", "2. Selected Architecture", "3. Technology Decisions", "4. Integration Architecture", "5. Summary"]
depth_guidance:
  brief:
    behavior: "Single recommended approach with brief rationale. Follow existing codebase patterns unless clearly inadequate."
    acceptance: "At least 1 architecture decision documented with rationale. Technology decisions stated."
    inference_policy: "Infer architecture approach from existing codebase patterns. Tag inferences as Medium confidence."
  standard:
    behavior: "Present 2-3 options per significant decision with tradeoff analysis. Document ADRs for selected options."
    acceptance: "All coverage criteria met. ADRs written with Status, Context, Decision, Rationale, Consequences."
    inference_policy: "Infer only non-critical technology choices from existing stack. Tag inferences as Medium confidence."
  deep:
    behavior: "Exhaustive option evaluation. Formal ADRs for all decisions. Integration architecture fully specified."
    acceptance: "All coverage criteria met with exhaustive detail. All ADRs have Accepted status. No open questions."
    inference_policy: "Minimize inference. Present all options to user for decision. Only infer infrastructure details from existing config."
source_step_files:
  - "03-01"
  - "03-02"
  - "03-03"
  - "03-04"
---

## Analytical Knowledge

### Architecture Options and Tradeoffs

- Identify all possible architecture approaches (minimum 2 for each significant decision)
- For each option document:
  - Summary: how does it work at a high level?
  - Pros: performance, simplicity, extensibility, testability
  - Cons: complexity, coupling, migration cost, learning curve
  - Existing pattern alignment: does this follow or break existing codebase patterns?
  - Verdict: Selected or Eliminated
- Assess risk appetite: conservative (follow existing), moderate (small improvements), aggressive (rearchitect)
- Identify constraints that eliminate options
- Distinguish irreversible decisions from easily changed ones
- Consider phased approaches: start simple, evolve later

### Technology Decisions

- Assess new dependencies: prefer zero new dependencies
- For each new dependency: version compatibility, maintenance status, alternatives considered
- Evaluate against existing technology stack for consistency
- Document rationale for selecting one technology over alternatives

### Integration Design

- Map every integration point in a table: Source, Target, Interface Type, Data Format, Error Handling
- Define the data flow: Input -> Processing -> Output for the full system
- Document synchronization model and concurrency considerations
- Identify potential race conditions or shared-state conflicts
- Define error handling at each integration boundary

### Architecture Review

- Verify architecture is consistent with requirements
- Check that all quality attributes from requirements are addressed
- Validate that risk mitigations from impact analysis are architecturally sound
- Identify any architecture decisions that are inconsistent with each other
- Document open questions that need resolution during design

## Validation Criteria

- At least 2 architecture options are considered per significant decision
- Each option has documented pros and cons
- A recommended option is selected with clear rationale
- All ADRs have Status field (Proposed or Accepted)
- Integration points table is complete
- If only one option is viable, document why alternatives were eliminated

## Artifact Instructions

- **architecture-overview.md** Section 1: Options table per decision (Name, Summary, Pros, Cons, Pattern Alignment, Verdict)
- **architecture-overview.md** Section 2: Selected architecture with ADRs (Status, Context, Decision, Rationale, Consequences)
- **architecture-overview.md** Section 3: Technology decisions table (Technology, Version, Rationale, Alternatives Considered)
- **architecture-overview.md** Section 4: Integration points table (ID, Source, Target, Interface, Data Format, Error Handling), data flow diagram, synchronization model
- **architecture-overview.md** Section 5: Executive summary with key decisions table and trade-offs
