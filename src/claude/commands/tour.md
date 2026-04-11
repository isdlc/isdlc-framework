---
name: tour
description: Interactive guided tour of iSDLC framework features and capabilities
user_invocable: true
---

# /tour — iSDLC Interactive Guide

An interactive, use-case-driven guide that helps users understand what to do based on their situation. Instead of a reference manual, this walks users through real workflows step by step.

## Instructions

When the user runs `/tour`, follow these steps in order.

### Step 1: Context Detection

Before showing any content, silently check the project state:

1. Read `.isdlc/state.json` (if it exists) and note:
   - `discovery_completed` — whether `/discover` has been run
   - `active_workflow` — whether an SDLC workflow is in progress
   - `discovery_context.project_type` — `existing` or `greenfield`
2. These values inform which menu option to highlight (Step 2), but do NOT block the tour if state is missing.

### Step 2: Welcome + Main Menu

Present this welcome and menu. If context detection found a relevant signal, add a short note like *"Based on your project, option 1 is most relevant."*

---

**Welcome to iSDLC** — a framework of 48 AI agents, 240 skills, and 25 deterministic hooks that guide development from requirements through deployment. Quality gates enforce completion between phases, and hooks enforce rules at runtime.

**What would you like to learn about?**

Use AskUserQuestion with these options:

| Option | Label |
|--------|-------|
| 1 | Working with an existing project |
| 2 | Starting a new (greenfield) project |
| 3 | Upgrading dependencies or runtimes |
| 4 | Generating a test suite |
| 5 | Installation and AI tool setup |

If the user selects an option, jump to that use case section below.

After each use case section, offer navigation with AskUserQuestion:

| Option | Label |
|--------|-------|
| B | Back to main menu |
| N | Next use case |
| Q | Exit tour |

---

### Use Case 1: Working with an Existing Project

#### 1a. First-Time Setup

If you haven't run `/discover` on this project yet, that's your starting point. Discovery analyzes your codebase and creates a tailored project constitution.

**Run:** `/discover`

What happens during discovery (23 specialized agents):
1. **Architecture scan** — maps your project structure, dependencies, and patterns
2. **Tech stack detection** — identifies languages, frameworks, build tools
3. **Test evaluation** — measures existing coverage and identifies gaps
4. **Feature mapping** — catalogs endpoints, pages, commands, background jobs, **extracts behavior as acceptance criteria**
5. **Data model analysis** — maps database schemas, ORM models, migrations
6. **Security audit** — scans for dependency vulnerabilities and OWASP issues
7. **Technical debt audit** — identifies code duplication, complexity, anti-patterns
8. **Constitution generation** — creates governance rules tailored to your stack (testing thresholds, security rules, coding standards)
9. **Post-discovery walkthrough** — reviews the constitution with you, configures iteration limits, suggests next steps

Use `--deep full` for maximum analysis depth (adds performance analysis and ops readiness review with extra debate rounds).

After discovery, the framework knows your project. You only need to re-run `/discover` if the architecture changes significantly (e.g., new major dependency, restructured modules).

#### 1b. Feature Development

**Run:** `/isdlc analyze "description of the feature"` followed by `/isdlc build "<slug>"` after analysis completes.

The feature workflow runs 9 phases (analysis phases inline via `/analyze`, then build phases via `/build`):

1. **Quick Scan** (Phase 00) — lightweight scope estimation using haiku model
2. **Requirements** (Phase 01) — the requirements analyst captures functional requirements, user stories, and acceptance criteria through interactive A/R/C menus
3. **Impact Analysis** (Phase 02) — three parallel sub-agents analyze affected files, entry points, and risk
4. **Architecture** (Phase 03) — the solution architect evaluates whether the feature needs architectural changes (extends existing patterns when discovery context exists)
5. **Design** (Phase 04) — the system designer creates detailed API contracts, data flows, and error handling
6. **Test Strategy** (Phase 05) — the test design engineer creates a test plan with cases mapped to each requirement
7. **Implementation** (Phase 06) — the software developer writes code using TDD (tests first, then implementation)
8. **Quality Loop** (Phase 16) — parallel testing + automated QA:
   - **Track A**: build verification, test execution, mutation testing, coverage analysis
   - **Track B**: lint check, type check, SAST security scan, dependency audit, automated code review
   - Both tracks must pass. If either fails, fixes are delegated back to the developer and both tracks re-run
9. **Code Review** (Phase 08) — the QA engineer reviews code quality with a human review pause

Each phase has a quality gate that must pass before the next begins. If a gate fails, the agent iterates (with circuit breakers to prevent infinite loops).

#### 1c. Bug Fix

**Run:** `/isdlc analyze "description of the bug"` followed by `/isdlc build "<slug>"` after analysis completes. The analyze command classifies bug vs feature inline and routes bugs through the bug-specific roundtable with tracing agents.

Bug fixes use a TDD approach with tracing agents (6 phases):

1. **Bug Report** (Phase 01) — the requirements analyst captures the bug report (expected behavior, actual behavior, reproduction steps) with a sufficiency check
2. **Tracing** (Phase 02) — three specialized agents work in parallel:
   - Symptom analyzer — analyzes error messages and log patterns
   - Execution path tracer — follows code execution from entry point to where the bug manifests
   - Root cause identifier — synthesizes findings and ranks hypotheses
