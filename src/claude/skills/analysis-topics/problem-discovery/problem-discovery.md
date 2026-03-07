---
topic_id: "problem-discovery"
topic_name: "Problem Discovery"
primary_persona: "business-analyst"
contributing_personas:
  - "solutions-architect"
coverage_criteria:
  - "Business problem articulated in user impact terms"
  - "At least one stakeholder identified with role and interests"
  - "At least one success metric or acceptance threshold defined"
  - "Primary user type identified with pain points"
  - "Current state or workaround described"
artifact_sections:
  - artifact: "requirements-spec.md"
    sections: ["1. Business Context", "2. Stakeholders and Personas", "3. User Journeys"]
  - artifact: "quick-scan.md"
    sections: ["1. Scope"]
depth_guidance:
  brief:
    behavior: "Accept the user's framing at face value. Validate for completeness. Fill gaps from draft and codebase analysis."
    acceptance: "Problem statement exists, at least one user type identified, success metric stated or inferred."
    inference_policy: "Infer stakeholders, pain points, and success metrics from draft content and codebase patterns. Tag inferences as Medium confidence."
  standard:
    behavior: "Probe each area with follow-up questions. Challenge vague answers. Explore edge cases in user journeys."
    acceptance: "All coverage criteria met with user-confirmed data. Stakeholder interests documented."
    inference_policy: "Infer only secondary stakeholders and minor pain points. Tag inferences as Medium confidence."
  deep:
    behavior: "Exhaustive exploration. Challenge every assumption. Map all stakeholder interests. Explore competing priorities."
    acceptance: "All coverage criteria met with high-confidence user-confirmed data. No unresolved ambiguities."
    inference_policy: "Minimize inference. Ask rather than assume. Only infer when user explicitly declines to elaborate."
source_step_files:
  - "00-01"
  - "01-01"
  - "01-02"
  - "01-03"
---

## Analytical Knowledge

### Scope Estimation

- What is the core change being requested? Summarize it in one sentence.
- How many areas of the codebase does this touch? (rough estimate)
- Is this additive (new code only), modifying (changing existing behavior), or mixed?
- How many distinct subsystems or modules does this affect?
- Are there any external dependencies or integrations involved?
- What is the expected complexity?

### Business Context

- What business problem does this feature solve? Who is currently affected and how?
- What does success look like? How will you measure whether this feature delivered value?
- Are there any deadlines, dependencies, or external factors driving the timeline?
- Who are the stakeholders -- both the people requesting this and the people affected by it?
- What is the current workaround or process that exists today? What is wrong with it?
- How will success be measured? Are there specific KPIs, metrics, or acceptance thresholds?
- Are there competitive, regulatory, or contractual pressures driving this?
- What is the cost of NOT doing this? What happens if we defer it?

### User Needs

- Who are the primary users? Describe their roles and what they do day-to-day.
- What is their biggest pain point that this feature addresses?
- Are there secondary users or stakeholders who are affected indirectly?
- For each user type, what is their current workflow? Walk through a typical session.
- What are the pain points in the current workflow? Where do users get frustrated, blocked, or confused?
- What happens when things go wrong? How do users recover from errors today?
- Are there accessibility or internationalization needs for any user group?

### User Journey Mapping

- What is the entry point for each user type? How do they discover and start using this feature?
- What is the happy path? Walk through the ideal interaction step by step.
- What are the alternative paths? (Different user types, different starting conditions)
- What are the error paths? (Invalid input, missing data, external service down)
- What is the exit point? How does the user know they are done?
- Are there any time-sensitive interactions? (Timeouts, concurrency, real-time updates)

## Validation Criteria

- The business problem is articulated in terms of user impact, not technical implementation
- At least one success metric or acceptance threshold is identified
- If stakeholders are mentioned, their roles and interests are captured
- At least one primary user type is identified
- Pain points are described in terms of user behavior, not technical implementation
- If multiple user types exist, each has a distinct role description
- User journeys have entry point, flow, and exit point defined

## Artifact Instructions

- **requirements-spec.md** Section 1: Problem statement, stakeholders, success metrics, driving factors
- **requirements-spec.md** Section 2: One subsection per user type (role, goals, pain points, proficiency, tasks)
- **requirements-spec.md** Section 3: User journeys with entry point, flow steps, and exit point
- **quick-scan.md** Section 1: Scope classification (small/medium/large) with rationale
