# iSDLC Constitution & Enforcement Mechanics

The iSDLC framework operates as a **Governance Engine** where the Constitution serves as the primary legal and architectural foundation for every project.

## Who Writes the Constitution?

The constitution is not static; it is a **living document** created and evolved through a structured process:

1.  **Original Authorship (Agent D3)**:
    - The **Constitution Generator agent (Agent D3)** is responsible for drafting the initial document during the `discovery` phase.
    - It uses the framework's [constitution.md template](file:///Users/vihang/projects/isdlc/isdlc-framework/src/isdlc/templates/constitution.md) as a base.
    - **Parallel Research Agents**: It launches 4 specialized agents to research the current state-of-the-art for your specific stack:
        - **Best Practices Agent**: Architectural patterns (e.g., NestJS modularity, DI).
        - **Compliance Agent**: Domain-specific regulations (HIPAA, PCI-DSS).
        - **Performance Agent**: Benchmarks and SLAs (e.g., <200ms p95).
        - **Testing Agent**: Standards and coverage targets.

2.  **User Partnership**:
    - Creation is **interactive**. Agent D3 walks the user through each article, allowing for modification, removal, or additions before finalization.

3.  **Ongoing Evolution**:
    - The constitution acts as a repository of project intent. Both humans and agents can propose amendments as the project matures, provided they follow the amendment protocol defined in the document itself.

## How Enforcement Happens

Enforcement is "baked-in" at multiple levels, moving from social contract to hard-coded blocks:

-   **Agent Binding**:
    - Every agent (00-16) is hard-coded to read the project's `docs/isdlc/constitution.md` before starting work. They are instruction-bound to treat its articles as "Universal Laws" that override default behaviors.

-   **Constitutional Validation Hooks**:
    - The framework uses **Node.js hooks** (e.g., [constitutional-iteration-validator.cjs](file:///Users/vihang/projects/isdlc/isdlc-framework/src/claude/hooks/constitutional-iteration-validator.cjs)) that intercept agent actions.
    - These hooks verify that an agent has actually performed a "Constitutional Validation" check before it is allowed to advance a phase or pass a quality gate.

-   **Deterministic Quality Gates**:
    - Thresholds defined in the constitution (e.g., "Unit test coverage: ≥95%") are consumed by [gate-blocker.cjs](file:///Users/vihang/projects/isdlc/isdlc-framework/src/claude/hooks/gate-blocker.cjs). If the current code status doesn't meet these "Constitutional Thresholds," the workflow is physically blocked.

-   **Multi-Agent Debate (Critic/Refiner)**:
    - During design and architecture phases, a **Critic Agent** specifically audits proposals against the Constitution's articles (e.g., YAGNI, SRP) and blocks progress if violations are found.

## Summary

| Component | Responsibility |
| :--- | :--- |
| **Drafting** | Agent D3 (Constitution Generator) + User Review |
| **Logic Source** | `docs/isdlc/constitution.md` |
| **Passive Enforcement** | Agent instruction sets (Principles-first adherence) |
| **Active Enforcement** | Phase Hooks (`.claude/hooks/`) & Quality Gate Checklists |
