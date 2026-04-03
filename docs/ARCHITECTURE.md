# iSDLC System Architecture

This document describes the internal architecture of the iSDLC framework — how installation works, how agents coordinate, how hooks enforce rules, and how state flows through the system.

---

## Table of Contents

1. [Overview](#overview)
2. [Installation Flow](#installation-flow)
3. [The Orchestrator](#the-orchestrator)
4. [Agents (48)](#agents-48)
5. [Skills (240)](#skills-240)
6. [Hooks (25)](#hooks-25)
7. [Quality Gates (17)](#quality-gates-17)
8. [State Management](#state-management)
9. [Configuration](#configuration)
10. [End-to-End Flow Example](#end-to-end-flow-example)

---

## Overview

The iSDLC framework installs into a user's project and integrates with Claude Code through three mechanisms:

1. **Agents** (`.claude/agents/`) — markdown files that define specialized AI behaviors, loaded by Claude Code's Task tool
2. **Hooks** (`.claude/hooks/`) — Node.js scripts registered in `.claude/settings.json` that intercept tool calls at runtime
3. **State** (`.isdlc/`) — JSON files that persist workflow progress, phase state, and configuration across sessions

```
┌────────────────────────────────────────────────────────────────────────┐
│                          User's Project                                │
│                                                                        │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐ │
│  │   .claude/       │  │   .isdlc/        │  │   docs/              │ │
│  │   ├── agents/    │  │   ├── state.json  │  │   ├── isdlc/        │ │
│  │   ├── skills/    │  │   ├── config/     │  │   │   └── const.md  │ │
│  │   ├── hooks/     │  │   ├── phases/     │  │   ├── requirements/ │ │
│  │   ├── commands/  │  │   └── providers.  │  │   ├── architecture/ │ │
│  │   └── settings.  │  │        yaml       │  │   └── design/       │ │
│  │        json      │  │                   │  │                      │ │
│  └──────────────────┘  └──────────────────┘  └──────────────────────┘ │
│                                                                        │
│  ┌─────────────────────── Runtime Flow ──────────────────────────────┐ │
│  │                                                                    │ │
│  │  User ──► /isdlc ──► Orchestrator ──► Phase Agent (via Task tool)  │ │
│  │                         │                    │                      │ │
│  │                    reads state.json     PreToolUse hooks fire       │ │
│  │                    checks constitution  PostToolUse hooks fire      │ │
│  │                    selects workflow      writes artifacts            │ │
│  │                                                                    │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

**Key design principle**: Hooks run as separate Node.js processes, outside the LLM context. They read configuration files and state, then output JSON to allow or block tool calls. The AI cannot negotiate with, override, or ignore hooks.

---

## Installation Flow

Running `npx isdlc init` (or `isdlc init` after global install) triggers a 6-step installer:

```
Step 1/6: Detect project type
    ├── Scan for markers (package.json, src/, etc.)
    ├── Identify ecosystem (Node.js, Python, Go, etc.)
    └── Classify: existing project or new project

Step 2/6: Check for monorepo
    ├── Look for workspace indicators (lerna.json, pnpm-workspace.yaml, etc.)
    ├── Discover sub-projects
    └── Confirm monorepo mode (prompt user)

Step 3/6: Copy framework files
    ├── .claude/agents/      (48 agent definitions)
    ├── .claude/skills/      (240 skill definitions)
    ├── .claude/hooks/       (25 hooks + lib/ + config/)
    ├── .claude/commands/    (slash commands: /isdlc, /discover, /provider)
    └── .claude/settings.json (hook registration, permissions)

Step 4/6: Set up .isdlc/ directory
    ├── phases/01-requirements/artifacts/
    ├── phases/02-architecture/artifacts/
    ├── ... (13 phase directories)
    ├── config/              (iteration-requirements.json, workflows.json)
    ├── checklists/          (gate checklist templates)
    ├── templates/           (document templates)
    └── providers.yaml       (generated from template, using selected mode)

Step 5/6: Set up docs/ directory
    ├── isdlc/constitution.md  (starter template — needs /discover to customize)
    ├── requirements/
    ├── architecture/
    └── design/

Step 6/6: Generate state
    └── .isdlc/state.json    (initial project state, all phases "pending")
```

### Directory Tree (After Installation)

```
your-project/
├── .claude/
│   ├── agents/
│   │   ├── 00-sdlc-orchestrator.md
│   │   ├── 01-requirements-analyst.md
│   │   ├── ...
│   │   ├── 14-upgrade-engineer.md
│   │   ├── 16-quality-loop-engineer.md
│   │   ├── discover-orchestrator.md
│   │   ├── discover/           (22 discover agents)
│   │   ├── impact-analysis/    (4 agents)
│   │   ├── quick-scan/         (1 agent)
│   │   └── tracing/            (4 agents)
│   ├── skills/
│   │   ├── orchestration/      (ORCH-001 to ORCH-012)
│   │   ├── requirements/       (REQ-001 to REQ-012)
│   │   ├── ...                 (17 skill categories)
│   │   ├── quality-loop/       (QL-001 to QL-011)
│   │   └── upgrade/            (UPG-001 to UPG-008)
│   ├── hooks/
│   │   ├── gate-blocker.cjs
│   │   ├── test-watcher.cjs
│   │   ├── constitution-validator.cjs
│   │   ├── iteration-corridor.cjs
│   │   ├── menu-tracker.cjs
│   │   ├── model-provider-router.cjs
│   │   ├── skill-validator.cjs
│   │   ├── log-skill-usage.cjs
│   │   ├── skill-delegation-enforcer.cjs
│   │   ├── delegation-gate.cjs
│   │   ├── lib/common.cjs
│   │   └── config/
│   │       ├── skills-manifest.json
│   │       ├── iteration-requirements.json
│   │       └── workflows.json
│   ├── commands/
│   │   ├── sdlc.md
│   │   ├── discover.md
│   │   └── provider.md
│   └── settings.json
├── .isdlc/
│   ├── state.json
│   ├── providers.yaml
│   ├── config/
│   ├── checklists/
│   ├── templates/
│   └── phases/
│       ├── 01-requirements/artifacts/
│       ├── 02-architecture/artifacts/
│       └── ...
└── docs/
    ├── isdlc/constitution.md
    ├── requirements/
    ├── architecture/
    └── design/
```

---

## The Orchestrator

The SDLC Orchestrator (`00-sdlc-orchestrator.md`) is the central coordination hub. It is invoked by the `/isdlc` command and manages all workflow state transitions.

### Responsibilities

1. **Root resolution** — find the `.isdlc/` directory (walks up parent directories)
2. **Monorepo detection** — resolve active project from `monorepo.json`
3. **Constitution validation** — verify `docs/isdlc/constitution.md` exists and is not a template
4. **Workflow selection** — present context-aware menus, initialize workflows
5. **Phase delegation** — launch phase agents via the Task tool with full context
6. **Gate validation** — verify phase requirements before advancement
7. **Conflict resolution** — handle inter-phase inconsistencies
8. **Discovery context injection** — conditionally include discovery results in Phases 01-03

### Interactive Menus

When `/isdlc` is invoked without arguments, the orchestrator detects project state and presents one of four scenarios:

| Scenario | Condition | Menu |
|----------|-----------|------|
| **0** | Monorepo, no active project | Project selection list |
| **1** | No constitution, new project | Recommend `/discover` |
| **2** | No constitution, existing project | Recommend `/discover` |
| **3** | Constitution valid, no active workflow | Feature / Fix / Test / Upgrade |
| **4** | Constitution valid, workflow in progress | Continue / Gate Check / Status / Escalate / Cancel |

### Workflow Types

The orchestrator loads workflow definitions from `.isdlc/config/workflows.json`:

| Workflow | Command | Phase Sequence |
|----------|---------|----------------|
| **Build** | `/isdlc build` | 05 → 06 → 16(QL) → 08 |
| **Test Run** | `/isdlc test run` | 11 → 07 |
| **Test Generate** | `/isdlc test generate` | 05 → 06 → 16(QL) → 08 |
| **Upgrade** | `/isdlc upgrade` | 15(plan) → 15(execute) → 08 |

> **Note**: Analysis phases (00-04 for features, 01-02 for bugs) are handled by `/isdlc analyze` before the build workflow starts.

### Phase Delegation

When delegating to a phase agent, the orchestrator uses Claude Code's Task tool:

```
Task tool call:
  subagent_type: "requirements-analyst"
  prompt: |
    WORKFLOW: feature
    PHASE: 01-requirements
    DESCRIPTION: "Add user authentication"
    CONSTITUTION: (full text)
    DISCOVERY CONTEXT: (if available — discovery results, DO NOT REDESIGN constraints)
    ARTIFACTS FROM PREVIOUS PHASE: (if any)
```

The orchestrator injects **DISCOVERY CONTEXT** into Phases 01-03 when discovery results exist. This includes architecture patterns, test coverage gaps, and a "DO NOT REDESIGN" constraint table that prevents agents from proposing rewrites of existing patterns.

---

## Agents (48)

### Agent Groups

| Group | Count | Location | Purpose |
|-------|-------|----------|---------|
| **SDLC** | 16 | `agents/00-*.md` to `agents/16-*.md` | Execute development phases |
| **Discover** | 23 | `agents/discover-orchestrator.md`, `agents/discover/` | Analyze projects, generate constitution, inception party |
| **Quick Scan** | 1 | `agents/quick-scan/` | Lightweight scope estimation |
| **Impact Analysis** | 4 | `agents/impact-analysis/` | Feature impact analysis |
| **Tracing** | 4 | `agents/tracing/` | Bug root cause tracing |

### 1-to-1 Agent-Phase Mapping

Each phase has exactly one agent. No overlapping responsibilities.

| Phase | Agent File | Agent Name |
|-------|-----------|------------|
| 00 | `00-sdlc-orchestrator.md` | SDLC Orchestrator |
| 01 | `01-requirements-analyst.md` | Requirements Analyst |
| 03 | `03-solution-architect.md` | Solution Architect |
| 04 | `04-system-designer.md` | System Designer |
| 05 | `05-test-design-engineer.md` | Test Design Engineer |
| 06 | `06-software-developer.md` | Software Developer |
| 07 | `07-integration-tester.md` | Integration Tester |
| 08 | `08-qa-engineer.md` | QA Engineer |
| 09 | `09-security-compliance-auditor.md` | Security & Compliance Auditor |
| 10 | `10-cicd-engineer.md` | CI/CD Engineer |
| 11 | `11-environment-builder.md` | Environment Builder |
| 12 | `12-deployment-engineer-staging.md` | Deployment Engineer (Staging) |
| 13 | `13-site-reliability-engineer.md` | Site Reliability Engineer |
| 14 | `14-release-manager.md` | Release Manager |
| 15 | `15-upgrade-engineer.md` | Upgrade Engineer |
| 16 | `16-quality-loop-engineer.md` | Quality Loop Engineer |

### Agent Definition Format

Each agent is a markdown file with YAML frontmatter:

```yaml
---
name: software-developer
description: "Use this agent when you need to implement code..."
model: opus
owned_skills:
  - DEV-001  # test-driven-development
  - DEV-002  # code-implementation
  - DEV-003  # unit-test-creation
  ...
---

(Agent instructions in markdown)
```

- `name` — matches the `subagent_type` used in Task tool calls
- `model` — LLM model preference (overridable by `model-provider-router.cjs`)
- `owned_skills` — skill IDs documented as the agent's primary capabilities (observed, not enforced)

### Discover Agents (Deep Dive)

The `/discover` command runs a 23-agent analysis pipeline:

| ID | Agent | What It Does |
|----|-------|-------------|
| D0 | Discover Orchestrator | Coordinates all discover agents |
| D1 | Architecture Analyzer | Maps system structure, patterns, dependencies |
| D2 | Test Evaluator | Assesses test coverage, frameworks, gaps |
| D3 | Constitution Generator | Creates tailored governance articles interactively |
| D4 | Skills Researcher | Identifies tech-stack-specific skills |
| D5 | Data Model Analyzer | Database schemas, ORM models, migrations |
| D6 | Feature Mapper | Maps features, behaviors, and acceptance criteria |
| D7 | Product Analyst | Vision elicitation, brainstorming, PRD generation (new projects) |
| D8 | Architecture Designer | Architecture blueprint from PRD and tech stack (new projects) |
| D9 | Solution Architect Party | Architecture debate rounds (inception party) |
| D10 | Security Advisor | Security posture evaluation (inception party) |
| D11 | DevOps Pragmatist | Operational cost evaluation (inception party) |
| D12 | Technical Scout | Technical feasibility evaluation (inception party) |
| D13 | Domain Researcher | Industry context, regulations (inception party) |
| D14 | Test Strategist | Test strategy outline (inception party) |
| D15 | Data Model Designer | Entity design, storage decisions (inception party) |
| D16 | Security Auditor | Dependency vulnerabilities, OWASP assessment |
| D17 | Technical Debt Auditor | Code duplication, complexity, anti-patterns |
| D18 | Performance Analyst | Response time patterns, caching, query optimization |
| D19 | Ops Readiness Reviewer | Logging, health checks, monitoring hooks |
| — | Characterization Test Generator | Generates tests to capture existing behavior |
| — | Artifact Integration | Maps discovery artifacts to SDLC phases |
| — | ATDD Bridge | Converts extracted behaviors to ATDD format |

For existing projects with `--existing` flag, D6 (Feature Mapper) also performs behavior extraction (8 skills including code-behavior-extraction, precondition/postcondition inference, side-effect detection). For new projects, D9-D15 form the "inception party" — multi-perspective debate rounds for architecture decisions.

---

## Skills (240)

### Architecture

Skills are **documented capabilities** — each skill has a `SKILL.md` file describing what the skill does, what inputs it needs, and what outputs it produces. Skills are organized by category:

```
.claude/skills/
├── orchestration/         ORCH-001 to ORCH-012  (12 skills)
├── discover/              DISC-001 to DISC-806  (48 skills)
├── requirements/          REQ-001 to REQ-012    (12 skills)
├── architecture/          ARCH-001 to ARCH-012  (12 skills)
├── design/                DES-001 to DES-014    (14 skills)
├── test-design/           TEST-001 to TEST-014  (14 skills)
├── development/           DEV-001 to DEV-014    (14 skills)
├── testing/               INTG-001 to INTG-008  (8 skills)
├── code-review/           CR-001 to CR-010      (10 skills)
├── security/              SEC-001 to SEC-012    (12 skills)
├── cicd/                  CICD-001 to CICD-006  (6 skills)
├── reverse-engineer/      RE-001 to RE-008      (8 skills)
├── tracing/               TRACE-*               (21 skills)
├── quick-scan/            QS-001 to QS-003      (3 skills)
├── impact-analysis/       IA-001 to IA-304      (15 skills)
├── quality-loop/          QL-001 to QL-011      (11 skills)
└── upgrade/               UPG-001 to UPG-008    (8 skills)
```

### Observability Model (v3.0)

Skills use an **observe** model, not an enforcement model:

- `skill-validator.cjs` (PreToolUse) — observes which agent is being delegated to, but **never blocks**. All modes exit 0 with no output.
- `log-skill-usage.cjs` (PostToolUse) — logs every Task tool invocation to `state.json`'s `skill_usage_log` array, recording agent name, skills used, phase, and timestamp. Cross-phase usage is logged as `observed`/`cross-phase-usage`.

This means skills serve as **event identifiers** for logging and visibility, not access-control tokens. Any agent can use any skill — the system just records what happened.

### Manifest Structure

The skills manifest (`hooks/config/skills-manifest.json`) maps agents to their documented skills:

```json
{
  "version": "5.0.0",
  "total_skills": 240,
  "enforcement_mode": "observe",
  "ownership": {
    "software-developer": {
      "agent_id": "06",
      "phase": "06-implementation",
      "skill_count": 14,
      "skills": ["DEV-001", "DEV-002", ...]
    }
  }
}
```

---

## Hooks (27)

> For a complete reference table of all 27 hooks — what they block, warn, and track — see [HOOKS.md](HOOKS.md).

### Hook Architecture

Hooks are Node.js scripts registered in `.claude/settings.json`. Claude Code invokes them as child processes at three points in the lifecycle:

- **PreToolUse** — fires before a tool call executes. Can block the call by outputting a JSON response.
- **PostToolUse** — fires after a tool call completes. Used for logging and state updates.
- **Stop** — fires when the agent stops. Used for final validation.

```
User action ──► Claude Code ──► PreToolUse hooks ──► Tool executes ──► PostToolUse hooks
                                     │                                        │
                                 Can BLOCK                              Can LOG/UPDATE
                                 (output JSON)                          (update state.json)
                                                                              │
                                                                     Agent stops ──► Stop hooks
```

**Fail-open design**: If any hook crashes, times out (10s default), or throws an error, it exits 0 with no output — allowing the tool call to proceed. This prevents framework bugs from blocking all user work.

### Hook Registration

From `.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Task",
        "hooks": [
          "node .claude/hooks/model-provider-router.cjs",
          "node .claude/hooks/iteration-corridor.cjs",
          "node .claude/hooks/skill-validator.cjs",
          "node .claude/hooks/gate-blocker.cjs",
          "node .claude/hooks/constitution-validator.cjs"
        ]
      },
      {
        "matcher": "Skill",
        "hooks": [
          "node .claude/hooks/iteration-corridor.cjs",
          "node .claude/hooks/gate-blocker.cjs"
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Task",
        "hooks": [
          "node .claude/hooks/log-skill-usage.cjs",
          "node .claude/hooks/menu-tracker.cjs"
        ]
      },
      {
        "matcher": "Skill",
        "hooks": [
          "node .claude/hooks/skill-delegation-enforcer.cjs"
        ]
      },
      {
        "matcher": "Bash",
        "hooks": [
          "node .claude/hooks/test-watcher.cjs"
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          "node .claude/hooks/delegation-gate.cjs"
        ]
      }
    ]
  }
}
```

### Hook Deep Dives

#### `gate-blocker.cjs` (PreToolUse → Task, Skill)

Blocks gate advancement unless all iteration requirements are met. Performs 4 checks:

1. **Iteration requirements** — reads `iteration-requirements.json` for the current phase and verifies that all enabled requirements (interactive elicitation, test iteration, constitutional validation) have been satisfied
2. **Workflow validation** — ensures the requested phase advancement is valid for the active workflow type
3. **Phase sequencing** — prevents skipping phases (must advance sequentially through the workflow's phase list)
4. **Agent delegation validation** — verifies that the correct phase agent was delegated to (introduced in v2.0.0, fail-open if manifest missing)

#### `test-watcher.cjs` (PostToolUse → Bash)

Monitors Bash tool executions for test commands and tracks iteration state:

- Detects test commands (npm test, pytest, go test, cargo test, etc.)
- Parses results for pass/fail status
- Updates iteration counter in `state.json` (per-phase: `phases.{phase}.iteration_tracking.current`)
- **Circuit breaker**: After 3 identical failures, blocks further iterations and recommends human review
- Tracks coverage percentage when available
- Maximum 10 iterations per phase (configurable)
- Detects orphan `skip`/`only` patterns in test files

#### `constitution-validator.cjs` (PreToolUse → Task)

Intercepts phase completion declarations and validates constitutional compliance:

- Triggers on patterns like "phase complete", "ready for gate", "finalize artifacts"
- Checks which constitutional articles are required for the current phase (from `iteration-requirements.json`)
- Blocks advancement if constitutional validation hasn't been performed
- Maximum 5 validation iterations per phase

#### `iteration-corridor.cjs` (PreToolUse → Task, Skill)

Enforces iteration corridors — restricted action spaces during active iteration:

| Corridor | Condition | Allowed Actions | Blocked Actions |
|----------|-----------|-----------------|-----------------|
| `TEST_CORRIDOR` | Tests failing | Edit code, run tests, read files | Delegate to other agents, advance gate |
| `CONST_CORRIDOR` | Tests pass, constitution pending | Validate constitution, read constitution | Delegate to other agents, advance gate |
| `NO_CORRIDOR` | No active iteration | All actions | None |

This prevents agents from "escaping" iteration loops by delegating to other agents or advancing to the next phase while issues remain unresolved.

#### `menu-tracker.cjs` (PostToolUse → Task)

Tracks A/R/C menu interactions during Phase 01 requirements elicitation:

- Detects menu presentations ([A] Adjust, [R] Refine, [C] Continue patterns)
- Counts user interactions
- Requires minimum 3 menu interactions before gate can pass
- Records final selection (save/continue)

#### `model-provider-router.cjs` (PreToolUse → Task)

Routes Task tool calls to the appropriate LLM provider based on phase complexity:

- Reads `.isdlc/providers.yaml` for provider configuration
- Applies routing rules: CLI override → agent override → phase routing → mode default → global default
- Performs health checks on selected provider
- Falls back through configured fallback chain if primary is unhealthy
- Injects environment variables (ANTHROPIC_BASE_URL, ANTHROPIC_API_KEY) for the selected provider
- Tracks usage in `.isdlc/usage-log.jsonl`

#### `skill-validator.cjs` (PreToolUse → Task)

Observes agent delegation patterns:

- Reads the target `subagent_type` from the Task tool call
- Looks up the agent in the skills manifest
- **Never blocks** — always exits 0 with no output (observe-only mode since v3.0.0)

#### `log-skill-usage.cjs` (PostToolUse → Task)

Logs all Task tool invocations to state:

- Records agent name, phase, timestamp, skills used
- Tags cross-phase usage as `observed`/`cross-phase-usage`
- Appends to `skill_usage_log` array in `state.json`

---

## Quality Gates (17)

### Gate Validation Process

Each phase has a quality gate that must pass before advancement:

```
Phase Agent completes work
         │
         ▼
Agent declares "phase complete"
         │
         ▼
constitution-validator.cjs checks constitutional compliance
         │ (blocks if not validated)
         ▼
gate-blocker.cjs checks 4 requirements
         │ (blocks if not met)
         ▼
Orchestrator reviews gate checklist
         │
         ▼
GATE PASS ──► Advance to next phase
    or
GATE FAIL ──► Remediation required (back to phase agent)
    or
GATE FAIL x2 ──► Escalate to human
```

### Phase Requirements

Each phase can enable or disable these requirement types in `iteration-requirements.json`:

| Requirement | What It Checks | Enforced By |
|-------------|---------------|-------------|
| `interactive_elicitation` | Min menu interactions (Phase 01) | `menu-tracker.cjs` |
| `test_iteration` | Tests passing, coverage ≥ threshold | `test-watcher.cjs` |
| `constitutional_validation` | Artifacts comply with constitution articles | `constitution-validator.cjs` |
| `agent_delegation_validation` | Correct agent was delegated to | `gate-blocker.cjs` |
| `atdd_validation` | ATDD checklist, priority enforcement | `gate-blocker.cjs` |

### Requirements by Phase

| Phase | Elicitation | Test Iteration | Constitution | Agent Delegation |
|-------|-------------|----------------|--------------|-----------------|
| 00-quick-scan | — | — | — | — |
| 01-requirements | min 3 interactions | — | Articles I, IV, VII, IX, XII | Yes |
| 02-impact-analysis | — | — | Articles IV, VII, IX | Yes |
| 02-tracing | — | — | Articles IV, VII, IX | Yes |
| 03-architecture | — | — | Articles III, IV, V, VII, IX, X | Yes |
| 04-design | — | — | Articles I, IV, V, VII, IX | Yes |
| 05-test-strategy | — | — | Articles II, VII, IX, XI | Yes |
| 06-implementation | — | 10 iter, 80% cov, CB=3 | Articles I-III, V-X | Yes |
| 07-testing | — | 10 iter, 70% cov, CB=3 | Articles II, VII, IX, XI | Yes |
| 08-code-review | — | — | Articles V-IX | Yes |
| 09-validation | — | — | Articles III, IX, X, XII | Yes |
| 10-cicd | — | 5 iter, CB=3 | Articles II, IX | Yes |
| 11-local-testing | — | — | Articles VIII, IX | Yes |
| 12-staging | — | — | Articles IX, X, XII | Yes |
| 13-production | — | — | Articles IX, XII | Yes |
| 14-operations | — | — | Articles VIII, IX, XII | Yes |
| 16-quality-loop | — | 10 iter, 80% cov, CB=3 | Articles II, VII, IX, XI | Yes |

*CB = circuit breaker threshold, cov = minimum coverage*

### Blocking Rules

- Gates **cannot be skipped** — the orchestrator must validate each gate in sequence
- Gate failures require **remediation** — the phase agent must fix the issue
- **Two consecutive gate failures** trigger human escalation
- The circuit breaker (3 identical test failures) triggers automatic stop

---

## Constitution Enforcement Pipeline

The project constitution (`docs/isdlc/constitution.md`) is enforced through 4 layers that work together to ensure every phase agent reads, validates, and attests to constitutional compliance.

### Layer 1: Session Cache Injection

At session start, `bin/rebuild-cache.js` reads the constitution and embeds its full text into the session cache as a `<!-- SECTION: CONSTITUTION -->` block. This block is loaded into the system prompt for every conversation, so every agent — the orchestrator, phase agents, and sub-agents — sees the complete constitution text. No agent needs to read the file from disk; it's always in context.

**File**: `bin/rebuild-cache.js`
**Output**: Session cache with `CONSTITUTION` section
**Visibility**: All agents, all conversations

### Layer 2: Gate Requirements Injection (per-phase)

When the Phase-Loop Controller delegates to a phase agent (STEP 3d), the gate-requirements-injector reads `iteration-requirements.json` to determine which constitution articles apply to that phase. It extracts the article titles from the constitution text and includes them in the delegation prompt as a CRITICAL CONSTRAINTS block.

For example, Phase 06 (Implementation) receives:
```
CRITICAL CONSTRAINTS:
- Constitutional articles to validate: Article I (Specification Primacy),
  Article II (Test-First Development), Article III (Security by Design), ...
```

The agent is told which articles to check and is instructed to confirm compliance before completing.

**File**: Phase-Loop Controller in `src/claude/commands/isdlc.md` (STEP 3d, GATE REQUIREMENTS INJECTION)
**Config**: `src/claude/hooks/config/iteration-requirements.json` → `phase_requirements[phase_key].constitutional_validation.articles[]`
**Scope**: Per-phase, per-delegation

### Layer 3: Constitutional Validation Hook

`constitution-validator.cjs` is a PostToolUse hook that fires when a phase agent signals completion (via the Task tool). It reads `state.json → phases[phase_key].constitutional_validation` and blocks phase advancement if the agent hasn't recorded a valid validation:

| Field | Required Value |
|-------|---------------|
| `completed` | `true` |
| `iterations_used` | >= 1 |
| `status` | `"compliant"` or `"escalated"` |
| `articles_checked` | Non-empty array |

If any check fails, the hook returns a block message. The Phase-Loop Controller's 3f-constitutional handler re-delegates the agent with explicit instructions to read the constitution, validate artifacts, and update the validation state.

**File**: `src/claude/hooks/constitution-validator.cjs`
**Trigger**: PostToolUse on Task tool (phase completion)
**State path**: `state.json → phases[phase_key].constitutional_validation`

### Layer 4: Gate Blocker

`gate-blocker.cjs` (and its Antigravity equivalent `validate-gate.cjs`) runs `checkConstitutionalRequirement()` as one of 4 gate checks before allowing phase advancement. This is the hard enforcement — even if the constitution-validator hook is bypassed, the gate blocker independently verifies the constitutional validation state.

**File**: `src/claude/hooks/gate-blocker.cjs`, `src/antigravity/validate-gate.cjs`
**Function**: `checkConstitutionalRequirement(phaseState, phaseReq)`
**Effect**: GATE BLOCKED if validation incomplete

### What This Does and Does Not Enforce

**Does enforce**:
- Every phase agent is shown the relevant articles before starting work
- Every phase agent must attest to having checked compliance
- Phase advancement is blocked without attestation
- Re-delegation with remediation instructions on failure
- Escalation to human after repeated failures (max 3 retries)

**Does not enforce**:
- Programmatic verification that code actually complies with article requirements (e.g., it cannot verify that Article III's "all inputs validated at system boundaries" is true in the code)
- The constitution is prompt-level governance — agents self-report compliance, and the framework ensures they do so at every gate

### Enforcement Flow

```
Phase Agent starts work
        │
        ├── Sees constitution in session cache (Layer 1)
        ├── Sees required articles in CRITICAL CONSTRAINTS (Layer 2)
        │
        ▼
Agent completes work, writes validation to state.json:
  { status: "compliant", completed: true, articles_checked: [...], iterations_used: 1 }
        │
        ▼
constitution-validator.cjs checks validation state (Layer 3)
        │
        ├── PASS → gate-blocker.cjs checks all 4 requirements (Layer 4)
        │              │
        │              ├── PASS → Phase advances
        │              └── FAIL → Remediation or escalation
        │
        └── FAIL → Phase-Loop Controller re-delegates agent
                   with remediation instructions (max 3 retries)
```

---

## State Management

### `state.json` Schema

The primary state file at `.isdlc/state.json`:

```json
{
  "framework_version": "0.1.0-alpha",
  "project": {
    "name": "my-project",
    "created": "2026-02-07T10:00:00Z",
    "description": "",
    "is_new_project": false
  },
  "constitution": {
    "enforced": true,
    "path": "docs/isdlc/constitution.md",
    "validated_at": "2026-02-07T10:05:00Z"
  },
  "autonomous_iteration": {
    "enabled": true,
    "max_iterations": 10,
    "timeout_per_iteration_minutes": 5,
    "circuit_breaker_threshold": 3
  },
  "skill_enforcement": {
    "enabled": true,
    "mode": "observe",
    "fail_behavior": "allow"
  },
  "active_workflow": {
    "type": "feature",
    "description": "Add user authentication",
    "started_at": "2026-02-07T10:10:00Z",
    "phases": ["01-requirements", "02-impact-analysis", "03-architecture", ...],
    "current_phase": "06-implementation",
    "completed_phases": ["01-requirements", "02-impact-analysis", "03-architecture", ...]
  },
  "counters": {
    "next_req_id": 2,
    "next_bug_id": 1
  },
  "current_phase": "06-implementation",
  "phases": {
    "06-implementation": {
      "status": "in_progress",
      "started": "2026-02-07T12:00:00Z",
      "completed": null,
      "gate_passed": null,
      "artifacts": ["source-code/auth.ts", "unit-tests/auth.test.ts"],
      "iteration_tracking": {
        "current": 3,
        "max": 10,
        "history": [
          {"iteration": 1, "result": "fail", "tests_passed": 5, "tests_failed": 3},
          {"iteration": 2, "result": "fail", "tests_passed": 7, "tests_failed": 1},
          {"iteration": 3, "result": "pass", "tests_passed": 8, "tests_failed": 0}
        ],
        "final_status": null
      }
    }
  },
  "skill_usage_log": [
    {
      "timestamp": "2026-02-07T10:10:00Z",
      "agent": "requirements-analyst",
      "skill_ids": ["REQ-001", "REQ-002"],
      "phase": "01-requirements",
      "status": "observed"
    }
  ],
  "active_agent": "software-developer",
  "history": [...]
}
```

### Key State Fields

| Field | Purpose | Updated By |
|-------|---------|------------|
| `current_phase` | Active phase identifier | Orchestrator |
| `active_workflow` | Workflow type and progress | Orchestrator |
| `phases.{phase}.iteration_tracking` | Test iteration count and results | `test-watcher.cjs` |
| `phases.{phase}.status` | Phase status (pending/in_progress/completed) | Orchestrator |
| `skill_usage_log` | Append-only log of all agent delegations | `log-skill-usage.cjs` |
| `active_agent` | Currently delegated agent | Orchestrator |
| `constitution.validated_at` | Last constitution validation timestamp | `constitution-validator.cjs` |

### Monorepo State

In monorepo mode, each project has its own state file:

```
.isdlc/
├── state.json              (root-level state)
├── monorepo.json           (project registry)
└── projects/
    ├── api-service/
    │   └── state.json      (per-project state)
    └── web-frontend/
        └── state.json      (per-project state)
```

---

## Configuration

### `iteration-requirements.json`

Defines what each phase requires before its gate can pass:

```json
{
  "version": "2.0.0",
  "phase_requirements": {
    "06-implementation": {
      "test_iteration": {
        "enabled": true,
        "max_iterations": 10,
        "circuit_breaker_threshold": 3,
        "success_criteria": {
          "all_tests_passing": true,
          "min_coverage_percent": 80
        }
      },
      "constitutional_validation": {
        "enabled": true,
        "max_iterations": 5,
        "articles": ["I", "II", "III", "V", "VI", "VII", "VIII", "IX", "X"]
      },
      "agent_delegation_validation": {
        "enabled": true
      }
    }
  }
}
```

### `skills-manifest.json`

Maps agents to their documented skills and defines cross-agent delegation rules:

```json
{
  "version": "5.0.0",
  "total_skills": 240,
  "enforcement_mode": "observe",
  "ownership": {
    "agent-name": {
      "agent_id": "06",
      "phase": "06-implementation",
      "skill_count": 14,
      "skills": ["DEV-001", "DEV-002", ...]
    }
  },
  "cross_agent_delegation": {
    "upgrade-engineer": {
      "can_delegate_to": ["impact-analysis-orchestrator"]
    }
  }
}
```

### `workflows.json`

Defines the phase sequence for each workflow type:

```json
{
  "workflows": {
    "feature": {
      "phases": ["00-quick-scan", "01-requirements", "02-impact-analysis", "03-architecture", "04-design", "05-test-strategy", "06-implementation", "16-quality-loop", "08-code-review"],
      "skip_exploration": false
    },
    "fix": {
      "phases": ["01-requirements", "02-tracing", "05-test-strategy", "06-implementation", "16-quality-loop", "08-code-review"]
    }
  }
}
```

### `providers.yaml`

Configures LLM providers and phase-aware routing:

```yaml
active_mode: "hybrid"

providers:
  anthropic:
    enabled: true
    base_url: "https://api.anthropic.com"
    api_key_env: "ANTHROPIC_API_KEY"
  ollama:
    enabled: true
    base_url: "http://localhost:11434"

phase_routing:
  "01-requirements":
    provider: "anthropic"
    model: "sonnet"
    rationale: "Stakeholder elicitation requires nuanced reasoning"
  "06-testing":
    provider: "ollama"
    model: "qwen-coder"
    rationale: "Test execution is mechanical"

modes:
  free:
    default_provider: "groq"
  local:
    default_provider: "ollama"
    allow_cloud: false
  quality:
    default_provider: "anthropic"
    default_model: "opus"
  hybrid:
    use_phase_routing: true
```

---

## End-to-End Flow Example

**Scenario**: A user runs `/analyze "Add user authentication"` followed by `/build "add-user-authentication"` on an existing Node.js project that has already been through `/discover`.

### Phase 00: Quick Scan

```
Orchestrator reads state.json → no active workflow
Orchestrator loads workflows.json → feature workflow starts with 00-quick-scan
Orchestrator delegates to quick-scan-agent (haiku model)
  └── PreToolUse: model-provider-router.cjs routes to haiku
  └── PreToolUse: iteration-corridor.cjs → NO_CORRIDOR, allows
  └── PreToolUse: gate-blocker.cjs → not a gate advancement, allows
Quick Scan Agent:
  - Extracts keywords: "authentication", "user", "login", "session"
  - Counts matching files: 0 (new feature)
  - Estimates scope: MEDIUM
  - Writes: docs/requirements/REQ-0001/quick-scan.md
Gate 00: Pass (quick scan has no iteration requirements)
```

### Phase 01: Requirements

```
Orchestrator delegates to requirements-analyst
  └── PreToolUse hooks fire (same pattern)
Requirements Analyst:
  - Reads constitution → Articles I, IV, VII, IX, XII apply
  - Reads DISCOVERY CONTEXT (injected by orchestrator):
    - Existing auth patterns: none found
    - Stack: Node.js, Express, PostgreSQL
    - Convention: JWT tokens used in similar projects
  - Presents A/R/C menu to user:
    [A] Adjust scope  [R] Refine details  [C] Continue
  - menu-tracker.cjs counts interactions: 1... 2... 3 ✓
  - Writes: requirements-spec.md, user-stories.json
  - Declares "phase complete"
    └── constitution-validator.cjs checks Articles I, IV, VII, IX, XII → Pass
    └── gate-blocker.cjs checks:
        [1] Interactive elicitation: 3/3 ✓
        [2] Workflow: feature → 01-requirements valid ✓
        [3] Phase sequence: first phase ✓
        [4] Agent delegation: requirements-analyst matches ✓
Gate 01: Pass → Advance to Phase 02
```

### Phase 02: Impact Analysis

```
Orchestrator delegates to impact-analysis-orchestrator
Impact Analysis Orchestrator launches 3 sub-agents in parallel:
  - IA1 (Impact Analyzer): identifies affected files per acceptance criterion
  - IA2 (Entry Point Finder): maps API endpoints and UI components
  - IA3 (Risk Assessor): scores risk per AC, identifies coverage gaps
Consolidates: impact-analysis.md
Gate 02: Pass
```

### Phase 03-05: Architecture → Design → Test Strategy

```
Solution Architect:
  - Reads DISCOVERY CONTEXT with "DO NOT REDESIGN" constraints
  - Extends existing Express patterns (doesn't propose Koa/Fastify)
  - Writes: architecture-overview.md, tech-stack-decision.md

System Designer:
  - Reads architecture-overview.md as input
  - Designs auth module API contract
  - Writes: openapi.yaml for /auth/* endpoints, module-designs/

Test Design Engineer:
  - Reads requirements-spec.md + architecture-overview.md
  - Creates test strategy with ac-traceability.csv
  - Maps each AC to specific test cases
```

### Phase 06: Implementation

```
Orchestrator delegates to software-developer
Software Developer:
  - Reads all prior artifacts
  - Implements auth module (TDD — tests first, then code)
  - Runs tests: npm test

  Iteration 1:
    └── test-watcher.cjs detects: 5 pass, 3 fail → iteration_tracking.current = 1
    └── iteration-corridor.cjs → TEST_CORRIDOR active
    └── Agent cannot delegate or advance — must fix code

  Iteration 2:
    └── test-watcher.cjs: 7 pass, 1 fail → current = 2
    └── Still in TEST_CORRIDOR

  Iteration 3:
    └── test-watcher.cjs: 8 pass, 0 fail, 82% coverage → current = 3
    └── TEST_CORRIDOR cleared
    └── iteration-corridor.cjs → CONST_CORRIDOR active

  Constitution validation:
    └── constitution-validator.cjs checks Articles I, II, III, V, VI, VII, VIII, IX, X → Pass
    └── CONST_CORRIDOR cleared

  Agent declares "phase complete"
    └── gate-blocker.cjs: all 4 checks pass ✓

Gate 06: Pass → Advance to Phase 16
```

### Phase 16: Quality Loop

```
Orchestrator delegates to quality-loop-engineer
Quality Loop Engineer runs parallel tracks:
  Track A (Testing): local test execution, coverage analysis, mutation testing
  Track B (QA): lint check, type check, build verification, security scan, dependency audit
  - Both tracks must pass before GATE-16
  - If either fails: iterate (fix issues, re-run)
  - Up to 10 iterations before escalation
Gate 16: Pass → Advance to Phase 08
```

### Phase 08: Code Review & QA

```
QA Engineer: reviews code quality, generates metrics, human review pause
Gate 08: Pass
```

### Workflow Complete

```
Orchestrator updates state.json:
  active_workflow.status = "completed"
  Moves workflow to workflow_history[]
  Clears active_agent

Output to user:
  "Feature 'Add user authentication' completed.
   All 9 phases passed. 3 test iterations in implementation phase.
   Artifacts in docs/requirements/REQ-0001/"
```

---

## Further Reading

- [AGENTS.md](AGENTS.md) — detailed agent responsibilities and artifacts
- [DETAILED-SKILL-ALLOCATION.md](DETAILED-SKILL-ALLOCATION.md) — all 240 skills by category
- [CONSTITUTION-GUIDE.md](CONSTITUTION-GUIDE.md) — governance principles
- [MONOREPO-GUIDE.md](MONOREPO-GUIDE.md) — multi-project setup
- [AUTONOMOUS-ITERATION.md](AUTONOMOUS-ITERATION.md) — self-correcting behavior
- [SKILL-ENFORCEMENT.md](SKILL-ENFORCEMENT.md) — skill observability model
- [MULTI-PROVIDER-SUPPORT-DESIGN.md](designs/MULTI-PROVIDER-SUPPORT-DESIGN.md) — LLM provider configuration
