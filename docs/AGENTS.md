# iSDLC Agents

This document provides detailed information about all 56 agents in the iSDLC framework.

## Overview

The framework's 56 agents are organized into five groups:

| Group | Count | Purpose |
|-------|-------|---------|
| [SDLC Agents](#sdlc-agents) | 22 | Execute development phases (1 orchestrator + 15 phase agents + 6 debate agents) |
| [Discover Agents](#discover-agents) | 23 | Analyze projects before development begins (with inception party for new projects) |
| [Quick Scan Agent](#quick-scan-agent-phase-00) | 1 | Lightweight scope estimation before requirements |
| [Impact Analysis Agents](#impact-analysis-agents-phase-02) | 4 | Full feature impact analysis after requirements |
| [Tracing Agents](#tracing-agents-phase-02) | 4 | Trace bug root causes after requirements |

---

## SDLC Agents

The 18 SDLC agents implement a 1-to-1 mapping between phases and agents (plus 2 debate-mode agents for Phase 01). Each agent owns exactly one phase from requirements through operations and upgrades.

| Phase | Agent | Responsibility | Key Artifacts |
|-------|-------|----------------|---------------|
| **00** | **SDLC Orchestrator** | Workflow coordination, phase gates, conflict resolution | workflow-state.json, gate-validation.json |
| **01** | **Requirements Analyst** | Requirements capture, user stories, NFRs | requirements-spec.md, user-stories.json, nfr-matrix.md |
| **01** | **Requirements Critic** (`01-requirements-critic`, debate mode) | Reviews requirements artifacts, produces BLOCKING/WARNING critique | round-N-critique.md |
| **01** | **Requirements Refiner** (`01-requirements-refiner`, debate mode) | Addresses critique findings, enforces Given/When/Then and quantified NFRs | Updated requirements artifacts, change log |
| **03** | **Solution Architect** (Creator in debate mode) | System architecture, tech stack, database design | architecture-overview.md, tech-stack-decision.md, ADRs |
| **03** | **Architecture Critic** (`02-architecture-critic`, debate mode) | Reviews architecture artifacts for NFR misalignment, STRIDE gaps, SPOF, cost issues | round-N-critique.md |
| **03** | **Architecture Refiner** (`02-architecture-refiner`, debate mode) | Addresses architecture critique findings, enforces STRIDE coverage and HA design | Updated architecture artifacts, change log |
| **04** | **System Designer** (Creator in debate mode) | API contracts, module design, UI/UX wireframes | openapi.yaml, module-designs/, wireframes/ |
| **04** | **Design Critic** (`03-design-critic`, debate mode) | Reviews design artifacts for incomplete API specs, inconsistent patterns, validation gaps, error taxonomy holes | round-N-critique.md |
| **04** | **Design Refiner** (`03-design-refiner`, debate mode) | Addresses design critique findings, enforces complete API contracts, unified patterns, comprehensive validation | Updated design artifacts, change log |
| **05** | **Test Design Engineer** | Test strategy, test cases, traceability | test-strategy.md, test-cases/, traceability-matrix.csv |
| **06** | **Software Developer** | Implementation (TDD), unit tests, coding standards | source-code/, unit-tests/, coverage-report.html |
| **06R** | **Implementation Reviewer** | Per-file code review (8 IC categories), structured PASS/REVISE verdicts | Per-File Review report |
| **06U** | **Implementation Updater** | Targeted fixes for Reviewer findings, test re-run, update reports | Update Report |
| **07** | **Integration Tester** | Integration testing, E2E testing, API contract tests | integration-tests/, e2e-tests/, test-execution-report.md |
| **08** | **QA Engineer** | Code review, quality metrics, QA sign-off | code-review-report.md, quality-metrics.md, qa-sign-off.md |
| **09** | **Security & Compliance Auditor** | Security scanning, penetration testing, compliance | security-scan-report.md, compliance-checklist.md |
| **10** | **CI/CD Engineer** | Pipeline automation, build configuration | ci-config.yaml, cd-config.yaml, Dockerfile |
| **11** | **Environment Builder** | Local environment build & launch for testing | testing_environment in state.json, build-log.md |
| **12** | **Deployment Engineer (Staging)** | Staging deployment, smoke tests, rollback | deployment-log-staging.md, smoke-test-results.md |
| **13** | **Release Manager** | Production deployment, release coordination | release-notes.md, post-deployment-report.md |
| **14** | **Site Reliability Engineer** | Operations, monitoring, incident response, SLAs | monitoring-config/, alert-rules.yaml, sla-tracking.md |
| **15** | **Upgrade Engineer** | Dependency/tool upgrades with regression testing | upgrade-analysis.md, upgrade-summary.md |
| **16** | **Quality Loop Engineer** | Parallel testing + automated QA (feature/fix workflows) | quality-report.md, coverage-report.md, security-scan.md |

**1-to-1 Mapping**: Each phase has exactly ONE dedicated agent with clear entry/exit criteria. No overlapping responsibilities — conflicts only occur at phase boundaries and are handled by the Orchestrator.

---

## Exploration Agents

Exploration agents help understand the scope and impact of changes through specialized analysis.

### Roundtable Analysis Protocol

Feature analysis behavior is defined by `src/claude/agents/roundtable-analyst.md`. Bug analysis behavior is defined by `src/claude/agents/bug-roundtable-analyst.md`.

Both protocols share a behavior-first 12-section + 3-appendix architecture:

| Section | Content |
|---------|---------|
| **Section 1-2** | Purpose, non-negotiable anti-shortcut hard rules, behavior contract (stop/wait, no-write-before-confirmation) |
| **Section 3-4** | Single-agent operating model, plugin-based persona extensibility (core vs contributing personas with promotion path) |
| **Section 5-6** | Three rendering modes (bulleted / conversational / silent), conversation rendering rules |
| **Section 7-8** | State machine with state-local template bindings, domain confirmation contracts |
| **Section 9-10** | Ask-vs-infer policy, scope/tier rules |
| **Section 11-12** | Early exit exception, finalization batch-write rules |
| **Appendices A-C** | Agent Teams (dormant), runtime adapter notes, meta/search internal data |

**Feature roundtable** (`roundtable-analyst.md`):
- Inline conversational roundtable in a single assistant thread
- Maya, Alex, and Jordan are simulated analytical perspectives inside one conversation
- Confirmation states: REQUIREMENTS -> ARCHITECTURE -> DESIGN -> TASKS
- One high-value clarification question per turn; non-blocking gaps are inferred and surfaced in Assumptions and Inferences
- Confirmations are presented sequentially per domain with state-local template bindings
- Plugin-based persona extensibility: contributing personas fold into core states; promoted personas own new states and templates via named extension points

**Bug roundtable** (`bug-roundtable-analyst.md`):
- Same 12-section architecture adapted for bug-specific analysis
- Bug-specific confirmation states: BUG_SUMMARY -> ROOT_CAUSE -> FIX_STRATEGY -> TASKS
- Delegates to tracing orchestrator (T1/T2/T3) during ROOT_CAUSE analysis
- bug-report.md is written mid-conversation (required as tracing input); all other artifacts batch-write at finalization
- Same rendering modes, persona model, and anti-shortcut enforcement as the feature roundtable

### Quick Scan Agent (Phase 00 - Feature Workflow)

For new features, the Quick Scan Agent performs a **lightweight** scope estimation BEFORE requirements gathering. This provides just enough context for the Requirements Analyst without over-investing in analysis that may change after requirements clarification.

| ID | Agent | Responsibility |
|----|-------|----------------|
| **QS** | **Quick Scan Agent** | Keyword extraction, file count estimation, scope estimation (small/medium/large) |

**Invoked by**: `/isdlc analyze "description"` (automatic during feature analysis, or skip with `--no-scan`)

**Output**: `quick-scan.md` (lightweight scope estimate, keyword matches, file count)

**Note**: Quick Scan uses the haiku model for fast, lightweight analysis.

### Impact Analysis Agents (Phase 02 - Feature Workflow)

For new features, **after Phase 01 captures and clarifies the requirements**, the Impact Analysis Orchestrator (IA0) coordinates three parallel sub-agents to produce a comprehensive `impact-analysis.md`:

| ID | Agent | Responsibility |
|----|-------|----------------|
| **IA0** | **Impact Analysis Orchestrator** | Coordinates analysis, consolidates impact report |
| **IA1** | **Impact Analyzer** | Affected files per AC, module dependencies, change propagation |
| **IA2** | **Entry Point Finder** | API endpoints per AC, UI components, implementation order |
| **IA3** | **Risk Assessor** | Risk per AC, coverage gaps, technical debt, blocking risks |

**Workflow Position**: Phase 02 (after Requirements)

**Invoked by**: `/isdlc analyze "description"` (automatic during feature analysis, after Phase 01)

**Input**: Requirements document from Phase 01, Quick Scan from Phase 00

**Output**: `impact-analysis.md` (comprehensive, based on finalized requirements)

**Key Design Decision**: Impact Analysis runs AFTER requirements gathering. This ensures analysis is based on clarified, finalized requirements rather than initial descriptions.

### Tracing Agents (Phase 02 - Bug Fix Workflow)

For bug fixes, **after Phase 01 captures the bug report**, the Tracing Orchestrator (T0) coordinates three parallel sub-agents to produce `trace-analysis.md`:

| ID | Agent | Responsibility |
|----|-------|----------------|
| **T0** | **Tracing Orchestrator** | Coordinates tracing, consolidates diagnosis |
| **T1** | **Symptom Analyzer** | Error parsing, stack traces, reproduction steps, patterns |
| **T2** | **Execution Path Tracer** | Call chain, data flow, state mutations, branch points |
| **T3** | **Root Cause Identifier** | Hypotheses, evidence correlation, fix recommendations |

**Workflow Position**: Phase 02 (after Requirements, before Test Strategy)

**Invoked by**: `/isdlc analyze "description"` (automatic during bug analysis, or skip with `--no-tracing`)

**Input**: Bug report from Phase 01 (`bug-report.md`, `requirements-spec.md`)

**Output**: `trace-analysis.md`, `diagnosis.json` (in bug artifact folder)

---

## Discover Agents

The `/discover` command uses 23 specialized sub-agents to analyze projects before SDLC workflows begin. For existing projects, the `--deep` flag controls discovery depth: **standard** (6 core agents + 3 debate rounds) or **full** (8 agents + 5 debate rounds + cross-review).

**For existing projects**: D1, D2, D5, D6 run in parallel (Phase 1) with D16-D17 (standard depth) or D16-D19 (full depth) for deeper analysis. Sequential phases then extract behavior, generate characterization tests, and build traceability (Phases 1b-1d).

**For new projects**: D7 guides vision elicitation and D8 designs the architecture blueprint via deep discovery with inception party debate rounds (D9-D15).

| ID | Agent | Responsibility |
|----|-------|----------------|
| **D0** | **Discover Orchestrator** | Coordinates discovery, assembles report |
| **D1** | **Architecture Analyzer** | Tech stack, dependencies, deployment topology, integrations |
| **D2** | **Test Evaluator** | Test coverage by type, critical untested paths, test quality |
| **D3** | **Constitution Generator** | Generates project constitution from analysis |
| **D4** | **Skills Researcher** | Researches best practices for detected tech stack |
| **D5** | **Data Model Analyzer** | Database schemas, ORM models, migrations, relationships |
| **D6** | **Feature Mapper** | API endpoints, UI pages, CLI commands, business domains, **behavior extraction & AC generation** |
| **D7** | **Product Analyst** | Vision elicitation, brainstorming, PRD generation (new projects) |
| **D8** | **Architecture Designer** | Architecture blueprint from PRD and tech stack (new projects) |
| **D9** | **Solution Architect Party** | Architecture debate rounds, pattern evaluation (inception party) |
| **D10** | **Security Advisor** | Security posture evaluation, threat identification (inception party) |
| **D11** | **DevOps Pragmatist** | Operational cost, deployment complexity evaluation (inception party) |
| **D12** | **Technical Scout** | Technical feasibility, ecosystem evaluation (inception party) |
| **D13** | **Domain Researcher** | Industry context, regulations, compliance research (inception party) |
| **D14** | **Test Strategist** | Test strategy outline, coverage targets (inception party) |
| **D15** | **Data Model Designer** | Entity design, relationships, storage decisions (inception party) |
| **D16** | **Security Auditor** | Dependency vulnerabilities, secret detection, OWASP assessment (existing, standard+full) |
| **D17** | **Technical Debt Auditor** | Code duplication, complexity, deprecated APIs, anti-patterns (existing, standard+full) |
| **D18** | **Performance Analyst** | Response time patterns, caching, query optimization, bundle sizes (existing, full only) |
| **D19** | **Ops Readiness Reviewer** | Logging, health checks, graceful shutdown, monitoring hooks (existing, full only) |
| — | **Characterization Test Generator** | Generate tests that capture current behavior as executable specifications |
| — | **Artifact Integration** | Link extracted AC to feature maps, generate traceability matrices |
| — | **ATDD Bridge** | Prepare extracted AC for ATDD workflow integration with priority tagging |

**Invoked by**: `/discover`

**Output**: `docs/project-discovery-report.md`, `docs/isdlc/constitution.md`, `docs/requirements/reverse-engineered/`, `tests/characterization/`, `docs/isdlc/ac-traceability.csv`

**Note**: D6 includes behavior extraction (formerly the Behavior Analyzer agent). ATDD Bridge integration runs by default — disable via `atdd.enabled: false` in `.isdlc/config.json` (REQ-GH-216). Use `--deep full` for maximum analysis depth (adds D18/D19 and extra debate rounds). Use `--new` for inception party mode (D9-D15 debate rounds).

---

## Reserved Verb Routing (REQ-0139)

Add, Analyze, and Build are **reserved workflow verbs**. When detected in imperative context, they MUST route to their mapped command before any other work. Do not perform freeform analysis, implementation, or backlog management without first resolving the workflow verb.

| Verb | Signal Phrases | Command |
|------|---------------|---------|
| **Add** | add to backlog, track this, log this, remember this, save this idea, note this down | `/isdlc add` |
| **Analyze** | analyze, think through, plan this, review requirements, assess impact, design this, prepare | `/isdlc analyze` |
| **Build** | build, implement, create, code, develop, ship, make this, let's do this, refactor, redesign | `/isdlc build` |

**Disambiguation (precedence-based)**:
- Add + Analyze --> **Analyze** (precedence 2 wins over 3)
- Analyze + Build --> **Build** (precedence 1 wins over 2)
- Add + Build --> **Build** (precedence 1 wins over 3)
- Add + Analyze + Build --> **Build** (lowest precedence number wins)

**Exclusions**: Non-development phrases (explain, what does, help me understand, how does, show me, describe, tell me about, what is) skip verb detection entirely.

**Canonical spec**: `src/isdlc/config/reserved-verbs.json`

---

## Development Phases

The framework implements a workflow with quality gates between each phase.

### Feature Workflow
```
Phase 00: Quick Scan
    | (Quick Scan Agent)
    v GATE-00: Scope estimated
Phase 01: Requirements Capture
    | (Requirements Analyst)
    v GATE-01: Requirements validated
Phase 02: Impact Analysis
    | (Impact Analysis Orchestrator)
    v GATE-02: Impact analysis complete
Phase 03: Architecture & Blueprint
    | (Solution Architect)
    v GATE-03: Architecture review
Phase 04: Design & API Contracts
    | (System Designer)
    v GATE-04: Design approval
Phase 05: Test Strategy & Design
    | (Test Design Engineer)
    v GATE-05: Test strategy approval
Phase 06: Implementation
    | (Software Developer)
    v GATE-06: Code complete + unit tests pass
Phase 16: Quality Loop (feature/fix workflows)
    | (Quality Loop Engineer)
    v GATE-16: All tests pass, lint clean, no vulnerabilities
Phase 08: Code Review & QA
    | (QA Engineer)
    v GATE-08: QA sign-off
Phase 09: Independent Validation
    | (Security & Compliance Auditor)
    v GATE-09: Security sign-off
Phase 10: Version Control & CI/CD
    | (CI/CD Engineer)
    v GATE-10: Pipeline operational
Phase 11: Local Development & Testing (test-run only)
    | (Environment Builder)
    v GATE-11: Local environment validated
Phase 12: Test Environment Deployment
    | (Deployment Engineer - Staging)
    v GATE-11: Staging deployment verified
Phase 13: Production Deployment
    | (Release Manager)
    v GATE-13: Production go-live complete
Phase 14: Production Operations
    | (Site Reliability Engineer)
    v GATE-14: Operations stable
Phase 15: Upgrades
    | (Upgrade Engineer)
    v GATE-15: Upgrade complete, zero regressions
```

### Bug Fix Workflow
```
Phase 01: Requirements (Bug Report)
    | (Requirements Analyst)
    v GATE-01: Bug report captured
Phase 02: Tracing
    | (Tracing Orchestrator)
    v GATE-02: Root cause identified
Phase 05: Test Strategy & Design
    | (Test Design Engineer)
    v GATE-05: Test strategy for fix
Phase 06: Implementation (TDD)
    | (Software Developer)
    v GATE-06: Fix implemented, tests pass
Phase 16: Quality Loop
    | (Quality Loop Engineer)
    v GATE-16: All tests pass, lint clean, no vulnerabilities
Phase 08: Code Review & QA
    | (QA Engineer)
    v GATE-08: QA sign-off
```

---

## Agent Files

Agent definitions are located in `.claude/agents/`:

```
.claude/agents/
├── 00-sdlc-orchestrator.md
├── 01-requirements-analyst.md
├── 02-solution-architect.md
├── 03-system-designer.md
├── 03-design-critic.md
├── 03-design-refiner.md
├── 04-test-design-engineer.md
├── 05-software-developer.md
├── 05-implementation-reviewer.md
├── 05-implementation-updater.md
├── 06-integration-tester.md
├── 07-qa-engineer.md
├── 08-security-compliance-auditor.md
├── 09-cicd-engineer.md
├── 10-dev-environment-engineer.md
├── 11-deployment-engineer-staging.md
├── 12-release-manager.md
├── 13-site-reliability-engineer.md
├── 14-upgrade-engineer.md
├── 16-quality-loop-engineer.md
├── roundtable-analyst.md
├── bug-roundtable-analyst.md
├── discover-orchestrator.md
├── quick-scan/
│   └── quick-scan-agent.md
├── impact-analysis/
│   ├── impact-analysis-orchestrator.md
│   ├── impact-analyzer.md
│   ├── entry-point-finder.md
│   └── risk-assessor.md
├── tracing/
│   ├── tracing-orchestrator.md
│   ├── symptom-analyzer.md
│   ├── execution-path-tracer.md
│   └── root-cause-identifier.md
└── discover/
    ├── architecture-analyzer.md
    ├── architecture-designer.md
    ├── artifact-integration.md
    ├── atdd-bridge.md
    ├── characterization-test-generator.md
    ├── constitution-generator.md
    ├── data-model-analyzer.md
    ├── data-model-designer.md
    ├── devops-pragmatist.md
    ├── domain-researcher.md
    ├── feature-mapper.md
    ├── ops-readiness-reviewer.md
    ├── performance-analyst.md
    ├── product-analyst.md
    ├── security-advisor.md
    ├── security-auditor.md
    ├── skills-researcher.md
    ├── solution-architect-party.md
    ├── technical-debt-auditor.md
    ├── technical-scout.md
    ├── test-evaluator.md
    └── test-strategist.md
```
