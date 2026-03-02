# Architectural Guidance for Generated Code in iSDLC

The iSDLC framework ensures that new projects and features adhere to industry-standard architectural principles through a multi-layered approach involving specialized agents, structured skills, and a "Project Constitution."

## 1. Principles Embedded in Specialized Skills
The framework provides specific "Skills" (documented instructions) to agents that mandate architectural rigor.

- **`DES-001: Module Design`**: This skill is used by the System Designer (Phase 03) and explicitly defines boundaries using:
  - **Single Responsibility**: Each module must do one thing.
  - **High Cohesion**: Internal module logic must be tightly related.
  - **Low Coupling**: Dependencies between modules must be minimized.
- **`ARCH-001: Architecture Pattern Selection`**: Guided selection between Monolith, Microservices, and Event-Driven patterns based on NFRs (Non-Functional Requirements).
- **`DES-002: API Contract Design`**: Enforces "Specification Primacy" (Article I), ensuring that API contracts (OpenAPI) are designed before implementation starts, separating interface from implementation.

## 2. Agent-Specific Instructions
Phase-specific agents are prompted with constraints that enforce professional patterns:

### Solution Architect (Phase 02)
- **Extends Existing Patterns**: If the project is existing (via `/discover`), the agent is forbidden from "redesigning from scratch" and must extend existing patterns, ensuring consistency.
- **Decision Records**: Must use **Architecture Decision Records (ADRs)** to justify technology choices and trade-offs, making the architecture explicit rather than accidental.

### System Designer (Phase 03)
- **Module Decomposition**: Specifically tasked with breaking down the architecture into implementable modules with "clear interfaces and dependencies."
- **Data Flow Design**: Mandated to map how data moves, ensuring that logic isn't scattered haphazardly across the system.

## 3. The Project Constitution
Every project governed by iSDLC contains a `docs/isdlc/constitution.md` file. Agents are required to validate their work against these "Articles" before a phase can be marked complete:

- **Article V: Simplicity First (KISS)**: Design the simplest solution that works. Avoid over-engineering.
- **Article IV: Explicit Over Implicit (SoC)**: All assumptions and decisions must be documented. No "black box" logic.
- **Article X: Fail-Safe Defaults**: Security-first design where access is denied by default.

## 4. Check-and-Balance Model (Debate)
The framework uses a **Creator/Critic/Refiner** model for architecture and design. This means an "Architecture Critic" agent specifically looks for violations of these principles (e.g., circular dependencies, leaked concerns, or excessive complexity) and forces the "Solution Architect" to refine the design before it reaches the "Software Developer."

## Conclusion
iSDLC doesn't just "hope" the AI produces good code. It **enforces** quality through:
1. **Structural Phases** (Planning -> Architecture -> Design -> Code).
2. **Deterministic Skills** (SRP/Cohesion/Coupling instructions).
3. **Constitutional Governance** (Simplicity and Clarity rules).
4. **Automated Handoffs** (Clean boundaries between abstractions).