3. **Test Strategy** (Phase 05) — the test design engineer creates test cases that reproduce the bug
4. **Implementation** (Phase 06) — the software developer writes a failing test first, then fixes the code until the test passes
5. **Quality Loop** (Phase 16) — parallel testing + automated QA verifies the fix doesn't break anything else (same parallel Track A/B as features)
6. **Code Review** (Phase 08) — the QA engineer reviews the fix with a human review pause

---

### Use Case 2: Starting a New (Greenfield) Project

#### 2a. First-Time Setup

For a brand-new project, discovery works differently — it helps you plan rather than scan.

**Run:** `/discover`

What happens for a new project (inception party mode):
1. **Vision elicitation** — the product analyst asks about your project goals, target users, and constraints through interactive prompts
2. **Deep discovery with debate rounds** — 7 specialist agents (solution architect, security advisor, devops pragmatist, technical scout, domain researcher, test strategist, data model designer) debate and converge on:
   - **Tech stack recommendation** — evaluated from multiple perspectives (security, cost, DX, scalability)
   - **Architecture blueprint** — designed through structured propose-critique-converge rounds
   - **Data model** — entity design and storage decisions
   - **Test strategy** — coverage targets and tooling selection
3. **PRD generation** — creates a Product Requirements Document from the converged vision
4. **Constitution generation** — creates governance rules for the new project
5. **Post-discovery walkthrough** — reviews the constitution, configures iteration limits, suggests next steps

#### 2b. Feature Development and Bug Fixes

Once discovery is complete, feature development and bug fixes work exactly the same as for existing projects. See Use Case 1b and 1c above.

The only difference: the first feature often implements the core scaffolding, so the orchestrator may include all phases.

---

### Use Case 3: Upgrading Dependencies or Runtimes

#### 3a. Prerequisites

Before upgrading, you need existing test coverage to verify nothing breaks. If your test suite is thin:

**Run:** `/isdlc test generate` first (see Use Case 4)

The upgrade workflow uses an implement-test loop — it makes changes, runs tests, and iterates until all tests pass. Without tests, it has no safety net.

#### 3b. Upgrade Workflow

**Run:** `/isdlc upgrade "name of dependency or runtime"`

Example: `/isdlc upgrade "Node.js 22"` or `/isdlc upgrade "React 19"`

What happens (3 phases):
1. **Upgrade Plan** (Phase 15-plan) — identifies the current version, looks up the target version, reviews changelogs, identifies breaking changes, maps affected files, and generates a step-by-step migration plan ranked by risk. **You approve the plan before any code changes begin.**
2. **Upgrade Execute** (Phase 15-execute) — for each migration step:
   - Makes the code change
   - Runs the test suite
   - If tests fail, analyzes failures and iterates (up to 10 iterations)
   - Moves to next step when tests pass
3. **Code Review** (Phase 08) — QA engineer reviews all changes with a human review pause

---

### Use Case 4: Generating a Test Suite

#### 4a. Why Generate Tests?

Tests are a prerequisite for:
- **Upgrades** — the implement-test loop needs tests to verify changes
- **Bug fixes** — TDD requires a failing test that proves the bug exists
- **Safe refactoring** — tests catch regressions
- **Constitution enforcement** — your constitution defines coverage thresholds (e.g., ≥80% unit coverage)

#### 4b. Test Generation Workflow

**Run:** `/isdlc test generate`

What happens:
1. **Analysis** — evaluates your codebase to understand what needs testing
2. **Test strategy** — the test design engineer creates a comprehensive plan (unit, integration, E2E)
3. **Implementation** — the software developer writes the tests using your project's existing test framework
4. **Execution** — runs the generated tests and measures coverage
5. **Review** — QA engineer reviews test quality

The framework uses your constitution's testing thresholds to determine when coverage is sufficient.

---

### Section 5: Installation and AI Tool Setup

#### Installation Methods

| Method | Command |
|--------|---------|
| npx (one-time) | `npx isdlc init` |
| Global install | `npm install -g isdlc && isdlc init` |
| Git clone | `git clone <repo> && ./install.sh` |
| Windows | `.\install.ps1` |

#### Agent Model Configuration

iSDLC uses Claude Code as the primary AI engine. Sub-agents can be routed to different model providers:

| Mode | Description |
|------|-------------|
| claude-code | All agents use Claude Code (recommended) |
| quality | Anthropic API for max quality (requires API key) |
| free | Free-tier cloud providers for cost-sensitive work |
| budget | Mix of free and paid for balanced cost |
| local | Ollama only — offline, requires GPU with 12GB+ VRAM |
| hybrid | Smart per-phase routing — advanced, configure in providers.yaml |

**Run:** `/provider` to view or change your current configuration.

#### Key Files

- `.isdlc/state.json` — project state (gitignored, tracks phases and progress)
- `.isdlc/providers.yaml` — model provider configuration
- `docs/isdlc/constitution.md` — project governance rules
- `.claude/settings.json` — Claude Code hook and agent configuration

---

## Argument Handling

- `/tour` with no arguments → Show welcome + main menu (Step 2)
- `/tour existing` → Jump directly to Use Case 1
- `/tour new` or `/tour greenfield` → Jump directly to Use Case 2
- `/tour upgrade` → Jump directly to Use Case 3
- `/tour test` → Jump directly to Use Case 4
- `/tour install` → Jump directly to Section 5

When jumping to a specific section, still offer the navigation options (Back / Next / Exit) at the end.
