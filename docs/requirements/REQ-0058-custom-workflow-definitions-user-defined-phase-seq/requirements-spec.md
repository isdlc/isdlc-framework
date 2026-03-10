# Requirements Specification: Custom Workflow Definitions

**REQ ID**: REQ-0058
**Source**: GH-102
**Status**: Analyzed
**Confidence**: High

---

## 1. Business Context

iSDLC ships 6 fixed workflow types (feature, fix, upgrade, test-run, test-generate, reverse-engineer). Teams with workflows that don't fit these templates — spikes, hotfixes, UI-focused features, data migrations, documentation-only changes — either shoehorn their work into the closest workflow or skip the framework entirely.

This is a Tier 2 hackability requirement (Compose layer) from the Hackability & Extensibility Roadmap. The goal is full user control over workflow definitions: composing from shipped phases, defining entirely new phases with custom agents, and extending shipped workflows with modifications.

**Success Metric**: Users can define, extend, and execute custom workflows without modifying framework source code.

## 2. Stakeholders and Personas

### Framework User (Primary)
- **Role**: Developer using iSDLC in their project
- **Goals**: Define workflows that match their team's process without forking the framework
- **Pain Points**: Forced into fixed workflow shapes; skips framework for non-standard work

### Framework Maintainer (Secondary)
- **Role**: iSDLC framework developer
- **Goals**: Keep shipped workflows clean; support extensibility without fragility
- **Pain Points**: Feature requests for workflow variants that could be user-defined

## 3. User Journeys

### Journey 1: Define a New Workflow
1. User creates `.isdlc/workflows/spike.yaml` with name, intent, phases, gate_mode
2. User starts a new session — framework discovers the workflow at prime-session time
3. User says "spike on this" — LLM matches intent, confirms: "So you want to run Spike. Right?"
4. User confirms — workflow executes with the defined phase sequence

### Journey 2: Extend a Shipped Workflow
1. User creates `.isdlc/workflows/thorough-feature.yaml` with `extends: feature` and diff operations
2. Framework resolves the base phases + diffs into a final phase sequence
3. User says "thorough feature for auth" — LLM matches, confirms, executes

### Journey 3: Add a Custom Phase
1. User writes a custom agent markdown file at `.isdlc/agents/my-security-review.md`
2. User references it in a workflow YAML via `add_phases` with an `agent` field
3. Framework validates the agent file exists and includes the phase in execution

## 4. Technical Context

### Current State
- `workflow-init.cjs` has hardcoded `WORKFLOW_PHASES` object (lines 29-35)
- `src/isdlc/config/workflows.json` has declarative workflow definitions read by hooks
- `CLAUDE.md` has a hardcoded intent detection table
- `--light` flag is implemented as phase filtering in `workflow-init.cjs` (line 119-121)
- No workflow discovery or merge logic exists

### Constraints
- Workflow loader must be CommonJS (called from CJS scripts) — Article XIII
- Cross-platform path handling required — Article XII
- User workflow files must survive updates — same preservation pattern as constitution.md

## 5. Quality Attributes and Risks

| Attribute | Priority | Threshold |
|-----------|----------|-----------|
| Usability | Critical | User can create a working custom workflow from documentation alone |
| Reliability | High | Invalid YAML produces clear errors, never crashes the framework |
| Maintainability | High | Workflow loader is a single module with clear API |
| Performance | Medium | Workflow loading adds <500ms to session start |

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Invalid YAML crashes prime-session | Medium | High | Wrap parsing in try/catch, emit clear error, continue with shipped workflows only |
| Name collision confusion | Low | Medium | Validate and reject with clear error message |
| Circular extension | Low | Medium | Validate max depth = 1, reject circular refs |
| Custom agent file missing at runtime | Medium | Medium | Validate at load time, not execution time |

## 6. Functional Requirements

### FR-001: Custom Workflow Definitions
**Confidence**: High

Users can define new workflows in `.isdlc/workflows/*.yaml` with full control over phase sequencing.

- **AC-001-01**: Given a valid YAML file in `.isdlc/workflows/`, When the framework starts a session, Then the workflow is available for execution
- **AC-001-02**: Given a workflow YAML with `name`, `intent`, `phases`, `gate_mode`, and `requires_branch`, When loaded, Then all fields are accessible in the merged workflow registry
- **AC-001-03**: Given a workflow with custom phases referencing `agent` files, When loaded, Then the agent file path is validated to exist on disk
- **AC-001-04**: Given a workflow name that collides with a shipped workflow, When loaded, Then the loader returns a clear error and rejects the workflow

### FR-002: Workflow Extension (Diff-Based)
**Confidence**: High

Workflows can extend shipped workflows using diff operations: `add_phases`, `remove_phases`, `reorder`.

- **AC-002-01**: Given a workflow with `extends: feature` and `remove_phases: [00-quick-scan]`, When resolved, Then the result is the feature phase list without `00-quick-scan`
- **AC-002-02**: Given a workflow with `add_phases: [{ phase: 09-validation, after: 16-quality-loop }]`, When resolved, Then `09-validation` appears after `16-quality-loop` in the phase list
- **AC-002-03**: Given a workflow with `add_phases` containing a custom phase with `agent` field, When resolved, Then the custom phase is included and the agent path is recorded
- **AC-002-04**: Given a workflow with `reorder: [{ move: 05-test-strategy, after: 06-implementation }]`, When resolved, Then `05-test-strategy` appears after `06-implementation`
- **AC-002-05**: Given diff operations applied in order `remove` → `add` → `reorder`, When any operation references a phase not in the current list, Then a clear error is returned
- **AC-002-06**: Given diff operations that produce an empty phase list, When validated, Then the loader rejects with an error

