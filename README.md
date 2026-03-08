<div align="center">

# iSDLC Framework

<h3><em>A development harness for AI-assisted engineering on existing codebases — opinionated defaults you can override, deterministic enforcement you can tune, and extension points at every layer.</em></h3>

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Agents](https://img.shields.io/badge/Agents-64-purple.svg)](docs/AGENTS.md)
[![Skills](https://img.shields.io/badge/Skills-273-green.svg)](docs/DETAILED-SKILL-ALLOCATION.md)
[![Gates](https://img.shields.io/badge/Quality%20Gates-21-orange.svg)](docs/ARCHITECTURE.md#quality-gates)
[![Bridge](https://img.shields.io/badge/Antigravity-Bridge-blue.svg)](ANTIGRAVITY.md)

</div>

---

## The Problem

AI coding assistants are powerful but structurally unreliable. They skip tests, drift from requirements, lose context across sessions, declare work "done" prematurely, and scope-creep every task. Prompt-based instructions help but can't guarantee behavior — the same prompt produces different results, and rules get forgotten as conversations grow long.

These problems are worse on existing codebases. The AI doesn't know your architecture, your conventions, your test coverage gaps, or your team's standards. It guesses — and guesses wrong. It reinvents patterns you already have, proposes changes that break established conventions, and ignores the constraints that matter to your project.

You need constraints that run **outside** the LLM — deterministic enforcement that the AI can't ignore, reinterpret, or forget. And you need them grounded in your actual codebase, not generic best practices.

## The Harness

iSDLC is that enforcement layer. Install it into your existing project and it learns your codebase first — 23 discovery agents map your architecture, test coverage, dependencies, data models, and feature inventory before changing a single line. The result is a project constitution: governance rules verified against your actual code, not hallucinated from training data.

From there, 28 hooks running as separate Node.js processes intercept tool calls and block non-compliant behavior. The AI doesn't get to decide when it's done. The harness does.

But a harness that only constrains is a cage. Every layer of iSDLC is hackable — from changing a threshold to replacing entire subsystems:

| Layer | Configure | Extend | Override |
|-------|-----------|--------|----------|
| **Quality gates** | Set coverage thresholds per profile (`rapid` / `standard` / `strict`) | Drop domain-specific validators in `.isdlc/hooks/` | Write your own gate logic |
| **Workflows** | Choose light/standard/epic sizing | Define custom workflows (`spike`, `hotfix`, `ui-feature`) with your own phase sequences | Replace built-in phase sequences entirely |
| **Analysis** | Set depth (`brief` / `standard` / `deep`) | Author new personas — drop a markdown file, it joins the roundtable | Override built-in personas, disable ones you don't need, change analysis modes |
| **Project knowledge** | Choose embedding provider (CodeBERT local, Voyage, OpenAI) | [Inject your own documents](docs/PROJECT-KNOWLEDGE.md) — Markdown, HTML, text chunked and embedded alongside code | Build on the semantic engine — chunking, embedding, packaging, and 3-tier content redaction are composable modules |
| **Constitution** | Edit thresholds and rules in your project constitution | Add domain-specific articles | Compose base + project constitutions for team-wide standards |
| **Recovery** | Retry, redo, or rollback any phase | | |

The harness ships strict. You decide how much to loosen — or tighten.

---

## What You Experience

Despite all this structure, interaction is conversational. The harness detects intent and runs the right workflow:

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

### Three-verb backlog

Manage work naturally with **add**, **analyze**, and **build**:

```
You:     "Add the payment processing feature from JIRA-1234"
Claude:  Pulls the ticket, creates a backlog draft. Links GitHub Issues automatically.

You:     "Analyze the payment processing feature"
Claude:  Runs a roundtable — a business analyst captures requirements, a solutions
         architect scans the codebase, a system designer produces specifications.

         ... days later, different machine ...

You:     "Build the payment processing feature"
Claude:  Detects analysis is complete, picks up where it left off, starts from
         the right phase.
```

Each verb is a natural escalation: **add** captures the idea, **analyze** deepens understanding, **build** executes the work.

### Slash commands

For users who prefer explicit control:

| Command | Description |
|---------|-------------|
| `/discover` | Analyze an existing project or set up a new one |
| `/isdlc feature "description"` | Feature development through 9 phases |
| `/isdlc fix "description"` | Bug fix — root cause tracing, test-first fix, quality validation |
| `/isdlc upgrade "name"` | Upgrade a dependency with impact analysis and test validation |
| `/isdlc test generate` | Generate tests for existing code |
| `/isdlc test run` | Execute test suite and report coverage |
| `/isdlc add "description"` | Add an item to the backlog |
| `/isdlc analyze "description"` | Roundtable analysis with 3 personas |
| `/isdlc build "item"` | Build from analysis artifacts |

---

## What You Control

### Gate profiles

Control how rigorous quality gates are. Set per-project or override per-workflow.

| Profile | Coverage | Constitutional Validation | Elicitation | Use Case |
|---------|----------|--------------------------|-------------|----------|
| **rapid** | 60% | Off | 1 interaction | Spikes, simple changes, trusted developers |
| **standard** | 80% | On | 3 interactions | Default — balanced rigor |
| **strict** | 95% | On + mutation testing | Full | Critical/regulated code |

Trigger naturally — "quick build" selects rapid, "this is critical" selects strict — or set a default in your constitution.

### Analysis depth

The roundtable adjusts how deeply it probes:

- **Brief** — accept user framing, 1-2 exchanges per topic
- **Standard** — probe edge cases, challenge assumptions, 3-5 exchanges
- **Deep** — exhaustive exploration, challenge everything, 6+ exchanges

Adapts automatically from signal words, or override with `--light` / `--deep`.

### Personas

The roundtable ships with three built-in personas (business analyst, solutions architect, system designer). Customize the roster:

**Add a domain expert** — drop a markdown file in `.isdlc/personas/`:
```
.isdlc/personas/
  persona-security-reviewer.md    ← joins the roundtable automatically
  persona-compliance-officer.md   ← triggered by keyword matches
```

**Override a built-in** — copy to `.isdlc/personas/`, edit, and the framework uses yours:
```bash
cp src/claude/agents/persona-business-analyst.md .isdlc/personas/persona-business-analyst.md
# Edit to match your needs — "skip MoSCoW, use P0-P3 priorities"
```

**Disable a persona** — exclude via `.isdlc/roundtable.yaml`:
```yaml
disabled_personas:
  - ux-reviewer
```

**Choose analysis mode** — conversational, bulleted, silent, or no-persona straight analysis. Set a default or choose per analysis.

> [Persona Authoring Guide](docs/isdlc/persona-authoring-guide.md)

### Workflow recovery

Made a mistake? No need to restart from scratch.

- **Retry** — re-run the current phase with fresh state ("try again")
- **Redo** — reset the current phase completely ("redo this phase")
- **Rollback** — go back to an earlier phase ("go back to requirements")

Artifacts on disk are preserved so agents read and revise rather than starting blind.

### Constitution

The project constitution (`docs/isdlc/constitution.md`) codifies your governance rules: test coverage thresholds, security requirements, module system constraints, platform compatibility. Generated during `/discover`, enforced by hooks at every phase boundary. Edit it to match your team's standards — it's your document.

### Coming next

| Extension point | What you'll be able to do |
|----------------|--------------------------|
| **Product MCPs** | Distribute iSDLC capabilities as standalone MCP servers — plug discovery, analysis, or quality enforcement into any AI tool |
| **Custom workflows** | Define `spike`, `hotfix`, `ui-feature` — your own phase sequences |
| **User-space hooks** | Drop scripts in `.isdlc/hooks/` for domain-specific validation |
| **Templates** | Project-local file templates agents use during implementation |
| **Skill authoring** | Capture team best practices as reusable skills |
| **Constitution composition** | Base + project merge for team-wide standards |

> [Full Hackability Roadmap](docs/isdlc/hackability-roadmap.md)

---

## How the Harness Works

Three layers enforce quality independently — each runs outside the LLM conversation.

### Enforcement layer: 28 hooks

Hooks are Node.js processes that intercept tool calls via Claude Code's `PreToolUse` and `PostToolUse` events. They are not part of the conversation — the AI cannot argue with, reinterpret, or ignore them.

| Hook | What it enforces |
|------|-----------------|
| `gate-blocker.cjs` | 5 checks before phase advancement: iteration requirements, workflow state, phase sequencing, agent delegation, artifact presence |
| `iteration-corridor.cjs` | When tests are failing, confines the agent to fix-and-retest — no delegation, no gate advancement |
| `test-watcher.cjs` | Tracks test executions, enforces coverage minimums, circuit-breaks after 3 identical failures |
| `constitution-validator.cjs` | Blocks phase completion until artifacts comply with constitutional articles |
| `phase-sequence-guard.cjs` | Blocks out-of-order phase execution — no skipping ahead |
| `delegation-gate.cjs` | Validates the correct agent is delegated for each phase |

All hooks fail open — if a hook crashes, it allows the operation rather than blocking all work.

### Workflow layer: structured phase sequences

Each workflow type defines a fixed phase sequence. The AI cannot invent extra steps or skip phases.

| Workflow | Phases | Use case |
|----------|--------|----------|
| **Feature** | Requirements → Impact Analysis → Architecture → Design → Test Strategy → Implementation → Quality Loop → Code Review | New functionality |
| **Fix** | Requirements → Root Cause Tracing → Test Strategy → Implementation → Quality Loop → Code Review | Bug fixes (TDD: failing test first) |
| **Upgrade** | Analysis & Planning → Execute & Test → Code Review | Dependency/runtime upgrades |
| **Test** | Test Strategy → Implementation → Quality Loop → Code Review | Generate tests for existing code |

Adaptive sizing scales workflows — light features skip architecture and design phases; simple changes get rapid gates.

### Knowledge layer: your codebase as ground truth

Before changing anything, `/discover` runs 23 agents that build a structured model of your project:

| What it maps | How it's used |
|-------------|---------------|
| **Architecture** — module boundaries, naming conventions, dependency chains | Agents extend existing patterns instead of inventing new ones |
| **Test coverage** — framework detection, coverage by module, gap identification | Quality gates calibrated to your actual baseline |
| **Dependencies** — versions, vulnerability scan, compatibility matrix | Upgrade workflows know what's safe to change |
| **Features & behavior** — API endpoints, UI pages, business rules as acceptance criteria | Reverse-engineered AC become characterization tests |
| **Data models** — schemas, entity relationships, migration history | Implementation respects your data layer |

Results persist as a **project constitution** — governance rules verified against your actual code. The constitution is enforced at every phase boundary, not suggested and forgotten.

Each phase reads predecessor artifacts as input. The architect reads the requirements spec. The designer reads the architecture doc. The developer reads the design. Context is structured and traceable, not conversational and ephemeral.

<details>
<summary><strong>Agent breakdown (64 total)</strong></summary>

- **26 SDLC agents** — 1 orchestrator + 15 phase agents + 10 multi-agent team members (Creator/Critic/Refiner debates for requirements, architecture, design, test strategy; Writer/Reviewer/Updater for implementation)
- **23 Discover agents** — 1 orchestrator + 22 sub-agents that analyze existing projects or elicit vision for new ones
- **6 Exploration agents** — 1 quick scan + 1 orchestrator + 3 impact analysis sub-agents + 1 cross-validation verifier
- **4 Tracing agents** — 1 orchestrator + 3 sub-agents that trace bug root causes
- **4 Roundtable agents** — 1 lead analyst + 3 personas (business analyst, solutions architect, system designer) for concurrent analysis
- **1 Skill manager** — manages external skill registration and wiring

</details>

### Lifecycle: Discover → Analyze → Build

```mermaid
flowchart TD
    START["Install iSDLC into your project"] --> DISCOVER

    subgraph DISCOVER["Discover — learn your codebase"]
        D1["23 agents analyze in parallel:\narchitecture, tests, data models,\nfeatures, dependencies"]
        D1 --> D2["Discovery Report\n+ Project Constitution"]
        D2 --> D3["Interactive Walkthrough\n(review findings, configure)"]
    end

    DISCOVER --> BACKLOG["Add items to backlog"]

    BACKLOG --> ANALYZE

    subgraph ANALYZE["Analyze — roundtable review"]
        A1["Business Analyst\ncaptures requirements"]
        A2["Solutions Architect\nscans codebase, assesses impact"]
        A3["System Designer\nspecifies modules + interfaces"]
        A1 --> A4["Artifacts + Sizing"]
        A2 --> A4
        A3 --> A4
    end

    ANALYZE --> BUILD

    subgraph BUILD["Build — phased implementation"]
        B1["Requirements"] --> B2["Impact Analysis"]
        B2 --> B3["Architecture"]
        B3 --> B4["Design"]
        B4 --> B5["Test Strategy"]
        B5 --> B6["Implementation"]
        B6 --> B7["Quality Loop"]
        B7 --> B8["Code Review"]
    end
```

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

### First steps

iSDLC is designed for existing codebases. Install into your project, run discovery, then work naturally:

```bash
claude                        # start Claude Code in your project
> /discover                   # maps architecture, tests, dependencies, conventions
> "fix the login bug"         # harness detects intent, runs the right workflow
> "add user authentication"   # full lifecycle: requirements → design → implement → review
> "upgrade to Node 22"        # impact analysis, migration plan, test validation
```

Discovery generates a constitution from your actual codebase — your patterns, your thresholds, your constraints. Every subsequent workflow is grounded in that knowledge.

New projects are also supported — `/discover` switches to vision elicitation, tech stack selection, and project scaffolding.

---

## Documentation

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture, hooks, agents, state management, end-to-end flow |
| [HOOKS.md](docs/HOOKS.md) | All 28 hooks — what they block, warn, and track |
| [AGENTS.md](docs/AGENTS.md) | All 64 agents with responsibilities and artifacts |
| [DETAILED-SKILL-ALLOCATION.md](docs/DETAILED-SKILL-ALLOCATION.md) | 273 skills organized by category |
| [CONSTITUTION-GUIDE.md](docs/CONSTITUTION-GUIDE.md) | Project governance principles |
| [Hackability Roadmap](docs/isdlc/hackability-roadmap.md) | Extension architecture and what's coming |
| [Persona Authoring Guide](docs/isdlc/persona-authoring-guide.md) | Create, override, and configure roundtable personas |
| [MONOREPO-GUIDE.md](docs/MONOREPO-GUIDE.md) | Multi-project setup |
| [AUTONOMOUS-ITERATION.md](docs/AUTONOMOUS-ITERATION.md) | Self-correcting agent behavior |
| [PROJECT-KNOWLEDGE.md](docs/PROJECT-KNOWLEDGE.md) | Embed your documents into the project knowledge base |
| [SKILL-ENFORCEMENT.md](docs/SKILL-ENFORCEMENT.md) | Runtime skill observability |

---

## System Requirements

- **Node.js 20+** (required)
- **Claude Code** (CLI tool from Anthropic)
- **macOS, Linux, or Windows** (all platforms supported)

---

## Contributing

This framework is under active development. Contributions, feedback, and suggestions are welcome.

**Licensing**: Free and open source (MIT License). You provide your own LLM access via a Claude Code subscription.

---

<div align="center">

**iSDLC Framework** v0.1.0-alpha — an AI development harness you control

</div>
