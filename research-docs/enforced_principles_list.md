# Master List of Enforced Architectural Principles

The iSDLC framework deterministically enforces a wide array of architectural principles. These are not just guidelines but are operationalized through **Custom Hooks**, **Specialized Agents**, and the **Project Constitution**.

## 1. Structural & Organizational Principles
- **Separation of Concerns (SoC)**: Operationalized via 21 distinct SDLC phases and 64 specialized agents. Logic is decoupled from the LLM via independent Node.js processes (hooks).
- **Specification Primacy (Design-by-Contract)**: Article I mandates that code must strictly serve specifications. All ambiguities must be resolved before coding.
- **Artifact Traceability**: Article VII ensures a continuous audit trail from Requirements -> Architecture -> Design -> Tests -> Code.

## 2. SOLID & Clean Code Principles
- **Single Responsibility Principle (SRP)**: Enforced through the 1-to-1 agent-phase mapping and highly segregated skills.
- **Open/Closed Principle (OCP)**: The framework architecture (hooks/workflows) allows for project-specific extensions without modifying the core orchestrator.
- **DRY (Don't Repeat Yourself)**: Explicitly checked by the `Implementation Reviewer` and `QA Engineer` agents with blocking thresholds for duplicated logic.
- **YAGNI (You Ain't Gonna Need It)**: Article V forbids adding features or abstractions not immediately required by a given phase.
- **KISS (Simplicity First)**: Article V mandates the simplest possible design and prohibits over-engineering.

## 3. Reliability & Robustness Principles
- **Fail-Safe Defaults**: Article X requires that infrastructure failures (like a hook crash) allow the workflow to continue ("fail-open") rather than blocking development.
- **Fail-Fast**: Enforced during the `/discover` and `Environment Builder` phases to catch configuration errors at startup.
- **Idempotence**: Article XIV ensures that installation and update processes can be run multiple times without corrupting state or duplicating work.
- **Atomicity & Consistency**: Article XVI ensures that state changes in `.isdlc/state.json` are atomic and consistent across sessions.

## 4. Security & Safety Principles
- **Security by Design**: Article III mandates that security architecture (threat modeling) must be defined before any implementation begins.
- **Least Privilege**: Article X and the `Security & Compliance Auditor` agent enforce minimal permission models and "deny-by-default" access.
- **Explicit over Implicit**: Article IV forbids assumptions. Agents must mark unknowns with `[UNKNOWN]` and escalate rather than guessing.

## 5. Development Process Principles
- **Test-First Development (TDD)**: Article II and the `test-watcher` hook enforce that a failing test must exist before a fix or feature is implemented.
- **Automated Quality Gates**: Article IX prevents the "skipping" of quality checks. Advancement is blocked by Node.js processes the AI cannot influence.

## 5. Summary Table of Principle Enforcement

| Principle | Enforcement Mechanism | Primary Article |
|-----------|-----------------------|-----------------|
| **SOLID** | Skills & Handoffs | N/A |
| **SoC** | Phase/Agent Layout | Article IV |
| **DRY** | Implementation Reviewer | Article VI |
| **YAGNI/KISS** | Constitutional Guard | Article V |
| **TDD** | Test-Watcher Hook | Article II |
| **Fail-Safe** | Hook Infrastructure | Article X |
| **Traceability** | Traceability Matrix | Article VII |
| **Security** | Security Auditor Agent | Article III |
