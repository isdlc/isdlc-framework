---
topic_id: "requirements-definition"
topic_name: "Requirements Definition"
primary_persona: "business-analyst"
contributing_personas:
  - "solutions-architect"
  - "system-designer"
coverage_criteria:
  - "At least 3 functional requirements defined with FR-NNN format"
  - "Each FR has at least 1 acceptance criterion in AC-NNN-NN format"
  - "Technical context and constraints documented"
  - "Quality attributes identified with priority and threshold"
  - "At least 1 risk identified with mitigation"
  - "MoSCoW prioritization applied to all FRs"
  - "Out-of-scope items documented"
artifact_sections:
  - artifact: "requirements-spec.md"
    sections: ["4. Technical Context", "5. Quality Attributes and Risks", "6. Functional Requirements", "7. Out of Scope", "8. MoSCoW Prioritization"]
  - artifact: "user-stories.json"
    sections: ["all"]
  - artifact: "traceability-matrix.csv"
    sections: ["all"]
depth_guidance:
  brief:
    behavior: "Accept user-provided requirements. Validate each FR for testability. Fill gaps from codebase conventions."
    acceptance: "At least 3 FRs with testable ACs. MoSCoW assigned. Out-of-scope documented or inferred."
    inference_policy: "Infer technical constraints, quality attributes, and out-of-scope items from codebase patterns. Tag inferences as Medium confidence."
  standard:
    behavior: "Probe for edge cases and implicit requirements. Challenge vague ACs. Explore boundary conditions."
    acceptance: "All coverage criteria met. Dependencies mapped. Confidence indicators assigned to all FRs."
    inference_policy: "Infer only non-critical NFRs and secondary dependencies. Tag inferences as Medium confidence."
  deep:
    behavior: "Challenge every requirement. Identify hidden dependencies. Explore all boundary conditions and error scenarios."
    acceptance: "All coverage criteria met with high-confidence data. All FRs have High confidence. No inferred ACs."
    inference_policy: "Minimize inference. Every FR and AC must be user-confirmed. Only infer documentation-level details."
source_step_files:
  - "01-04"
  - "01-05"
  - "01-06"
  - "01-07"
  - "01-08"
---

## Analytical Knowledge

### Technical Context

- What are the technical constraints? (Performance, scalability, compatibility)
- What existing conventions and patterns must be followed?
- What are the key integration points with other systems or modules?
- Are there any infrastructure constraints (environments, deployment, CI/CD)?
- What is the existing test coverage in the affected areas?

### Quality Attributes and Risks

- What are the key quality attributes? (Usability, reliability, performance, security, maintainability)
- For each attribute: what priority (critical, high, medium, low) and what threshold defines success?
- What are the risks? For each: likelihood, impact, and mitigation strategy.
- Are there any known risks that could expand the scope?

### Feature Definition

- Define each functional requirement in FR-NNN format
- Each FR must have: title, description, confidence level (high/medium/low)
- Each FR must have acceptance criteria in AC-NNN-NN format
- Acceptance criteria must be testable and observable
- Define boundary conditions: min/max, empty states, error states
- Map dependencies between requirements

### User Stories

- Convert FRs to user stories: "As a {role}, I want {action} so that {benefit}"
- Each story has acceptance criteria (can differ from FR ACs -- user-facing language)
- Priority assigned (Must Have, Should Have, Could Have, Won't Have)
- Traces to FR-NNN references

### Prioritization

- Apply MoSCoW framework to all FRs
- Challenge inflated priorities: "What happens if we ship without this?"
- Identify the minimum viable requirement set
- Document out-of-scope items with rationale and dependencies

## Validation Criteria

- Every FR has at least one testable acceptance criterion
- No vague requirements ("should be fast", "user-friendly")
- All FRs have MoSCoW priority assigned
- Out-of-scope is explicit (documented, not just omitted)
- Dependencies between FRs are mapped
- User stories trace to FRs

## Artifact Instructions

- **requirements-spec.md** Section 4: Technical constraints, conventions, integration points
- **requirements-spec.md** Section 5: Quality attribute table (attribute, priority, threshold) and risk table (risk, likelihood, impact, mitigation)
- **requirements-spec.md** Section 6: FR-NNN with title, description, confidence, AC-NNN-NN acceptance criteria
- **requirements-spec.md** Section 7: Out-of-scope table (item, reason, dependency)
- **requirements-spec.md** Section 8: MoSCoW table (FR, title, priority, rationale)
- **user-stories.json**: Array of { id, title, story, acceptance_criteria[], priority, traces[] }
- **traceability-matrix.csv**: FR_ID, AC_ID, User_Story_ID, Confidence, Source