### FR-003: LLM Intent-Based Workflow Matching
**Confidence**: High

Workflow matching uses LLM intent interpretation, not keyword matching. The LLM confirms its interpretation before executing.

- **AC-003-01**: Given a workflow with `intent: "Quick exploration without full gates"` and a user saying "spike on this", When the LLM processes the input, Then it matches the workflow and confirms: "So you want to run {workflow name}. Right?"
- **AC-003-02**: Given multiple workflows that could match user input, When the LLM detects ambiguity, Then it presents the top candidates for the user to pick
- **AC-003-03**: Given the merged workflow registry in the session cache, When the LLM reads intent detection instructions, Then it has access to all workflow intents (shipped + custom) without reading files at runtime

### FR-004: Workflow Loader & Validation
**Confidence**: High

Framework discovers, validates, and merges shipped + user workflows at startup.

- **AC-004-01**: Given `.isdlc/workflows/` contains YAML files, When `loadWorkflows()` is called, Then all valid files are parsed and merged with shipped workflows
- **AC-004-02**: Given a malformed YAML file, When parsed, Then a clear error is returned with file path and parse error details
- **AC-004-03**: Given a workflow missing required fields (`name`, and either `phases` or `extends`), When validated, Then a clear error is returned identifying the missing field
- **AC-004-04**: Given a workflow with a custom phase `agent` path that doesn't exist, When validated, Then an error is returned with the expected path and a suggestion to review shipped agents
- **AC-004-05**: Given a workflow that extends a non-existent base, When validated, Then a clear error is returned

### FR-005: Refactor --light into Shipped Workflow Variant
**Confidence**: High

Remove `--light` flag from `workflow-init.cjs` and ship `feature-light` as an extending workflow.

- **AC-005-01**: Given the shipped workflows, When loaded, Then `feature-light` exists as a workflow extending `feature` with `remove_phases: [03-architecture, 04-design]`
- **AC-005-02**: Given `workflow-init.cjs`, When processing workflow type, Then no `--light` flag logic exists — all phase resolution uses the workflow loader
- **AC-005-03**: Given `--supervised` flag, When configuring a workflow, Then it is a workflow-level boolean setting, not a CLI flag

### FR-006: Phase Documentation & Agent Authoring Guidance
**Confidence**: High

Document each shipped phase and guide users on authoring custom agents.

- **AC-006-01**: Given the documentation, When a user wants to create a custom workflow, Then each shipped phase has a documented purpose, inputs, outputs, and when to include/exclude
- **AC-006-02**: Given the documentation, When a user wants to write a custom agent, Then they are pointed to Claude Code docs and 2-3 shipped agents as examples

### FR-007: Documentation Updates
**Confidence**: High

All related documentation updated to reflect custom workflow support.

- **AC-007-01**: Given README, When reviewed, Then it includes a custom workflow section
- **AC-007-02**: Given CLAUDE.md, When reviewed, Then intent detection references dynamic workflow loading
- **AC-007-03**: Given `docs/isdlc/hackability-roadmap.md`, When reviewed, Then Tier 2 custom workflows is marked as shipped
- **AC-007-04**: Given session cache generation, When run, Then merged workflow registry is included

### FR-008: Installer & Updater Cross-Platform Support
**Confidence**: High

Install/update scripts handle the workflows directory across all platforms.

- **AC-008-01**: Given `lib/installer.js`, When installing, Then `.isdlc/workflows/` directory is created
- **AC-008-02**: Given `lib/updater.js`, When updating, Then `.isdlc/workflows/*.yaml` files are preserved
- **AC-008-03**: Given `lib/uninstaller.js`, When uninstalling, Then `.isdlc/workflows/` is left in place (user content)
- **AC-008-04**: Given any platform (macOS, Linux, Windows), When creating the workflows directory, Then `path.join()` is used for cross-platform compatibility

## 7. Out of Scope

| Item | Reason | Dependency |
|------|--------|------------|
| Gate profiles | Separate feature (#97) | Custom workflows use existing `strict`/`permissive` |
| Custom skill definitions | Phases reference agents, not skills | Future extensibility |
| Overriding shipped workflow names | Reserved for predictability | By design |
| Multi-level extension chains | Complexity vs value | A5: max depth 1 |
| Custom phase iteration requirement schemas | Users can declare but framework doesn't enforce | Future extensibility |

## 8. MoSCoW Prioritization

| FR | Title | Priority | Rationale |
|----|-------|----------|-----------|
| FR-001 | Custom Workflow Definitions | Must Have | Core capability |
| FR-002 | Workflow Extension (Diff-Based) | Must Have | Extends shipped workflows without duplication |
| FR-003 | LLM Intent-Based Matching | Must Have | Core to invisible UX |
| FR-004 | Workflow Loader & Validation | Must Have | Foundation for all other FRs |
| FR-005 | Refactor --light | Must Have | Dogfoods the extension system |
| FR-006 | Phase Documentation & Guidance | Should Have | Enables adoption |
| FR-007 | Documentation Updates | Must Have | Framework docs must stay current |
| FR-008 | Installer & Updater Support | Must Have | Cross-platform reliability |

## Pending Sections

None — all sections complete.
