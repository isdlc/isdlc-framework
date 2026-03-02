<div align="center">

# iSDLC Framework

<h3><em>Behind every chat, a structured development lifecycle — managing your backlog, running workflows, enforcing quality, tracking progress, and documenting every change so you pick up where you left off.</em></h3>

<p><strong>An invisible framework for Claude Code and Antigravity that orchestrates agents, skills, and hooks behind the scenes — managing workflows, enforcing quality gates, preserving context across sessions, and producing a traceable artifact chain from requirements to code review.</strong></p>

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Agents](https://img.shields.io/badge/Agents-64-purple.svg)](docs/AGENTS.md)
[![Skills](https://img.shields.io/badge/Skills-273-green.svg)](docs/DETAILED-SKILL-ALLOCATION.md)
[![Gates](https://img.shields.io/badge/Quality%20Gates-21-orange.svg)](docs/ARCHITECTURE.md#quality-gates)
[![Bridge](https://img.shields.io/badge/Antigravity-Bridge-blue.svg)](ANTIGRAVITY.md)

</div>

---

## What is iSDLC?

The iSDLC (intelligent Software Development Lifecycle) framework adds structure to AI-powered development. It works in the background — detecting intent, selecting the right workflow, and managing the full lifecycle from requirements through production. It provides a consistent development experience across **Claude Code** and **Antigravity**.

It exists because LLM-based coding assistants are powerful but unreliable without external constraints — they skip tests, drift from requirements, lose context across sessions, and declare work "done" prematurely. iSDLC adds the structure they lack, invisibly.

### How it works

Just talk to your AI assistant naturally. The framework detects your intent and runs the right workflow:

```
You:     "The login page crashes when the password field is empty"
Claude:  Kicks off a bug fix workflow — traces the root cause, writes a failing test,
         implements the fix, validates through quality gates, and produces a reviewed PR.

You:     "Add dark mode support"
Claude:  Runs a feature workflow — captures requirements interactively, designs the
         architecture, implements with test coverage, and validates quality.

You:     "Upgrade React to v19"
Claude:  Starts an upgrade workflow — analyzes breaking changes, plans migration steps,
         applies changes, and validates everything still works.
```

No commands to remember. No phases to manage. No process to follow. The framework handles it.

### Three-verb backlog model

Manage your backlog naturally with three verbs — **add**, **analyze**, and **build**:

```
You:     "Add the payment processing feature from JIRA-1234"
Claude:  Pulls the ticket, creates a draft in the backlog. If you describe a feature
         in plain text, it searches GitHub Issues for matches and offers to link them.
         Quick intake, no analysis.

You:     "Analyze the payment processing feature"
Claude:  Runs a roundtable with three AI personas — a business analyst captures
         requirements, a solutions architect scans the codebase, and a system
         designer produces architecture and design. All stored in docs/requirements/.

         ... days later, on a different machine ...

You:     "Build the payment processing feature"
Claude:  Detects that analysis is complete, picks up where it left off,
         and begins implementation from the right phase.
```

Each verb is a natural escalation: **add** captures the idea, **analyze** deepens understanding, **build** executes the work.

### Lifecycle: Discovery → Analyze → Build

```mermaid
flowchart TD
    START["User starts a project"] --> DETECT{"New or Existing?"}
    
    DETECT -->|"New project"| NEW_FLOW
    DETECT -->|"Existing codebase"| EXISTING_FLOW
    
    subgraph NEW_FLOW["🟢 /discover --new"]
        N1["D7: Vision Elicitation\n(interactive: problem, users, features)"] --> N2["D3: Parallel Research\n(4 agents: best practices, compliance, perf, testing)"]
        N2 --> N3["Tech Stack Selection\n(interactive confirmation)"]
        N3 --> N4["D7: PRD Generation\n(functional/NFR/MVP scope)"]
        N4 --> N5["D8: Architecture Blueprint\n(components, data model, APIs, dirs)"]
        N5 --> N6["D3: Constitution Generation\n(interactive article review)"]
        N6 --> N7["D4: Scaffold Project\n(src/, tests/, skills)"]
    end

    subgraph EXISTING_FLOW["🔵 /discover --existing"]
        E1["Phase 1: Parallel Analysis\n(D1: Architecture, D2: Tests,\nD5: Data Model, D6: Features+AC)"]
        E1 --> E1b["Phase 1b: Characterization Tests\n(test.skip scaffolds from AC)"]
        E1b --> E1c["Phase 1c: Artifact Integration\n(traceability matrix)"]
        E1c --> E2["Phase 2: Discovery Report"]
        E2 --> E3["Phase 3: Constitution"]
        E3 --> E4["Phase 4: Skills Install"]
        E4 --> E5["Phase 5: Testing Gaps"]
        E5 --> E6["Phase 6: Interactive Walkthrough"]
    end

    N7 --> HANDOVER
    E6 --> HANDOVER

    HANDOVER["📦 Handover Artifacts"]

    HANDOVER --> BACKLOG["User adds items\nto BACKLOG.md"]
    
    BACKLOG --> ANALYZE

    subgraph ANALYZE["🟡 analyze #N"]
        A1["Resolve item\n(add if missing)"] --> A2["Roundtable Analysis\n(Maya, Alex, Jordan)"]
        A2 --> A3["Progressive Artifacts\n(requirements, architecture, design)"]
        A3 --> A4["Sizing\n(light/standard/epic)"]
    end

    ANALYZE --> BUILD

    subgraph BUILD["🔴 build / feature"]
        B1["Phase 01: Requirements"] --> B2["Phase 02: Impact Analysis"]
        B2 --> B3["Phase 03: Architecture"]
        B3 --> B4["Phase 04: Design"]
        B4 --> B5["Phase 05: Test Strategy"]
        B5 --> B6["Phase 06: Implementation"]
        B6 --> B7["Phase 16: Quality Loop"]
        B7 --> B8["Phase 08: Code Review"]
    end
```

### Slash commands

For users who prefer explicit control, slash commands are available:

| Command | Description |
|---------|-------------|
| `/discover` | Analyze an existing project or set up a new one |
| `/isdlc feature "description"` | Feature development through 9 phases |
| `/isdlc fix "description"` | Bug fix through 6 phases — root cause tracing, test-first fix, quality validation |
| `/isdlc test generate` | Generate tests for existing code — recommended after `/discover` |
| `/isdlc test run` | Execute test suite and report coverage |
| `/isdlc upgrade "name"` | Upgrade a dependency with impact analysis and test validation |
| `/isdlc add "description"` | Add an item to the backlog — auto-links GitHub Issues when possible |
| `/isdlc analyze "description"` | Analyze a backlog item — roundtable with 3 personas for requirements, architecture, design |
| `/isdlc build "item"` | Build a backlog item — auto-detects analysis level, starts from the right phase |

---

## Why iSDLC?

### Self-adapting

- **Codebase knowledge** — `/discover` runs 23 agents that map your architecture, test coverage, dependencies, and conventions before changing anything
- **Tech-stack-aware skills** — detects your technologies and activates relevant skills automatically (React, Django, Go, etc.)
- **Adaptive workflow sizing** — scales to light, standard, or epic based on impact analysis
- **Self-correction with limits** — agents iterate to fix failing tests; circuit breakers stop infinite loops and escalate to a human

### Constitution-governed

- **Specification primacy** — code serves specifications, not the other way around
- **Per-project constitution** — `/discover` generates governance rules tailored to your codebase
- **Constitutional validation** — hooks block phase advancement until artifacts comply

### Document-driven

- **Structured workflows** — fixed phase sequences with clear handoffs and typed artifacts
- **Session persistence** — resume where you left off across sessions, not from scratch
- **Artifact traceability** — every feature produces a chain: requirements, architecture, test cases, code changes

### Deterministically enforced

- **Quality gates the AI can't skip** — 28 hooks run as separate Node.js processes outside the LLM conversation
- **Test-first development** — TDD enforcement with coverage minimums; the agent cannot advance without passing tests
- **Scope containment** — fix workflows are scoped to 6 phases, features to 9; the agent cannot invent extra steps
- **Human escalation** — circuit breakers, iteration limits, and gate failures pause and escalate to a human

<details>
<summary><strong>Agent breakdown (64 total)</strong></summary>

- **26 SDLC agents** — 1 orchestrator + 15 phase agents + 10 multi-agent team members (Creator/Critic/Refiner debates for requirements, architecture, design, test strategy; Writer/Reviewer/Updater for implementation)
- **23 Discover agents** — 1 orchestrator + 22 sub-agents that analyze existing projects or elicit vision for new ones
- **6 Exploration agents** — 1 quick scan + 1 orchestrator + 3 impact analysis sub-agents + 1 cross-validation verifier
- **4 Tracing agents** — 1 orchestrator + 3 sub-agents that trace bug root causes
- **4 Roundtable agents** — 1 lead analyst + 3 personas (business analyst, solutions architect, system designer) for concurrent analysis
- **1 Skill manager** — manages external skill registration and wiring

</details>

**Licensing**: This framework is **free and open source** (MIT License). You provide your own LLM access via a Claude Code subscription.

> [Full agent documentation](docs/AGENTS.md) | [System architecture](docs/ARCHITECTURE.md)

---

## Getting Started

### Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| **Node.js** | 20+ | Required for hooks, tools, and CLI |
| **Claude Code** | Latest | [Optional] [Install guide](https://docs.anthropic.com/en/docs/claude-code/overview) |
| **Antigravity** | Latest | [Optional] |

### Install

**Via npm (recommended):**
```bash
cd /path/to/your-project
npx isdlc
```

**From source (macOS / Linux):**
```bash
cd /path/to/your-project
git clone <repo-url> isdlc-framework
./isdlc-framework/install.sh
```

**From source (Windows PowerShell):**
```powershell
cd C:\path\to\your-project
git clone <repo-url> isdlc-framework
.\isdlc-framework\install.ps1
```

The installer sets up 64 agents, 273 skills, 28 hooks, and the `.isdlc/` state directory. See [Installation Flow](docs/ARCHITECTURE.md#installation-flow) for details.

### Start using the framework

```bash
claude
```

**Existing projects** — start with `/discover` to map your architecture, tests, dependencies, and conventions. Then generate baseline tests with `/isdlc test generate`. After that, describe what you want naturally — "fix the login bug", "add user authentication", "upgrade to Node 22".

**New projects** — run `/discover` to define your project vision and generate a constitution, then describe features naturally.

The framework detects your intent and runs the appropriate workflow automatically.

---

## How iSDLC Solves AI Development Challenges

AI coding assistants are powerful but have well-known failure modes. The iSDLC framework addresses eleven specific challenges through structural enforcement — 28 hooks, quality gates at every phase boundary, 64 agents, and configuration files that constrain AI behavior deterministically rather than relying on prompt instructions alone.

### 1. Enforcement Outside the LLM

**The problem**: Prompt-based constraints can be ignored, reinterpreted, or forgotten as context grows. AI behavior is inherently non-deterministic — the same prompt produces different results. No amount of instruction-tuning guarantees the AI will follow rules once the conversation is long enough.

**How iSDLC solves it**:
- All 28 hooks run as **separate Node.js processes** — they intercept tool calls via Claude Code's `PreToolUse` and `PostToolUse` events and are not part of the LLM conversation
- `iteration-corridor.cjs` enforces TEST and CONST corridors — when tests are failing, the agent can only fix code and re-run tests (no delegation, no gate advancement)
- `gate-blocker.cjs` performs 4 checks before allowing phase advancement: iteration requirements, workflow validation, phase sequencing, and agent delegation verification
- State-driven enforcement means behavior depends on `.isdlc/state.json` and config files, not on conversation history
- **Fail-open safety**: if a hook crashes or times out, it allows the operation to proceed rather than blocking all work

> *Mechanism*: 28 hooks as Node.js processes, `iteration-corridor.cjs` (TEST/CONST corridors), `gate-blocker.cjs` (5 checks), `.claude/settings.json` registration, fail-open design

### 2. Quality That Can't Be Skipped

**The problem**: AI assistants declare tasks "done" prematurely — tests don't pass, coverage is below threshold, edge cases are missing, and there's no systematic quality validation. The AI cannot be trusted to judge its own output.

**How iSDLC solves it**:
- **Quality gates at every phase boundary** across 21 enforced phases, each with specific requirements (artifacts, tests, coverage)
- **Quality Loop** (Phase 16) runs parallel testing and automated QA in feature/fix workflows, replacing sequential test/CI phases
- `test-watcher.cjs` monitors test executions, tracks up to 10 iterations per phase, and enforces 80% coverage minimum
- **Circuit breaker**: 3 identical test failures in a row triggers an automatic stop — the agent cannot continue making the same mistake
- When iteration limits are exceeded, the system **escalates to a human** rather than allowing the agent to proceed
- Gate failures require remediation — they cannot be skipped or waived

> *Mechanism*: `test-watcher.cjs` (10 iterations, 80% coverage, circuit breaker at 3), `gate-blocker.cjs`, human escalation

### 3. Pick Up Where You Left Off

**The problem**: AI conversations are ephemeral. Close the terminal, hit a context limit, or step away for lunch — and all progress is lost. You restart from scratch every session.

**How iSDLC solves it**:
- `.isdlc/state.json` persists workflow state, phase progress, iteration counters, and active agent across sessions
- `workflow-completion-enforcer.cjs` performs post-completion self-healing — adding phase snapshots and metrics to workflow history when a workflow ends
- Starting a new Claude Code session with an in-progress workflow resumes at the exact phase where you left off — no repeated work
- Each phase produces typed artifacts (requirements spec, architecture doc, test strategy) that survive session boundaries and become inputs to the next phase

> *Mechanism*: `.isdlc/state.json` persistence, `workflow-completion-enforcer.cjs`, phase artifact directories (`.isdlc/phases/`)

### 4. Scope Stays Contained

**The problem**: Ask an AI to fix a bug and it refactors three modules, upgrades a dependency, and rewrites the test suite. Scope creep is the default behavior — the AI optimizes for "helpful" rather than "focused."

**How iSDLC solves it**:
- `workflows.json` defines the exact phase sequence for each workflow type (feature, fix, test, upgrade) — the agent cannot invent extra steps
- Discovery context includes "DO NOT REDESIGN" constraints — agents extend existing patterns rather than proposing rewrites
- `phase-sequence-guard.cjs` blocks out-of-order phase execution — the agent cannot jump ahead or revisit completed phases
- Fix workflows are scoped to 6 phases (requirements, tracing, test strategy, implementation, quality loop, code review) with no architecture or design phases

> *Mechanism*: `workflows.json` (fixed phase sequences), `phase-sequence-guard.cjs`, "DO NOT REDESIGN" constraint table, workflow-specific phase lists

### 5. Knowledge of Your Codebase

**The problem**: AI assistants start every session with zero knowledge of your codebase. They guess at architecture, reinvent existing patterns, and propose changes that conflict with established conventions.

**How iSDLC solves it**:
- `/discover` runs 23 specialized agents that map architecture, test coverage, dependencies, and feature inventory
- Discovery results are persisted as structured artifacts (constitution, architecture report, test evaluation, feature map)
- The orchestrator injects **DISCOVERY CONTEXT** into Phases 01-03 delegation prompts, so downstream agents inherit project knowledge
- The `--existing` flag triggers behavior extraction and characterization test generation for legacy code

> *Mechanism*: `discover-orchestrator.md` (23 discover agents), orchestrator DISCOVERY CONTEXT injection, `--deep` / `--atdd-ready` flags

### 6. Self-Correcting, Not Self-Looping

**The problem**: When an AI gets stuck, it loops — retrying the same failing approach, generating variations of broken code, burning tokens without progress. It lacks the ability to recognize when it's stuck and change strategy.

**How iSDLC solves it**:
- **Circuit breaker** in `test-watcher.cjs`: 3 identical test failures trigger an automatic stop with human escalation
- **Iteration limits**: each phase has a configured maximum (typically 5-10 iterations) — exceeding the limit forces escalation rather than infinite retry
- `iteration-corridor.cjs` confines the agent to a "corridor" — when tests are failing, the agent can only edit code and re-run tests, nothing else
- Escalation rules are defined in `iteration-requirements.json`: circuit breaker, max iterations exceeded, timeout — all escalate to human review

> *Mechanism*: `test-watcher.cjs` (circuit breaker at 3), `iteration-corridor.cjs` (corridor confinement), `iteration-requirements.json` escalation rules

### 7. Context That Survives

**The problem**: As conversations grow long, AI assistants lose track of earlier decisions. Requirements from the beginning of a session get contradicted by implementation at the end. Across sessions, all context is lost entirely.

**How iSDLC solves it**:
- Phase-based handoff means each agent receives only the artifacts it needs, not the full conversation history — context is structured, not conversational
- The **Project Constitution** (generated during `/discover`) codifies governance rules that survive session boundaries
- `.isdlc/state.json` tracks which phases are complete, what artifacts exist, and where the workflow stands
- Each phase reads predecessor artifacts as input — the architect reads the requirements spec, the designer reads the architecture doc, the developer reads the design

> *Mechanism*: `.isdlc/state.json`, phase artifact chain, `docs/isdlc/constitution.md`, 1-to-1 agent-phase mapping

### 8. Architectural Coherence

**The problem**: The AI drifts from reality — it fabricates APIs, invents patterns your codebase doesn't use, and makes contradictory decisions across phases. The architecture says REST but the code uses GraphQL. The design specifies PostgreSQL but the implementation creates SQLite tables.

**How iSDLC solves it**:
- The **Project Constitution** codifies real patterns, dependencies, and constraints as ground truth — verified during `/discover`, not hallucinated
- `constitution-validator.cjs` intercepts phase completion attempts and blocks advancement until artifacts are validated against constitutional articles
- **1-to-1 agent-phase mapping** — each phase has exactly one agent with clear responsibilities, preventing overlapping decisions
- Phase artifacts are inputs to subsequent phases — the architect's decisions constrain the designer, whose decisions constrain the developer
- Article I (Specification Primacy) ensures code serves specifications, not the other way around

> *Mechanism*: `constitution-validator.cjs`, `docs/isdlc/constitution.md`, 1-to-1 agent-phase mapping, Article I (Specification Primacy)

### 9. Requirements Before Code

**The problem**: Users provide incomplete descriptions — missing edge cases, unstated assumptions, vague acceptance criteria. AI assistants fill gaps with guesses rather than asking, and jump straight to code.

**How iSDLC solves it**:
- Phase 01 (Requirements Analyst) uses interactive A/R/C elicitation — presenting menus where the user can **A**djust, **R**efine, or **C**ontinue
- Multi-agent debate teams (Creator/Critic/Refiner) challenge requirements before they're finalized
- `menu-tracker.cjs` tracks elicitation progress while `gate-blocker.cjs` enforces minimum interactions before allowing phase advancement
- Bug reports include a **sufficiency check** — the requirements analyst validates expected behavior, actual behavior, and reproduction steps
- `plan-surfacer.cjs` blocks delegation to implementation phases when the task plan hasn't been generated

> *Mechanism*: `menu-tracker.cjs` (min 3 interactions), `plan-surfacer.cjs`, bug sufficiency check, A/R/C menus, Creator/Critic/Refiner debates

### 10. Traceability

**The problem**: AI-generated code has no audit trail. You can't trace a line of code back to the requirement that justified it, or verify that all acceptance criteria have test coverage.

**How iSDLC solves it**:
- Article VII (Artifact Traceability) in the constitution mandates that every artifact references its source
- Each phase produces typed artifacts with explicit input/output relationships (requirements, architecture, design, tests, code)
- The test design phase produces `ac-traceability.csv` mapping acceptance criteria to test cases to implementation files
- `gate-blocker.cjs` blocks phase advancement unless required artifacts are present

> *Mechanism*: Article VII, `ac-traceability.csv`, `gate-blocker.cjs` artifact validation, typed phase artifacts

### 11. Multi-Agent Coordination

**The problem**: Multi-agent systems are fragile — agents talk past each other, duplicate work, make contradictory decisions, and lack clear handoff protocols. Orchestrating 64 agents without chaos is a coordination problem, not just a prompting problem.

**How iSDLC solves it**:
- **5 orchestrators** provide entry points and coordination — SDLC orchestrator, discover orchestrator, impact-analysis orchestrator, tracing orchestrator, and roundtable analyst
- `workflows.json` defines fixed, non-skippable phase sequences — agents execute in a defined order, not in parallel free-for-all
- **Multi-agent debate teams** (Creator/Critic/Refiner) in creative phases ensure quality through structured disagreement
- **Roundtable analysis** — the analyze flow runs 3 concurrent personas (business analyst, solutions architect, system designer) that produce artifacts progressively during conversation
- `delegation-gate.cjs` validates that the correct agent is delegated for each phase, with parallel session safety so analyze and build can run on separate machines simultaneously
- `skill-delegation-enforcer.cjs` ensures skill invocations are followed by delegation to the correct orchestrator
- Phase 02 orchestrators each coordinate 3-5 parallel sub-agents with structured consolidation

> *Mechanism*: 5 orchestrators, `workflows.json` (fixed sequences), `delegation-gate.cjs`, `skill-delegation-enforcer.cjs`, multi-agent debate teams, roundtable personas, parallel sub-agent orchestration

---

## Documentation

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture, hooks, agents, state management, end-to-end flow |
| [HOOKS.md](docs/HOOKS.md) | All 28 hooks — what they block, warn, and track |
| [AGENTS.md](docs/AGENTS.md) | All 64 agents with responsibilities and artifacts |
| [DETAILED-SKILL-ALLOCATION.md](docs/DETAILED-SKILL-ALLOCATION.md) | 273 skills organized by category |
| [CONSTITUTION-GUIDE.md](docs/CONSTITUTION-GUIDE.md) | Project governance principles |
| [MONOREPO-GUIDE.md](docs/MONOREPO-GUIDE.md) | Multi-project setup |
| [AUTONOMOUS-ITERATION.md](docs/AUTONOMOUS-ITERATION.md) | Self-correcting agent behavior |
| [SKILL-ENFORCEMENT.md](docs/SKILL-ENFORCEMENT.md) | Runtime skill observability |

---

## System Requirements

- **Node.js 20+** (required)
- **Claude Code** (CLI tool from Anthropic)
- **macOS, Linux, or Windows** (all platforms supported)

---

## Contributing

This framework is under active development. Contributions, feedback, and suggestions are welcome.

## License

MIT License

---

<div align="center">

**iSDLC Framework** v0.1.0-alpha — 64 agents, 273 skills, 21 enforced phases, 28 hooks, Antigravity Bridge

</div>
