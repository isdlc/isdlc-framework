# Mechanism of Enforcement for User Code

The iSDLC framework does not just use architectural principles for its own construction; it serves as a **"Governance Engine"** that forces new code created for the user to adhere to those same standards. 

Here is specifically how that enforcement works on the code you build:

## 1. Constitutional Inheritance (The "Laws")
When you run `isdlc init` or `/discover`, the framework creates a `docs/isdlc/constitution.md` file **inside your project**.
- **Agent Binding**: All agents working on your project are instructed to read *your* constitution first.
- **Principle Propagation**: If the constitution says `Article II: Test-First Development`, the agent cannot technically complete the implementation phase unless it provides evidence of failing tests.

## 2. Mandatory Analysis Categories (The "Audits")
The **`Implementation Reviewer` (Agent 05)** and **`Security Auditor` (Agent 08)** analyze your code against 8 mandatory categories before it is ever merged:

- **SOLID & Quality Gates**:
  - **DRY Adherence**: Reviewers are instructed to **BLOCK** the workflow if they find duplicated logic blocks (> 5 lines).
  - **Cyclomatic Complexity**: Functions with > 10 decision points are marked as **BLOCKING** defects.
  - **Single Responsibility (SRP)**: Provincial modules doing multiple unrelated things trigger a **REVISE** verdict.
- **Security Gates**:
  - **Least Privilege**: The Auditor checks for "deny-by-default" authorization patterns and least-privilege permissions in your code.
  - **Injection Prevention**: Mandatory SAST/DAST scans (via `/vulnerability-scanning`) check for unsanitized input usage.

## 3. Deterministic Hook Enforcement (The "Police")
The framework installs Node.js hooks into your `.claude/hooks/` directory. Unlike agents, these are **pure code** and cannot be "persuaded" by the AI.
- **`gate-blocker.cjs`**: This hook intercepts tool calls. If an agent tries to finalize a phase (e.g., "Architecture complete") but the required artifacts (like diagrams or ADRs) are missing from your project, the hook **throws a JSON error** and blocks the tool from executing.
- **`test-watcher.cjs`**: Enforces TDD by checking your project's test directory. If production code was changed but no new tests were added, it blocks advancement.

## 4. The Critic/Refiner Loop (The "Self-Correction")
Architecture and Design phases use a multi-agent debate model:
- **Creator**: Drafts the initial architecture for your feature.
- **Critic**: Specifically searches for "Coupling Contradictions" and "YAGNI violations."
- **Refiner**: Adjusts the plan based on the Critic's findings.
- **Outcome**: The user receives a refined design that has already been stress-tested for architectural principles *before* implementation starts.

## Summary of Mechanism
| Phase | Enforcement Mechanism | Result for User Code |
|-------|-----------------------|----------------------|
| **Setup** | `constitution.md` Injection | Custom "Architecture Laws" for the project |
| **Design** | Critic/Refiner Debate | No circular dependencies or over-engineering |
| **Code** | Implementation Reviewer | No DRY violations, low complexity |
| **Verify** | `gate-blocker.cjs` Hook | 100% adherence to quality gates |
| **Audit** | Security & Compliance Auditor | Hardened, least-privilege implementation |
