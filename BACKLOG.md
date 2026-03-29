# iSDLC Framework - Backlog

> GitHub Issue numbers (`#N`) are the canonical identifiers. Say "#17" and it maps to exactly one item in both BACKLOG.md and GitHub.
> BACKLOG.md is the curated working set with detailed specs. GitHub Issues are for tracking.

## Open
- [ ] #116 Extract agent protocols from CLAUDE.md into shared protocols file [github: GH-116] -> [requirements](docs/requirements/REQ-GH-116-extract-agent-protocols-from-claude-md/)
- [A] #214 PreToolUse enforcement: route agents to higher-fidelity MCP tools when available [github: GH-214] -> [requirements](docs/requirements/REQ-GH-214-pretooluse-enforcement-route-agents-higher-fidelity-mcp/)
- [x] #213 Contract enforcement must be inline (during execution), not post-phase [github: GH-213] -> [requirements](docs/requirements/REQ-GH-213-contract-enforcement-must-be-inline/) **Completed**
  - **Completed:** 2026-03-27
- [ ] #207 Mandatory web research enforcement in roundtable analysis — wire research: true flag [github: GH-207]
- [x] #212 Task list consumption model for build phase agents (05/06/16/08) [github: GH-212] -> [requirements](docs/requirements/REQ-GH-212-task-list-consumption-model-for-build-phase-agents/) **Completed**
  - Depends on #208. Covers how Phase 05/06/16/08 read and execute against pre-generated tasks.md.
  - **Completed:** 2026-03-26
- [x] #208 Generate structured task breakdown artifact from analysis before build [github: GH-208] -> [requirements](docs/requirements/REQ-GH-208-generate-structured-task-breakdown-artifact/) **Completed**
  - **Completed:** 2026-03-26
- [x] #206 Conversational enforcement via Stop hook — bulleted format, three-domain confirmation, roundtable skip [github: GH-206] → `REQ-0140-conversational-enforcement-stop-hook/` -> [requirements](docs/requirements/REQ-0140-conversational-enforcement-stop-hook/) **Completed**
  - **Completed:** 2026-03-25
- [ ] #133 Memory infrastructure scale-out — HNSW indexing, remote vector store, incremental indexing [github: GH-133] → `REQ-0069-memory-infrastructure-scale-out-hnsw-indexing-r/` -> [requirements](docs/requirements/REQ-0069-memory-infrastructure-scale-out-hnsw-indexing-r/)
  - Depends on REQ-0064, REQ-0066, BUG-0056. Not urgent for dogfooding; critical for enterprise adoption.
- [x] #126 CodeBERT embedding non-functional — stub tokenizer, missing model download, handler not wired [github: GH-126] → `BUG-0056-codebert-embedding-non-functional-stub-tokenize/` -> [requirements](docs/requirements/BUG-0056-codebert-embedding-non-functional-stub-tokenize/) **Completed**
  - **Completed:** 2026-03-21
- [A] #128 Execution observability — surface workflow trace as structured report [github: GH-128] → `REQ-0068-execution-observability-workflow-trace-report/` -> [requirements](docs/requirements/REQ-0068-execution-observability-workflow-trace-report/)
  - **Re-analyzed:** 2026-03-25 (1 amendment cycle: FR-004 priority escalated to Must Have)
- [x] #127 Blast radius validator fails-open when coverage artifact missing [github: GH-127] → `BUG-0055-blast-radius-validator-fails-open-when-coverage-ar/` -> [requirements](docs/requirements/BUG-0055-blast-radius-validator-fails-open-when-coverage-ar/) **Completed**
  - **Completed:** 2026-03-21
- [x] Configurable session cache token budget — replace hardcoded limits with project-configurable token budget up to 200-300K tokens → `REQ-0067-configurable-session-cache-token-budget/` -> [requirements](docs/requirements/REQ-0067-configurable-session-cache-token-budget/) **Completed**
  - **Completed:** 2026-03-15
- [x] Inline roundtable analysis — eliminate subagent dispatch overhead [github: GH-124] → `REQ-0065-inline-roundtable-eliminate-subagent-overhead/` -> [requirements](docs/requirements/REQ-0065-inline-roundtable-eliminate-subagent-overhead/) **Completed**
  - **Completed:** 2026-03-15
- [x] #125 Team continuity memory — project-level knowledge retention across work gaps [github: GH-125] → `REQ-0066-team-continuity-memory-project-knowledge-retent/` -> [requirements](docs/requirements/REQ-0066-team-continuity-memory-project-knowledge-retent/) **Completed**
  - Depends on REQ-0064. Inspired by Hyperspace Research DAGs. Surfaces past team decisions when work resumes after gaps.
  - **Completed:** 2026-03-15
- [x] Roundtable memory vector DB migration — move both user and project memory layers from flat JSON to vector DB using existing embedding infrastructure → `REQ-0064-roundtable-memory-vector-db-migration/` -> [requirements](docs/requirements/REQ-0064-roundtable-memory-vector-db-migration/) **Completed**
  - **Completed:** 2026-03-15
- [ ] Developer usage analytics — friction/flow event capture with privacy-respecting telemetry [github: GH-121] → `REQ-0062-developer-usage-analytics-friction-flow-event-capture/` -> [requirements](docs/requirements/REQ-0062-developer-usage-analytics-friction-flow-event-capture/) **Analyzed**
- [x] Bug-aware analyze flow — inject Phase 02 tracing into analyze when subject is a bug [github: GH-119] → `REQ-0061-bug-aware-analyze-flow-inject-phase-02-tracing-int/` -> [requirements](docs/requirements/REQ-0061-bug-aware-analyze-flow-inject-phase-02-tracing-int/) **Completed**
  - **Completed:** 2026-03-11
- [x] User-space hooks — extensible pre/post phase hook points [github: GH-101] → `REQ-0055-user-space-hooks-extensible-prepost-phase-hook-poi/` -> [requirements](docs/requirements/REQ-0055-user-space-hooks-extensible-prepost-phase-hook-poi/)

### Parallel Workflows (Architecture)

- #30 [ ] Parallel workflow support — per-workflow state isolation enabling concurrent feature/fix sessions
  - **Problem**: `single_active_workflow_per_project` rule blocks parallel work. A developer can't work on one bug while another is in progress. The constraint exists because `state.json` has a single `active_workflow` field and all hooks assume one active context.
  - **Design**: Split state into per-workflow files with a shared index:
    ```
    .isdlc/
      workflows.index.json          ← lightweight: [{ id, type, branch, status, started }]
      workflows/
        BUG-0012/state.json         ← full workflow state (phases, current_phase, escalations, skill_usage_log)
        BUG-0013/state.json         ← full workflow state
      config/                       ← shared (unchanged)
      state.json                    ← project-level only (counters, project info, workflow_history, constitution)
    ```
  - **Hook resolution**: Dispatchers resolve `git branch → workflow ID → workflow state` once per invocation via `git branch --show-current` (~5ms), pass resolved state to all hooks. Branch name already maps 1:1 to workflow.
  - **Session binding**: At session start, `/isdlc` (no args) presents a picker if multiple workflows are active. Once selected, CLAUDE.md instruction scopes all operations to that workflow. After selection, hooks only read that workflow's state file.
  - **Git parallelism**: Requires `git worktree` for true parallel sessions (two checkouts in different directories) or separate clones. Without worktrees, workflows are still sequential but with better state isolation and no cancellation needed to switch.
  - **Migration scope**: ~20 files reference `readState()` — all dispatchers, standalone hooks, and common.cjs utilities need to resolve workflow-scoped state instead of global state.
  - **Performance impact**: +10-20ms per hook invocation (index read + branch resolution). Mitigated by caching within dispatcher runs.
  - **Complexity**: Medium-large (2-3 sessions through full iSDLC workflow)
  - **Prerequisite**: ~~BUG-0013 (phase-loop-controller same-phase bypass)~~ DONE

- #123 [ ] Event-sourced state model — replace CRUD state.json with append-only event log for team audit trails and concurrent workflow safety
  - **Problem**: `state.json` uses read-modify-write (CRUD) which breaks in team contexts: no audit trail (who approved which gate?), last-write-wins on concurrent access, no point-in-time state reconstruction, and mutable JSON provides no tamper evidence for Articles VI/IX accountability.
  - **Design**: Append-only event log replaces mutable JSON. Current state derived by replaying events. Events include actor attribution, timestamps, and phase context. `skill_usage_log` already follows this pattern — extend to all state.
  - **Relationship to #30**: Event sourcing eliminates the concurrent state isolation problem that #30 solves with per-workflow state files. Should be designed alongside #30 since both reshape state management.
  - **Migration scope**: ~20 files reference `readState()`/`writeState()`. `common.cjs` needs event-append + state-derivation functions. Compatibility layer needed during migration.
  - **Inspired by**: [12-Factor Agents](https://github.com/humanlayer/12-factor-agents) Factor 12 (Stateless Reducer) — `(state, event) → new_state`
  - **Complexity**: Medium-large. Design alongside #30.

### Multi-Agent Teams (Architecture)

- #31 [~] Impact Analysis cross-validation — improve Phase 02 accuracy by enabling agents to cross-check findings (Approach A DONE — REQ-0015, Approach B still open)
  - **Problem**: M1 (Impact Analyzer), M2 (Entry Point Finder), and M3 (Risk Assessor) run in parallel but in **complete isolation** — no SendMessage, no cross-referencing, no awareness of each other's findings. The orchestrator consolidates after all complete, but nobody verifies consistency. M1 might say 7 files affected while M2 found entry points in 9 files, or M3's risk score might not account for coupling that M1 identified. Inconsistencies flow silently into sizing and downstream phases.
  - **Approach A — Post-hoc Verifier** [x] (DONE — REQ-0015: cross-validation-verifier.md agent, Step 3.5 in orchestrator, IA-401/IA-402 skills, 3-tier fail-open, 33 tests):
    - After M1/M2/M3 complete and before consolidation, spawn a Verifier agent that:
      1. Cross-references file lists (M1 affected files vs M2 entry point chains — files in one but not the other?)
      2. Validates risk scoring (does M3's risk level account for M1's coupling analysis and M2's chain depth?)
      3. Checks completeness (are all M2 entry points covered in M1's blast radius?)
      4. Flags inconsistencies for the orchestrator to resolve or surface to the user
    - **Cost**: +1 Task call after existing parallel phase
    - **Limitation**: Catches inconsistencies after the fact but can't improve what the agents found. If M1 missed a file, the Verifier can flag the gap but can't go analyse it.
  - **Approach B — Cross-pollination during execution** (richer, requires restructuring):
    - M1/M2/M3 still launch in parallel but share interim findings via SendMessage during execution:
      - M2 discovers a call chain through 3 modules → tells M1 to check those modules for coupling
      - M1 finds high coupling in a file → tells M3 to raise the risk score for that area
      - M3 identifies a test coverage gap → tells M2 to trace whether that gap is in a critical path
    - Pattern: **parallel with cross-pollination** — agents run simultaneously but broadcast interim discoveries. Lighter than full propose-critique-converge (no debate rounds, no convergence protocol), heavier than pure isolation.
    - Modeled on discover Phase 3's cross-review pattern (D8/D14/D15 review each other's outputs) but applied during execution, not after.
    - **Cost**: Same 3 Task calls but longer execution (agents wait for messages). Message budget: max 6 cross-messages total (2 per agent) to prevent runaway communication.
    - **Benefit**: Agents can act on each other's findings — M1 can re-analyse modules M2 flagged, M3 can adjust risk based on M1's coupling data. Better results, not just better validation.
  - **Recommendation**: Start with Approach A (low risk, immediate value), evolve to Approach B if inconsistency rate is high.
  - **Impact on sizing**: More accurate file counts and risk scores → more reliable sizing decisions (connects to #51)
  - **Complexity**: A = Low-medium (one new agent). B = Medium (SendMessage protocol, message budget, interim finding format)

### Developer Engagement Modes (Architecture)

- #32 [ ] Collaborative mode — developer as co-contributor alongside the AI, with parallel human tasks and artifact drop-in
  - **Problem**: In auto mode the developer sits idle for 15-60 minutes while the framework works. Supervised mode (REQ-0013) keeps them engaged as a reviewer, but the developer still isn't *producing* anything. Developers with domain expertise want to contribute — draft acceptance criteria, research competitors, sketch edge cases, write test scenarios — but there's no mechanism to feed that work back into the active workflow.
  - **Builds on**: Supervised mode (REQ-0013) — collaborative mode is supervised mode + contribution capabilities. REQ-0013 is a prerequisite.
  - **Design**:
    1. **Parallel task suggestions**: At phase boundaries (and during long phases), the framework suggests concrete tasks the developer can work on while the AI continues. Tasks have clear artifact formats and file paths:
       ```
       Phase 06 (Implementation) starting — estimated 20 min.

       While I work, you could prepare:
         → Edge cases for payment validation    → .isdlc/contributions/edge-cases.md
         → Domain notes on PCI-DSS compliance   → .isdlc/contributions/domain-research.md
         → Draft acceptance criteria for Phase 2 → .isdlc/contributions/acceptance-criteria.md

       Drop files in .isdlc/contributions/ — I'll pick them up at the next review gate.

       [Continue] → I'll work autonomously
       [Skip suggestions] → don't show these
       ```
    2. **Contribution drop-in**: `.isdlc/contributions/` directory watched at review gates. Any files placed there are read by the next phase agent as additional context. Contributions are tagged with the phase they were created during and the phase they're intended for.
    3. **Contribution integration**: At each review gate, the framework lists consumed contributions and shows how they influenced the output:
       ```
       Contributions consumed:
         ✓ edge-cases.md → 3 edge cases added to test-strategy.md
         ✓ domain-research.md → PCI-DSS constraints added to NFR matrix
         ○ acceptance-criteria.md → queued for next requirements phase
       ```
    4. **Task suggestion engine**: Per-phase lookup table of useful parallel human tasks, filtered by what's missing or weak in the current artifacts. Not a static list — contextual based on the feature being built.
    5. **Backlog refinement as a contribution type**: While the AI works on implementation, the developer can refine the project backlog — analysing UX issues from real usage, spotting inconsistencies, capturing developer feedback, refining existing items with fresh context. This is product ownership work that the AI can't do because it requires lived experience with the system. The framework suggests backlog-related tasks when relevant:
       ```
       While I work, you could also:
         → Review and refine upcoming backlog items    → BACKLOG.md
         → Capture UX issues from your recent usage    → .isdlc/contributions/ux-feedback.md
         → Note edge cases you've observed in production → .isdlc/contributions/observed-issues.md
       ```
       Backlog contributions are not consumed by the active workflow but are flagged at workflow completion for the developer to review and merge.
  - **Config**:
    ```json
    {
      "collaborative_mode": {
        "enabled": false,
        "suggest_tasks": true,
        "contributions_dir": ".isdlc/contributions",
        "auto_consume_at_gates": true
      }
    }
    ```
  - **Mode selection UX**: At workflow start, present mode choice (or read from config default):
    ```
    How would you like to work on this?
    [A] Auto — I'll handle it, minimal input needed
    [S] Supervised — pause for your review between phases
    [C] Collaborative — suggest tasks you can work on in parallel
    ```
  - **Key use cases**: developer has domain expertise the AI lacks, long-running workflows where idle time is wasted, team onboarding (developer learns by contributing alongside AI), complex features requiring human judgement on edge cases
  - **Scope**: Medium-large — contribution directory convention, task suggestion engine, gate integration, config. Depends on REQ-0013 (supervised mode) being complete first.
  - **Complexity**: Medium — builds on supervised mode infrastructure, main new work is task suggestion engine and contribution consumption logic

### Framework Features

- #35 [ ] Implementation learning capture: if bug fixes were identified during implementation or iteration loops > 1, create a learning for subsequent implementation
- #27 [ ] /isdlc validate command — on-demand artifact quality check (constitutional + completeness) without running a full workflow
- #28 [ ] Progressive disclosure / lite mode — expose only constitution → requirements → implement → quality loop for simple projects, full lifecycle opt-in
- #38 [ ] /isdlc refactor command and workflow — pre-requisite: 100% automated E2E testing
- #37 [ ] Separate commands to manage deployments and operations
- #40 [ ] Epic decomposition for large features (depends on adaptive workflow sizing / REQ-0011)
  - **Trigger**: Impact Analysis estimates `large` scope (20+ files) or `high` risk
  - **Process**: After sizing decision, Requirements Analyst re-enters to break the feature into sub-features with clear boundaries
  - **Execution model**: Each sub-feature gets an independent mini-cycle with its own gates:
    ```
    Sub-feature A → design → implement → test → gate
    Sub-feature B → design → implement → test → gate
    Sub-feature C → design → implement → test → gate
    Integration testing across A + B + C → final gate
    ```
  - **Benefits**: Catch problems early per sub-feature, reduce context window pressure, intermediate quality gates, partial progress is usable
  - **State tracking**: `state.json` tracks parent feature + sub-features with individual phase progress
- #41 [~] Ollama / local LLM support — enable and test the framework with Ollama-hosted open models (IN PROGRESS — core implementation merged REQ-0007, installer provider selection M2 done, remaining: end-to-end workflow test with local model)
  - Ollama v0.14+ natively implements the Anthropic Messages API, Claude Code supports it via 3 env vars (`ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_API_KEY`)
  - Quick start: `ollama launch claude` — or manual config with `claude --model <model>`
  - Recommended models: qwen3-coder, glm-4.7, gpt-oss:20b/120b (minimum 64k context window)
  - Re-enable the existing `/provider` skill (currently disabled) to manage Ollama configuration
  - **Test scope**: run a full iSDLC workflow (feature or fix) end-to-end with a local model — verify hooks, agents, state management, and gate validation all work correctly. Key risk: open models may struggle with iSDLC's complex multi-agent workflows (tool calling, large context, structured output).
  - **Known trade-offs**: quality near-parity with cloud Claude, but ~68x slower in benchmarks; best for privacy, zero-cost usage, demos, and learning
  - **Cloud variants**: Ollama `:cloud` models (e.g., `kimi-k2.5:cloud`) available for faster inference without API keys
  - **Not blocked by Anthropic**: In Jan 2026, Anthropic blocked third-party tools (OpenCode, xAI) from using Claude Pro/Max subscriptions to access proprietary Claude models (anti-arbitrage). Ollama + Claude Code is unaffected — it uses Anthropic's own CLI pointed at local open-source models, no Anthropic subscription or API key needed. Still working as of Feb 2026, though streaming and tool-calling edge cases are still being patched in Ollama.
  - Docs: [docs.ollama.com/integrations/claude-code](https://docs.ollama.com/integrations/claude-code)
- #42 [ ] SonarQube integration
- #66 [ ] Spec reconciliation phase and selective code regeneration — close the spec-code knowledge gap so code becomes regenerable from complete specifications -> [requirements](docs/requirements/spec-reconciliation-and-code-regeneration/)
- #92 [ ] Generalize hook block retry in orchestrator step 3f
- #93 [ ] TOON: State array encoding at injection time (FR-003)
- #94 [ ] TOON: Token measurement benchmarks for session cache

### Product/Vision

- #43 [ ] Board-driven autonomous development (read from board, develop without intervention when users are away)
- #44 [ ] Design systems using variant.ai
- #45 [ ] Feedback collector, analyser, and roadmap creator
- #46 [ ] Analytics manager (integrated with feedback collector/roadmap)
- #47 [ ] User auth and profile management
- #48 [ ] Marketing integration for SMBs

### Code Quality Gaps

- #52 [x] Coverage threshold discrepancy — Constitution mandates 95% unit coverage but Phase 16 only enforces 80%
  - **Completed:** 2026-03-15

- #53 [ ] No automated complexity measurement — IC-04 relies on agent judgment, not tooling
  - **Problem**: The Implementation Reviewer's IC-04 check says "cyclomatic complexity >10 = BLOCKING" but this is pure agent judgment. No eslint-plugin-complexity, radon (Python), gocyclo (Go), or similar tool actually measures complexity. The agent estimates by reading the code — it can miss deeply nested logic or undercount decision points.
  - **Design**: Integrate automated complexity measurement into the quality pipeline:
    1. **Phase 16 Track B**: Add complexity analysis as a new check (QL-012). Detect available tool by project type:
       - JavaScript/TypeScript: `eslint-plugin-complexity` or `escomplex`
       - Python: `radon cc` or `flake8 --max-complexity`
       - Go: `gocyclo`
       - Java: PMD or Checkstyle complexity rules
    2. **Feed results into IC-04**: If automated metrics are available, the Implementation Reviewer uses them instead of estimating. If not available, falls back to agent judgment (current behavior).
    3. **Threshold**: Configurable per project in `state.json → project.quality_thresholds.max_cyclomatic_complexity` (default: 10)
  - **Same pattern as existing tool detection**: Phase 16 already detects eslint, tsc, jest, etc. This adds complexity tools to that detection.
  - **Complexity**: Low-medium — new QL skill, tool detection patterns, optional IC-04 data source

- #54 [ ] Agent-judgment quality checks lack automated backing — IC-01 through IC-07 have no tooling validation
  - **Problem**: All per-file checks in the Implementation Reviewer are agent judgment. The agent decides if there's a security issue (IC-03), a DRY violation (IC-04), or a missing error handler (IC-02). This is valuable but inconsistent — different agent runs may catch different issues. There's no automated baseline to validate against.
  - **Design**: Where automated tools exist, run them as a validation layer alongside agent judgment:
    | IC Check | Automated Tool Candidate |
    |----------|------------------------|
    | IC-01 (Logic) | No good automation — keep agent-only |
    | IC-02 (Error handling) | eslint no-empty-catch, no-unhandled-rejection rules |
    | IC-03 (Security) | semgrep, eslint-plugin-security, bandit (Python) |
    | IC-04 (Quality) | eslint-plugin-complexity, sonarqube (#42) |
    | IC-05 (Tests) | No good automation — keep agent-only |
    | IC-06 (Tech-stack) | Package.json/tsconfig validation — partially automatable |
    | IC-07 (Constitution) | No automation — constitutional compliance is semantic |
  - **Approach**: Don't replace agent judgment — augment it. If an automated tool finds an issue the agent missed, flag it. If the agent finds something the tool missed, that's the value of agent judgment. The combination catches more than either alone.
  - **Prerequisite**: #42 (SonarQube integration) would cover IC-02, IC-03, IC-04 in one tool. If SonarQube lands first, this item shrinks significantly.
  - **Complexity**: Medium — tool integration, result merging, fallback-to-agent-only when tools unavailable

### Developer Experience

- #56 [ ] Install script landing page and demo GIF — update the install script landing/README with a polished visual experience including an animated GIF demonstrating the framework in action (invisible framework flow, workflow progression, quality gates)

### Backlog Management UX

- #12 [ ] Auto-move completed BACKLOG.md headings when all items are done
  - **Problem**: When all items under a `###` heading are `[x]`, the entire heading block should move to `## Completed`. Currently not specified or implemented.
  - **Design**: After marking an item `[x]`, check if all siblings under same heading are also `[x]`. If yes, move entire heading block. Append `— COMPLETED {date}` suffix.
  - **Complexity**: Low-medium — extends the completion marking logic from #11

### Backlog & Analysis Redesign

> **Context**: Phase A/B separation is unintuitive. The user experience between managing backlog items, analyzing them, and building them doesn't flow naturally. This redesign unifies the pipeline around three natural verbs (add/analyze/build) with persona-driven interactive analysis and transparent quality enrichment. Inspired by BMAD party mode pattern.
> **Subsumes**: #50, #6, #8, #9, #10, #17

- #79 [ ] Introduce Critic/Refiner pass in analyze flow before confirmation summaries -> [requirements](docs/requirements/REQ-0036-introduce-critic-refiner-in-analyze-flow/)

### Harness Engineering Alignment

> Gaps identified by comparing iSDLC to [OpenAI's harness engineering methodology](https://openai.com/index/harness-engineering/). iSDLC already covers context engineering (CLAUDE.md, agents, constitution) and architectural constraints (hooks, gates, validation). These items address the missing pillars.

- #109 [ ] Entropy management agents (`/isdlc sweep`) — scheduled codebase health checks outside active workflows: doc-code consistency, constitution compliance, pattern drift, dependency health, dead code detection. Output: `docs/isdlc/sweep-report.md`. Config: `.isdlc/sweep.json`.
  - **Priority**: Should Have
  - **Complexity**: Medium-large
- #110 [ ] Observability-as-context for agents — feed runtime data (error logs, performance baselines, incidents) to Phase 02 tracing, impact analysis, and Phase 16 quality loop via `.isdlc/observability/` directory convention. Fail-open per Article X.
  - **Priority**: Could Have
  - **Complexity**: Medium
- #111 [x] Adaptive process complexity (rippable phases) — extend sizing/tier system with model confidence dimension. Phase-level skip conditions configurable in `.isdlc/process.json`. Audit trail for skipped/abbreviated phases. Override with `--strict`.
  - **Priority**: Should Have
  - **Complexity**: Medium
  - **Builds on**: REQ-0011, #28, #97
- #112 [ ] Repository-first knowledge enforcement — detect undocumented ADRs, magic config values, and integration gaps. Knowledge gap detector in sweep, `[NEEDS DOCUMENTATION]` flags in Phase 01 roundtable, Article XV for constitution.
  - **Priority**: Should Have
  - **Complexity**: Low-medium
  - **Builds on**: #109 (entropy sweep)

### Process Enforcement

- [x] #118 Phase-work guard hook [github: GH-118] → `REQ-0141` -> [requirements](docs/requirements/REQ-0141-phase-work-guard-hook/) *(merged 1662ce2)*
  - **Completed:** 2026-03-26
- #120 [ ] Required skill execution enforcement — gate-blocker 6th check: before advancing, verify that required skills for the current phase were actually executed (present in `skill_usage_log`). Add `required_skills` array to each phase in `iteration-requirements.json` (subset of the agent's `owned_skills` — mandatory per invocation, not the full ownership list). Skill ownership remains shared (any agent can use any skill), but phase completion requires the listed skills to have been invoked. Config-driven: phases with no `required_skills` key skip this check.
  - **Priority**: Must Have
  - **Complexity**: Medium
  - **Touches**: `gate-blocker.cjs` (or `gate-logic.cjs`), `iteration-requirements.json`, `skills-manifest.json` (reference), `validate-gate.cjs`

### Hackability & Extensibility

> Full design: [docs/isdlc/hackability-roadmap.md](docs/isdlc/hackability-roadmap.md)

**Tier 1 — Foundation**
- #97 [x] Gate profiles — configurable strictness levels (rapid/standard/strict)
- #98 [x] Workflow recovery — retry/redo current phase without restarting
- #99 [x] Workflow recovery — rollback to earlier phase

**Infrastructure**
- #115 [ ] Installer should inject monorepo protocol into user project CLAUDE.md — when `isMonorepo === true`, inject path routing table, project context delegation template, and workflow independence rules into generated CLAUDE.md
- #116 [ ] Extract agent protocols from CLAUDE.md — move 8 shared protocols (Monorepo Mode, Constitutional Principles, Skill Observability, Suggested Prompts, Iteration Enforcement, Root Resolution, Git Commit Prohibition, Single-Line Bash) to `src/claude/protocols.md`. Update 31 agent files, 3 test files, CLAUDE.md.template. Wire into session cache.

**Tier 2 — Extension Points**
- #101 [x] User-space hooks — extensible pre/post phase hook points (.isdlc/hooks/)
- #102 [x] Custom workflow definitions — user-defined phase sequences (.isdlc/workflows/*.yaml)

**Tier 3 — Developer Productivity**
- #104 [x] Template system — closed as already-covered (discovery conventions, custom skills, semantic search)
- #106 [ ] Context carry-forward — reuse prior analysis across related workflows

**Tier 4 — Team & Organization Scale**
- #107 [ ] Constitution composition — base + project constitution merge for team sharing
- #108b [x] Full persona override — user controls analysis mode (personas/no-personas), verbosity, and roster; primaries demoted to recommended defaults; persona authoring docs -> [requirements](docs/requirements/REQ-0050-full-persona-override/) **Analyzed**
  - Depends on #108a (completed). 7 FRs, ~11 files, standard tier.

### Codex Integration

> **Source**: [CODEX-INTEGRATION-DESIGN.md](../isdlc-codex/docs/CODEX-INTEGRATION-DESIGN.md) + [CODEX-INTEGRATION-IMPLEMENTATION-PLAN.md](../isdlc-codex/docs/CODEX-INTEGRATION-IMPLEMENTATION-PLAN.md)
>
> Extract a provider-neutral iSDLC core and implement Claude and Codex as separate runtime adapters over that shared core. 58 items across 6 workstreams (A-F) and 10 implementation phases (0-9). Phase 0 must complete before broad extraction.

**Workstream A — Runtime & Governance**

- #134 [ ] Codex runtime capability audit [github: GH-134] → `REQ-0070-codex-runtime-capability-audit/` -> [requirements](docs/requirements/REQ-0070-codex-runtime-capability-audit/) **Analyzed**
  - Phase 0. Audit sub-agent execution, structured results, file/process behavior, instruction projection, permissions. Classify each as verified/inferred/unsupported. **Gate: must complete before any broad extraction.**
- #135 [ ] Governance strength assessment [github: GH-135] → `REQ-0071-governance-strength-assessment/` -> [requirements](docs/requirements/REQ-0071-governance-strength-assessment/) **Analyzed**
  - Phase 0. Depends on REQ-0070. Classify enforcement per provider. Produce governance strength matrix.
- #136 [ ] Antigravity viability assessment [github: GH-136] → `REQ-0072-antigravity-viability-assessment/` -> [requirements](docs/requirements/REQ-0072-antigravity-viability-assessment/) **Analyzed**
  - Phase 0. Depends on REQ-0070. Disposition: **peer provider** (not shared backbone). 12 scripts rewire to core, 1 needs redesign, 1 absorbed, 1 template.
- #139 [ ] Module system boundary decision [github: GH-139] → `REQ-0075-module-system-boundary-decision/` -> [requirements](docs/requirements/REQ-0075-module-system-boundary-decision/) **Analyzed**
  - Phase 0. **Decision: ESM core + thin CJS bridge** for Claude hooks. External consumers (Codex, Antigravity) via npm package. ADR-CODEX-006.
- [x] #152 Implement enforcement layering protocol [github: GH-152] → `REQ-0088-enforcement-layering-protocol/` -> [requirements](docs/requirements/REQ-0088-enforcement-layering-protocol/) **Completed**
  - **Completed:** 2026-03-22
- [x] #154 Hook conversion — core validators to provider-neutral modules [github: GH-154] → `REQ-0090-hook-conversion-core-validators/` -> [requirements](docs/requirements/REQ-0090-hook-conversion-core-validators/) **Completed**
  - **Completed:** 2026-03-22
- [x] #155 Hook conversion — workflow guards to engine rules [github: GH-155] → `REQ-0091-hook-conversion-workflow-guards/` -> [requirements](docs/requirements/REQ-0091-hook-conversion-workflow-guards/) **Completed**
  - **Completed:** 2026-03-22
- [x] #156 Hook conversion — observability to provider-neutral services [github: GH-156] → `REQ-0092-hook-conversion-observability/` -> [requirements](docs/requirements/REQ-0092-hook-conversion-observability/) **Completed**
  - **Completed:** 2026-03-22
- [x] #157 Dispatcher layer refactor [github: GH-157] → `REQ-0093-dispatcher-layer-refactor/` -> [requirements](docs/requirements/REQ-0093-dispatcher-layer-refactor/) **Completed**
  - **Completed:** 2026-03-22
- #187 [ ] Dual-provider runtime constraints [github: GH-187] → `REQ-0123`
  - Phase 0. Depends on REQ-0070. One active provider per workflow; cross-provider resume rules.

**Workstream B — Core Extraction**

- [x] #143 Create src/core/ scaffold [github: GH-143] → `REQ-0079-create-src-core-scaffold/` -> [requirements](docs/requirements/REQ-0079-create-src-core-scaffold/) **Completed**
  - **Completed:** 2026-03-21
- [x] #144 Extract StateStore service [github: GH-144] → `REQ-0080-extract-statestore-service/` -> [requirements](docs/requirements/REQ-0080-extract-statestore-service/) **Completed**
  - **Completed:** 2026-03-21
- [x] #145 Extract ValidatorEngine [github: GH-145] → `REQ-0081-extract-validator-engine/` -> [requirements](docs/requirements/REQ-0081-extract-validator-engine/) **Completed**
  - **Completed:** 2026-03-21
- [x] #146 Extract WorkflowRegistry and WorkflowEngine [github: GH-146] → `REQ-0082-extract-workflow-registry-engine/` -> [requirements](docs/requirements/REQ-0082-extract-workflow-registry-engine/) **Completed**
  - **Completed:** 2026-03-21
- [x] #147 Extract BacklogService and ItemStateService [github: GH-147] → `REQ-0083-extract-backlog-itemstate-service/` -> [requirements](docs/requirements/REQ-0083-extract-backlog-itemstate-service/) **Completed**
  - **Completed:** 2026-03-21
- [x] #148 Extract search and memory service boundaries [github: GH-148] → `REQ-0084-extract-search-memory-boundaries/` -> [requirements](docs/requirements/REQ-0084-extract-search-memory-boundaries/) **Completed**
  - **Completed:** 2026-03-22
- [x] #149 Decompose common.cjs [github: GH-149] → `REQ-0085-decompose-common-cjs/` -> [requirements](docs/requirements/REQ-0085-decompose-common-cjs/) **Completed**
  - **Completed:** 2026-03-22
- [x] #150 Split three-verb-utils.cjs structural logic [github: GH-150] → `REQ-0086-split-three-verb-utils/` -> [requirements](docs/requirements/REQ-0086-split-three-verb-utils/) **Completed**
  - **Completed:** 2026-03-22
- [x] #158 Provider-neutral team spec model [github: GH-158] → `REQ-0094-provider-neutral-team-spec-model/` -> [requirements](docs/requirements/REQ-0094-provider-neutral-team-spec-model/) **Completed**
  - **Completed:** 2026-03-22
- [x] #188 State schema versioning and migration [github: GH-188] → `REQ-0124-state-schema-versioning-migration/` -> [requirements](docs/requirements/REQ-0124-state-schema-versioning-migration/) **Completed**
  - **Completed:** 2026-03-21
- [x] #189 Gate profiles and JSON schemas to shared core [github: GH-189] → `REQ-0125-gate-profiles-schemas-to-core/` -> [requirements](docs/requirements/REQ-0125-gate-profiles-schemas-to-core/) **Completed**
  - **Completed:** 2026-03-21
- [x] #190 Skill injection planner [github: GH-190] → `REQ-0126` -> [requirements](docs/requirements/REQ-0126-skill-injection-planner/) **Completed**
  - **Completed:** 2026-03-22
- [x] #191 Provider routing shared service [github: GH-191] → `REQ-0127-provider-routing-shared-service/` -> [requirements](docs/requirements/REQ-0127-provider-routing-shared-service/) **Completed**
  - **Completed:** 2026-03-22

**Workstream C — Provider Adapters**

- [x] #141 Claude parity tests for implementation loop slice [github: GH-141] → `REQ-0077-claude-parity-tests-implementation-loop/` -> [requirements](docs/requirements/REQ-0077-claude-parity-tests-implementation-loop/) **Completed**
  - **Completed:** 2026-03-21
- [x] #142 Codex adapter for implementation loop slice [github: GH-142] → `REQ-0078-codex-adapter-implementation-loop/` -> [requirements](docs/requirements/REQ-0078-codex-adapter-implementation-loop/) **Completed**
  - **Completed:** 2026-03-21
- [x] #151 Create src/providers/claude/ adapter boundary [github: GH-151] → `REQ-0087-claude-adapter-boundary/` -> [requirements](docs/requirements/REQ-0087-claude-adapter-boundary/) **Completed**
  - **Completed:** 2026-03-22
- [x] #153 Provider-aware installer/updater/doctor/uninstaller [github: GH-153] → `REQ-0089-provider-aware-installer/` -> [requirements](docs/requirements/REQ-0089-provider-aware-installer/) **Completed**
  - **Completed:** 2026-03-22
- [x] #159 Impact analysis team port to shared orchestration [github: GH-159] → `REQ-0095` -> [requirements](docs/requirements/REQ-0095-impact-analysis-team-port/) **Completed**
  - **Completed:** 2026-03-22
- [x] #160 Tracing team port to shared orchestration [github: GH-160] → `REQ-0096` -> [requirements](docs/requirements/REQ-0096-tracing-team-port/) **Completed**
  - **Completed:** 2026-03-22
- [x] #161 Quality loop team port to shared orchestration [github: GH-161] → `REQ-0097` -> [requirements](docs/requirements/REQ-0097-quality-loop-team-port/) **Completed**
  - **Completed:** 2026-03-22
- [x] #162 Debate team orchestration pattern [github: GH-162] → `REQ-0098` -> [requirements](docs/requirements/REQ-0098-debate-team-orchestration-pattern/) **Completed**
  - **Completed:** 2026-03-22
- [x] #182 Parity verification suite [github: GH-182] → `REQ-0118` -> [requirements](docs/requirements/REQ-0118-parity-verification/) *(merged 00eade8)*
  - **Completed:** 2026-03-22

**Workstream D — Content Model**

- #137 [ ] Analyze lifecycle architecture decision [github: GH-137] → `REQ-0073-analyze-lifecycle-architecture-decision/` -> [requirements](docs/requirements/REQ-0073-analyze-lifecycle-architecture-decision/) **Analyzed**
  - Phase 0. **Decision: separate subsystem** (not WorkflowEngine). Analyze uses meta.json, build uses state.json — parallel execution preserved. ADR-CODEX-005. **Unblocks Phases 6-7.**
- #138 [ ] Content audit sizing confirmation [github: GH-138] → `REQ-0074-content-audit-sizing-confirmation/` -> [requirements](docs/requirements/REQ-0074-content-audit-sizing-confirmation/) **Analyzed**
  - Phase 0. **Actual: 325 files / 2.1 MB** (larger than estimated). 81% medium-effort templated work (skills + structured agents). Hard work in ~23 files (discover, commands, orchestrators).

**Workstream E — Discover & Analyze**

- #167 [x] Discover execution model design [github: GH-167] → `REQ-0103` -> [requirements](docs/requirements/REQ-0103-discover-execution-model/) *(merged e16e18b)*
- #168 [x] Discover interactive UX layer [github: GH-168] → `REQ-0104` -> [requirements](docs/requirements/REQ-0104-discover-interactive-ux/) *(merged e16e18b)*
- #169 [x] Discover state/resume implementation [github: GH-169] → `REQ-0105` -> [requirements](docs/requirements/REQ-0105-discover-state-resume/) *(merged e16e18b)*
- #170 [x] Project skill distillation preservation [github: GH-170] → `REQ-0106` -> [requirements](docs/requirements/REQ-0106-project-skill-distillation/) *(merged e16e18b)*
- #171 [x] Discover cache and projection refresh [github: GH-171] → `REQ-0107` -> [requirements](docs/requirements/REQ-0107-discover-cache-projection/) *(merged e16e18b)*
- #172 [x] Analyze lifecycle implementation [github: GH-172] → `REQ-0108` -> [requirements](docs/requirements/REQ-0108-analyze-lifecycle/) *(merged 6949155)*
  - **Completed:** 2026-03-22
- #173 [x] Roundtable confirmation state machine [github: GH-173] → `REQ-0109` -> [requirements](docs/requirements/REQ-0109-roundtable-state-machine/) *(merged 6949155)*
  - **Completed:** 2026-03-22
- #174 [x] Artifact readiness and write strategy [github: GH-174] → `REQ-0110` -> [requirements](docs/requirements/REQ-0110-artifact-readiness/) *(merged 6949155)*
  - **Completed:** 2026-03-22
- #175 [x] Memory layering — user/project/session [github: GH-175] → `REQ-0111` -> [requirements](docs/requirements/REQ-0111-memory-layering/) *(merged 6949155)*
  - **Completed:** 2026-03-22
- #176 [x] Analyze finalization path [github: GH-176] → `REQ-0112` -> [requirements](docs/requirements/REQ-0112-analyze-finalization/) *(merged 6949155)*
  - **Completed:** 2026-03-22
- #177 [x] Inference tracking and depth sensing [github: GH-177] → `REQ-0113` -> [requirements](docs/requirements/REQ-0113-inference-depth-sensing/) *(merged 6949155)*
  - **Completed:** 2026-03-22

**Workstream F — Verification**

- [x] #183 Golden fixture test suite [github: GH-183] → `REQ-0119` -> [requirements](docs/requirements/REQ-0119-golden-fixture-suite/) *(merged 00eade8)*
  - **Completed:** 2026-03-22
- [x] #184 State migration verification [github: GH-184] → `REQ-0120` -> [requirements](docs/requirements/REQ-0120-state-migration-verification/) *(merged 00eade8)*
  - **Completed:** 2026-03-22
- [x] #185 Performance validation [github: GH-185] → `REQ-0121` -> [requirements](docs/requirements/REQ-0121-performance-validation/) *(merged 00eade8)*
  - **Completed:** 2026-03-22
- [x] #186 Provider support matrix [github: GH-186] → `REQ-0122` -> [requirements](docs/requirements/REQ-0122-provider-support-matrix/) *(merged 00eade8)*
  - **Completed:** 2026-03-22

**Dependency Summary**

```
Phase 0 (Gate: must complete first)
  REQ-0070 (capability audit) ──┬──> REQ-0071 (governance) ──> REQ-0088 (enforcement layering)
                                ├──> REQ-0072 (Antigravity)    REQ-0117 (Codex checkpoints)
                                ├──> REQ-0073 (analyze decision) ──> Phases 6-7
                                └──> REQ-0123 (dual-provider)
  REQ-0074 (content sizing) ──────> Workstream D (Phases 5+)
  REQ-0075 (module system) ───────> Phase 1+

Phase 1 (Vertical Spike)
  REQ-0076 (spike) ──> REQ-0077 (Claude parity) ──> REQ-0078 (Codex adapter)

Phase 2 (Core Foundations)
  REQ-0079 (scaffold) ──> REQ-0080 (StateStore) ──┬──> REQ-0081 (Validator)
                                                   ├──> REQ-0082 (Workflow)
                                                   ├──> REQ-0083 (Backlog)
                                                   └──> REQ-0085 (common.cjs)

Phase 3 (Claude Adapter + Hooks)
  REQ-0087 (Claude adapter) ──> REQ-0088-0093 (enforcement + hooks + dispatchers)
  REQ-0089 (provider-aware installer)
  REQ-0127 (provider routing)

Phase 4 (Direct-Fit Teams)
  REQ-0094 (team spec) ──> REQ-0095-0097 (impact/tracing/quality ports)
                       ──> REQ-0126 (skill injection)

Phase 5 (Debate + Content)
  REQ-0098 (debate pattern)
  REQ-0099-0102 (agent/skill/command/topic decomposition)

Phase 6 (Discover)
  REQ-0103 (model) ──> REQ-0104-0107 (UX, state, skills, cache)

Phase 7 (Analyze/Roundtable)
  REQ-0108 (lifecycle) ──> REQ-0109-0113 (confirmation, readiness, memory, finalize, inference)

Phase 8 (Codex Adapter)
  REQ-0114 (codex adapter) ──> REQ-0115-0117 (install, projection, checkpoints)

Phase 9 (Verification)
  REQ-0118-0122 (parity, fixtures, migration, performance, matrix)

Phase 10 (Provider-Neutral Orchestration)
  REQ-0128 (ProviderRuntime interface) ──> REQ-0129-0133 (orchestrators, parallel)
                                      ──> REQ-0134 (Claude runtime)
                                      ──> REQ-0135 (Codex runtime)
  REQ-0129-0133 + REQ-0134-0135 ──> REQ-0136 (instruction generation)
  REQ-0136 ──> REQ-0137 (unified CLI)
```

**Workstream G — Provider-Neutral Orchestration**

- [x] #194 ProviderRuntime interface contract [github: GH-194] → `REQ-0128` -> [requirements](docs/requirements/REQ-0128-provider-runtime-interface/) **Completed**
  - **Completed:** 2026-03-22
- [x] #195 Provider-neutral phase-loop orchestrator [github: GH-195] → `REQ-0129` -> [requirements](docs/requirements/REQ-0129-phase-loop-orchestrator/) **Completed**
  - **Completed:** 2026-03-22
- [x] #196 Provider-neutral fan-out orchestrator [github: GH-196] → `REQ-0130` -> [requirements](docs/requirements/REQ-0130-fan-out-orchestrator/) **Completed**
  - **Completed:** 2026-03-22
- [x] #197 Provider-neutral dual-track orchestrator [github: GH-197] → `REQ-0131` -> [requirements](docs/requirements/REQ-0131-dual-track-orchestrator/) **Completed**
  - **Completed:** 2026-03-22
- [x] #198 Provider-neutral discover orchestrator [github: GH-198] → `REQ-0132` -> [requirements](docs/requirements/REQ-0132-discover-orchestrator-core/) **Completed**
  - **Completed:** 2026-03-22
- [x] #199 Provider-neutral analyze orchestrator [github: GH-199] → `REQ-0133` -> [requirements](docs/requirements/REQ-0133-analyze-orchestrator-core/) **Completed**
  - **Completed:** 2026-03-22
- [x] #200 Claude ProviderRuntime adapter [github: GH-200] → `REQ-0134` -> [requirements](docs/requirements/REQ-0134-claude-runtime-adapter/) **Completed**
  - **Completed:** 2026-03-22
- [x] #201 Codex ProviderRuntime adapter [github: GH-201] → `REQ-0135` -> [requirements](docs/requirements/REQ-0135-codex-runtime-adapter/) **Completed**
  - **Completed:** 2026-03-22
- [x] #202 Provider instruction generation [github: GH-202] → `REQ-0136` -> [requirements](docs/requirements/REQ-0136-provider-instruction-generation/) **Completed**
  - **Completed:** 2026-03-22
- [x] #203 Unified CLI with provider auto-detection [github: GH-203] → `REQ-0137` -> [requirements](docs/requirements/REQ-0137-unified-cli/) **Completed**
  - **Completed:** 2026-03-22

## Completed

### 2026-03-27
- [x] #213: Contract enforcement must be inline (during execution), not post-phase -> [requirements](docs/requirements/REQ-GH-213-contract-enforcement-must-be-inline/) *(merged 9e42608)*
  - **Completed:** 2026-03-27

### 2026-03-26
- [x] #212: Task list consumption model for build phase agents -> [requirements](docs/requirements/REQ-GH-212-task-list-consumption-model-for-build-phase-agents/) *(merged 11b77b2)*
  - **Completed:** 2026-03-26
- [x] #208: Generate structured task breakdown artifact from analysis -> [requirements](docs/requirements/REQ-GH-208-generate-structured-task-breakdown-artifact/) *(merged c6bdd26)*
  - **Completed:** 2026-03-26
- [x] #118: Phase-work guard hook (Execution Contract System) -> [requirements](docs/requirements/REQ-0141-phase-work-guard-hook/) *(merged 1662ce2)*
  - **Completed:** 2026-03-26

### 2026-03-25
- [x] #206: Conversational enforcement via Stop hook -> [requirements](docs/requirements/REQ-0140-conversational-enforcement-stop-hook/) *(merged f533427)*
  - **Completed:** 2026-03-25
- [x] #205: Codex reserved verb routing for Add, Analyze, and Build -> [requirements](docs/requirements/REQ-0139-codex-reserved-verb-routing/) *(merged 1c5c086)*
  - **Completed:** 2026-03-25

### 2026-03-22
- [x] #202: Provider instruction generation -> [requirements](docs/requirements/REQ-0136-provider-instruction-generation/) *(merged a3af941)*
  - **Completed:** 2026-03-22
- [x] #203: Unified CLI with provider auto-detection -> [requirements](docs/requirements/REQ-0137-unified-cli/) *(merged a3af941)*
  - **Completed:** 2026-03-22
- [x] #200: Claude ProviderRuntime adapter -> [requirements](docs/requirements/REQ-0134-claude-runtime-adapter/) *(merged 3557a07)*
  - **Completed:** 2026-03-22
- [x] #201: Codex ProviderRuntime adapter -> [requirements](docs/requirements/REQ-0135-codex-runtime-adapter/) *(merged 3557a07)*
  - **Completed:** 2026-03-22
- [x] #195: Provider-neutral phase-loop orchestrator -> [requirements](docs/requirements/REQ-0129-phase-loop-orchestrator/) *(merged 1af5f13)*
  - **Completed:** 2026-03-22
- [x] #196: Provider-neutral fan-out orchestrator -> [requirements](docs/requirements/REQ-0130-fan-out-orchestrator/) *(merged 1af5f13)*
  - **Completed:** 2026-03-22
- [x] #197: Provider-neutral dual-track orchestrator -> [requirements](docs/requirements/REQ-0131-dual-track-orchestrator/) *(merged 1af5f13)*
  - **Completed:** 2026-03-22
- [x] #198: Provider-neutral discover orchestrator -> [requirements](docs/requirements/REQ-0132-discover-orchestrator-core/) *(merged 1af5f13)*
  - **Completed:** 2026-03-22
- [x] #199: Provider-neutral analyze orchestrator -> [requirements](docs/requirements/REQ-0133-analyze-orchestrator-core/) *(merged 1af5f13)*
  - **Completed:** 2026-03-22
- [x] #194: ProviderRuntime interface contract -> [requirements](docs/requirements/REQ-0128-provider-runtime-interface/) *(merged b3b02d2)*
  - **Completed:** 2026-03-22
- [x] #182: Parity verification suite -> [requirements](docs/requirements/REQ-0118-parity-verification/) *(merged 00eade8)*
  - **Completed:** 2026-03-22
- [x] #183: Golden fixture test suite -> [requirements](docs/requirements/REQ-0119-golden-fixture-suite/) *(merged 00eade8)*
  - **Completed:** 2026-03-22
- [x] #184: State migration verification -> [requirements](docs/requirements/REQ-0120-state-migration-verification/) *(merged 00eade8)*
  - **Completed:** 2026-03-22
- [x] #185: Performance validation -> [requirements](docs/requirements/REQ-0121-performance-validation/) *(merged 00eade8)*
  - **Completed:** 2026-03-22
- [x] #186: Provider support matrix -> [requirements](docs/requirements/REQ-0122-provider-support-matrix/) *(merged 00eade8)*
  - **Completed:** 2026-03-22
- [x] #178: Create src/providers/codex/ adapter -> [requirements](docs/requirements/REQ-0114-codex-adapter/) *(merged 71ab3a5)*
  - **Completed:** 2026-03-22
- [x] #179: Codex installation and doctor paths -> [requirements](docs/requirements/REQ-0115-codex-installer-doctor/) *(merged 71ab3a5)*
  - **Completed:** 2026-03-22
- [x] #180: Codex instruction projection service -> [requirements](docs/requirements/REQ-0116-codex-instruction-projection/) *(merged 71ab3a5)*
  - **Completed:** 2026-03-22
- [x] #181: Codex governance checkpoint integration -> [requirements](docs/requirements/REQ-0117-codex-governance-checkpoints/) *(merged 71ab3a5)*
  - **Completed:** 2026-03-22
- [x] #167: Discover execution model design -> [requirements](docs/requirements/REQ-0103-discover-execution-model/) *(merged e16e18b)*
  - **Completed:** 2026-03-22
- [x] #168: Discover interactive UX layer -> [requirements](docs/requirements/REQ-0104-discover-interactive-ux/) *(merged e16e18b)*
  - **Completed:** 2026-03-22
- [x] #169: Discover state/resume implementation -> [requirements](docs/requirements/REQ-0105-discover-state-resume/) *(merged e16e18b)*
  - **Completed:** 2026-03-22
- [x] #170: Project skill distillation preservation -> [requirements](docs/requirements/REQ-0106-project-skill-distillation/) *(merged e16e18b)*
  - **Completed:** 2026-03-22
- [x] #171: Discover cache and projection refresh -> [requirements](docs/requirements/REQ-0107-discover-cache-projection/) *(merged e16e18b)*
  - **Completed:** 2026-03-22
- [x] #163: Agent content decomposition — RoleSpec + RuntimePackaging -> [requirements](docs/requirements/REQ-0099-agent-content-decomposition/) *(merged b3c804e)*
  - **Completed:** 2026-03-22
- [x] #164: Skill content audit and decomposition -> [requirements](docs/requirements/REQ-0100-skill-content-audit/) *(merged b3c804e)*
  - **Completed:** 2026-03-22
- [x] #165: Command system decomposition -> [requirements](docs/requirements/REQ-0101-command-system-decomposition/) *(merged b3c804e)*
  - **Completed:** 2026-03-22
- [x] #166: Topic content classification -> [requirements](docs/requirements/REQ-0102-topic-content-classification/) *(merged b3c804e)*
  - **Completed:** 2026-03-22
- [x] #162: Debate team orchestration pattern -> [requirements](docs/requirements/REQ-0098-debate-team-orchestration-pattern/) *(merged cf0bfc9)*
  - **Completed:** 2026-03-22
- [x] #159: Impact analysis team port to shared orchestration -> [requirements](docs/requirements/REQ-0095-impact-analysis-team-port/) *(merged ced9b67)*
  - **Completed:** 2026-03-22
- [x] #160: Tracing team port to shared orchestration -> [requirements](docs/requirements/REQ-0096-tracing-team-port/) *(merged ced9b67)*
  - **Completed:** 2026-03-22
- [x] #161: Quality loop team port to shared orchestration -> [requirements](docs/requirements/REQ-0097-quality-loop-team-port/) *(merged ced9b67)*
  - **Completed:** 2026-03-22
- [x] #190: Skill injection planner -> [requirements](docs/requirements/REQ-0126-skill-injection-planner/) *(merged ced9b67)*
  - **Completed:** 2026-03-22
- [x] #153: Provider-aware installer/updater/doctor/uninstaller -> [requirements](docs/requirements/REQ-0089-provider-aware-installer/) *(merged 3da26cd)*
  - **Completed:** 2026-03-22
- [x] #154: Hook conversion — 9 core validator hooks to bridge-first delegation via core ESM validators. -> [requirements](docs/requirements/REQ-0090-hook-conversion-core-validators/) *(merged 0246662)*
  - **Completed:** 2026-03-22
- [x] #155: Hook conversion — 7 workflow guard hooks to bridge-first delegation via core engine rules. -> [requirements](docs/requirements/REQ-0091-hook-conversion-workflow-guards/) *(merged 0246662)*
  - **Completed:** 2026-03-22
- [x] #156: Hook conversion — 6 observability hooks to bridge-first delegation via core telemetry services. -> [requirements](docs/requirements/REQ-0092-hook-conversion-observability/) *(merged 0246662)*
  - **Completed:** 2026-03-22
- [x] #157: Dispatcher layer refactor — 5 dispatchers to core checkpoint routing with Claude-specific tool matching. -> [requirements](docs/requirements/REQ-0093-dispatcher-layer-refactor/) *(merged 0246662)*
  - **Completed:** 2026-03-22
- [x] #151: Create src/providers/claude/ adapter boundary — adapter-specific logic wrapping core services. -> [requirements](docs/requirements/REQ-0087-claude-adapter-boundary/) *(merged 43d4d09)*
  - **Completed:** 2026-03-22
- [x] #152: Implement enforcement layering protocol — 5-layer model, core validates, hooks verify evidence. -> [requirements](docs/requirements/REQ-0088-enforcement-layering-protocol/) *(merged 43d4d09)*
  - **Completed:** 2026-03-22
- [x] #191: Provider routing shared service — extract ~23 functions from provider-utils.cjs into src/core/providers/. -> [requirements](docs/requirements/REQ-0127-provider-routing-shared-service/) *(merged 43d4d09)*
  - **Completed:** 2026-03-22
- [x] #148: Extract search and memory service boundaries — src/core/search/ and src/core/memory/ service objects with bridge loaders. -> [requirements](docs/requirements/REQ-0084-extract-search-memory-boundaries/) *(merged ecc942b)*
  - **Completed:** 2026-03-22
- [x] #149: Decompose common.cjs — wire bridge delegates for validators, workflow, backlog to core modules. -> [requirements](docs/requirements/REQ-0085-decompose-common-cjs/) *(merged ecc942b)*
  - **Completed:** 2026-03-22
- [x] #150: Split three-verb-utils.cjs structural logic — wire 5 bridge functions to core/backlog modules. -> [requirements](docs/requirements/REQ-0086-split-three-verb-utils/) *(merged ecc942b)*
  - **Completed:** 2026-03-22

### 2026-03-21
- [x] #143: Create src/core/ scaffold — expanded scaffold with validators/, workflow/, skills/, search/, memory/, providers/, content/ stub modules. -> [requirements](docs/requirements/REQ-0079-create-src-core-scaffold/) *(merged 4c02e72)*
  - **Completed:** 2026-03-21
- [x] #144: Extract StateStore service — ~25 state functions from common.cjs + ~8 from state-logic.cjs into src/core/state/ ESM modules (paths, monorepo, validation, schema). Bridge-first CJS wrappers, 0 caller breakage. 62 new tests, 154 total core tests, 0 regressions. -> [requirements](docs/requirements/REQ-0080-extract-statestore-service/) *(merged 4c02e72)*
  - **Completed:** 2026-03-21
- [x] #188: State schema versioning and migration — schema_version field, forward migration, in-flight state preservation. -> [requirements](docs/requirements/REQ-0124-state-schema-versioning-migration/) *(merged 4c02e72)*
  - **Completed:** 2026-03-21
- [x] #145: Extract ValidatorEngine — gate-logic, profile-loader, gate-requirements (11 functions) to src/core/validators/ ESM modules. Bridge-first CJS wrappers, 0 caller breakage. -> [requirements](docs/requirements/REQ-0081-extract-validator-engine/) *(merged 609afbf)*
  - **Completed:** 2026-03-21
- [x] #146: Extract WorkflowRegistry and WorkflowEngine — workflow constants, registry, phase resolution (7 functions) to src/core/workflow/ ESM modules. -> [requirements](docs/requirements/REQ-0082-extract-workflow-registry-engine/) *(merged 609afbf)*
  - **Completed:** 2026-03-21
- [x] #147: Extract BacklogService and ItemStateService — slug, source-detection, item-state, backlog-ops, item-resolution, github (18 functions) to src/core/backlog/ ESM modules. -> [requirements](docs/requirements/REQ-0083-extract-backlog-itemstate-service/) *(merged 609afbf)*
  - **Completed:** 2026-03-21
- [x] #189: Gate profiles and JSON schemas to shared core — 3 profiles, 8 schemas, phase-ids to src/core/config/. -> [requirements](docs/requirements/REQ-0125-gate-profiles-schemas-to-core/) *(merged 609afbf)*
  - **Completed:** 2026-03-21
- [x] #142: Codex adapter for implementation loop slice. 14 parity tests, runner + 3 instruction files, codex adapter integration. -> [requirements](docs/requirements/REQ-0078-codex-adapter-implementation-loop/) *(merged a9f3ece)*
  - **Completed:** 2026-03-21
- [x] #141: Claude parity tests for implementation loop slice. 22 new parity tests (PT-09 through PT-30), 6 fixture files, 78 total tests passing, 0 regressions. Proves core + Claude == current via fixture-based parity for loop state, contracts, and state persistence. -> [requirements](docs/requirements/REQ-0077-claude-parity-tests-implementation-loop/) *(merged 4b0ff8e)*
  - **Completed:** 2026-03-21
- [x] #140: Vertical spike — implementation loop shared core slice. Creates src/core/ with ESM modules: teams/implementation-loop.js (Writer/Reviewer/Updater loop), state/index.js (StateStore), bridge/*.cjs (CJS interop), contracts/*.json (JSON Schema). 56 tests, 97.29% line coverage, 0 regressions. -> [requirements](docs/requirements/REQ-0076-vertical-spike-implementation-loop/) *(merged 7dafdce)*
  - **Completed:** 2026-03-21
- [x] #126: CodeBERT embedding non-functional — real BPE tokenizer, model downloader with retry/verification, analyze handler wired for hybrid search (embedSession/searchMemory), installer/updater/uninstaller embedding lifecycle. 48 new tests, TDD Red-Green in 3 iterations, 1582/1585 full suite (3 pre-existing). -> [requirements](docs/requirements/BUG-0056-codebert-embedding-non-functional-stub-tokenize/) *(merged 604c2a9)*
- [x] #127: Blast radius validator fails-open when coverage artifact missing — two-step flexible regex (FILE_ROW + CHANGE_TYPE_KEYWORDS), normalizeChangeType(), zero-file guard, agent prompt blast-radius sections. 90/90 tests (24 new), TDD Red/Green, 5/5 FRs, 15 ACs. -> [requirements](docs/requirements/BUG-0055-blast-radius-validator-fails-open-when-coverage-ar/) *(merged 5638e1c)*

### 2026-03-15
- [x] Roundtable memory vector DB migration — flat JSON to vector DB using existing embedding infrastructure. 4 new modules (memory-store-adapter, memory-embedder, memory-search, updated memory.js), 93 new tests (168 total), 91.72% line coverage, zero regressions. -> [requirements](docs/requirements/REQ-0064-roundtable-memory-vector-db-migration/) *(merged 861fd1b)*
- [x] Configurable session cache token budget — replace hardcoded limits with project-configurable token budget. Added readConfig() to common.cjs, dynamic budget allocation from .isdlc/config.json, updated rebuild-cache.js CLI. 32 new tests, 0 regressions. -> [requirements](docs/requirements/REQ-0067-configurable-session-cache-token-budget/) *(merged eac0bd0)*
- [x] #52: Coverage threshold discrepancy — intensity-aware coverage thresholds. Added resolveCoverageThreshold() to common.cjs with tiered enforcement (light: 60/50%, standard: 80/70%, epic: 95/85%). Updated test-watcher, profile-loader, gate-requirements-injector. 38 new tests, 211 total passing. -> [requirements](docs/requirements/bug-52-coverage-threshold/) *(merged 9ab14bf)*
- [x] #124: Inline roundtable analysis — eliminate subagent dispatch overhead. Removed subagent dispatch for roundtable analysis, executing inline to reduce overhead. 26 tests, all passing. -> [requirements](docs/requirements/REQ-0065-inline-roundtable-eliminate-subagent-overhead/) *(merged d479b2c)*

### 2026-03-13
- [x] #113: Roundtable memory layer — user + project memory backed by semantic search. MemoryManager class with user/project memory stores, semantic search via embedding similarity with BM25 fallback, memory lifecycle (add/update/archive/prune) with TTL and access tracking, privacy controls (PII scrubbing, export, selective deletion). 75 tests, 99.34% line coverage. -> [requirements](docs/requirements/REQ-0063-roundtable-memory-layer-user-project-memory/) *(merged 40df47e)*

### 2026-03-11
- [x] #119: Bug-aware analyze flow — inject Phase 02 tracing into analyze-fix path. Bug classification gate in analyze command, bug-gather analyst agent, fix handoff gate. Prompt-level markdown only (no JS code). 17 tests, 1274/1277 full suite (3 pre-existing). -> [requirements](docs/requirements/REQ-0061-bug-aware-analyze-flow-inject-phase-02-tracing-int/) *(merged 5febd79)*

### 2026-03-09
- [x] #103: Post-implementation change summary — structured diff report after phase 06. CJS script (change-summary-generator.cjs) with 13-function pipeline, dual output (change-summary.md + change-summary.json), 4-level requirement tracing, section-independent degradation. 59 tests (42 unit + 13 integration + 4 E2E), 90% coverage. *(merged 876c58b)*

### 2026-03-08
- [x] #105: Skill authoring scaffold — already implemented. Users say "add a new skill" for interactive creation/wiring. Slash commands: `skill add`, `wire`, `list`, `remove`. Removed from "Coming next" roadmap, added to README. *(closed as already-exists)*
- [x] #98 + #99: Workflow recovery — retry/redo current phase + rollback to earlier phase. 3 production files (workflow-retry.cjs, workflow-rollback.cjs, state-logic.cjs V8 exception), 79 tests (28 retry + 31 rollback + 12 V8 + 8 integration), 0 regressions. -> [requirements](docs/requirements/REQ-0051-workflow-recovery-retryredo-current-phase-without-/) *(merged b80d744)*
- [x] #114: Bulk file I/O MCP server — multi-file read/write in a single tool call to reduce round-trip overhead during artifact-heavy phases. 4 source modules (section-parser, lock-manager, file-ops, server), 104 tests (78 unit + 22 integration + 4 E2E), 91.53% line coverage. *(merged 7ba482b)*
- [x] #108a: Contributing personas — add domain-specific reviewers to roundtable (.isdlc/personas/). Split from #108. Contributing personas add observations without owning artifacts. -> [requirements](docs/requirements/REQ-0047-contributing-personas-roundtable-extension/) *(merged 4f614b4)*

### 2026-03-07
- [x] #100: Roundtable depth control — adaptive brief/standard/deep analysis. Dynamic depth sensing (FR-001), bidirectional adjustment (FR-002), inference tracking (FR-003), tiered assumption views (FR-004), scope recommendation (FR-005), --light deprecation (FR-006), topic file restructuring (FR-007). 31 prompt verification tests, 1277 total tests, 0 regressions. *(merged 13ddfa7)*

### 2026-03-06
- [x] Semantic search backend (REQ-0045) — Groups 1-6 complete. Chunking engine, embedding engine, VCS adapters, installer, CLI, Package Builder/Reader, Module Registry, MCP Server, Query Orchestrator, Package Security, Content Redaction Pipeline, iSDLC Search Backend, Distribution Adapters, Version Compatibility, Aggregation Pipeline, Cloud Embedding Adapters, Knowledge Base Pipeline, Discovery Integration. -> [requirements](docs/requirements/REQ-0045-semantic-search-backend/)

### 2026-03-03
- [x] REQ-0044: Indexed search backend — sub-second full-codebase queries for large codebases (promoted from REQ-0041 FR-013). *(merged eac5b62)*
- [x] #96: Migrate remaining 4 agents to Enhanced Search sections — upgrade-engineer, execution-path-tracer, cross-validation-verifier, roundtable-analyst. 39 tests, 0 regressions. *(merged 717d625)*
- [x] #95: Wire search abstraction layer into setup pipeline and migrate high-impact agents — setupSearchCapabilities(), CLI --search-backend flag, installer step 8, 6 agent migrations. 47 tests, 95.83% coverage. *(merged 9e09bbc)*
- [x] #34: Improve search capabilities for Claude effectiveness — search abstraction layer with backend registry (lexical, enhanced-lexical, structural/ast-grep), BM25-inspired ranking, query routing, graceful degradation. 180 tests, 96.59% coverage. *(merged 8356153)*

### 2026-02-27
- [x] #33: TOON format integration — adopt Token-Oriented Object Notation for agent prompts and state data to reduce token usage. Completed last week based on user confirmation.

### 2026-02-25
- [x] Project skills delivery_type changed from `context` to `instruction` — project skills from `/discover` now injected with "You MUST follow these guidelines" directive instead of passive background context. 1-line change in `discover-orchestrator.md` *(commit d9fb449)*.
- [x] CLAUDE.md consent message fix — replaced formulaic "Looks like you want to..." template with natural conversational guidance. Consent messages no longer parrot back the user's intent or describe internal workflow stages.
- [x] GH-91 scope expanded to "Unified SessionStart cache" — absorbed #84, #86, #89. Verified all acceptance criteria already met. Closed #91, #86, #89 on GitHub.

### 2026-02-24
- [x] REQ-0039 (#90): Replace 24h staleness discovery context injection with project skills — removed legacy state.json fallback from isdlc.md STEP 3d, updated discover-orchestrator.md to mark discovery_context as audit-only metadata, rewrote phase agent PRE-PHASE CHECK sections (01, 02, 03) to use delegation prompt/AVAILABLE SKILLS instead of state.json reading, updated orchestrator discovery context injection to SessionStart cache-only. 3178 tests passing, zero regressions. 7 files changed *(merged d0db4fe)*.
- [x] REQ-0038 (#89): Update external skills manifest schema with source field for unified skill management — added `reconcileSkillsBySource()` to common.cjs for source-aware skill reconciliation during discover workflow. Added source field defaulting in `loadExternalManifest()`. Updated discover-orchestrator.md and skills-researcher.md with reconciliation integration. 46 new tests, 157 total passing, zero regressions. 20 files changed, 2759 insertions, 61 deletions *(merged b4b0db4)*.
- [x] REQ-0037 (#88): Implement project skills distillation in discover orchestrator — added Section 9 "Project Skills Distillation" to discover-orchestrator.md that distills discovery artifacts into 4 reusable project skills (project-architecture, project-conventions, project-domain, project-test-landscape). Wired distillation into all 3 discovery flows (new, existing, reverse-engineer). Removed deprecated buildSessionCacheSkills() from common.cjs. Updated persona agents and roundtable-analyst with distillation handoff instructions. 3 new tests, zero regressions. 9 files changed, 417 insertions, 65 deletions *(merged 9ef92eb)*.
- [x] #49: GitHub Issues adapter — closed as redundant. Core gh CLI integration already covers linking, fetching, searching, closing, and creating issues (REQ-0034, BUG-0032). Formal adapter abstraction unnecessary.

### 2026-02-23
- [x] REQ-0001 (#91): Implement SessionStart hook for skill cache injection — new `inject-session-cache.cjs` SessionStart hook reads pre-assembled `.isdlc/skill-cache.md` once at session start, outputs to stdout for LLM context injection. Eliminates ~200+ static file reads per workflow. New `bin/rebuild-cache.js` CLI, `rebuildSkillCache()`/`getProjectSkills()`/`buildCacheContent()` APIs in common.cjs, wired into discover and skill management commands. Updated installer.js and updater.js for hook registration. 43 new tests, 3277 total, zero regressions. 34 files changed, 2538 insertions, 591 deletions *(merged 5e0bb0b)*.
- [x] BUG-0035 (#81, #82, #83): getAgentSkillIndex() schema mismatch, skill path resolution, test fixture alignment — rewrote getAgentSkillIndex() for dual-schema support (string arrays + object arrays), added dual-path resolution (.claude/skills/ + src/claude/skills/), updated test fixtures to match production manifest. 27 new TDD tests, 40/40 skill-injection tests, zero regressions. 3 files changed, 927 insertions *(merged ed07eb9)*.
- [x] BUG-0034 (#13): Jira updateStatus at finalize not implemented — replaced conceptual `updateStatus()` with concrete Atlassian MCP call chain (`getAccessibleAtlassianResources` -> `getTransitionsForJiraIssue` -> `transitionJiraIssue`) in `00-sdlc-orchestrator.md` and `isdlc.md`. Fixed field reference from `jira_ticket_id` to `external_id`/`source`. 80/80 spec tests, 3152/3162 regression tests, zero new failures. 2 production files changed, 20 insertions, 16 deletions *(merged e6cddd2)*.
- [x] #7: Phase A Jira ticket pull — added Atlassian MCP getJiraIssue integration to add/analyze/fix handlers in isdlc.md.
- [x] #11: BACKLOG.md completion marking — un-nested BACKLOG.md step from Jira sync in orchestrator finalize + added explicit sync section in isdlc.md STEP 4.
- [x] 3.7: Issue tracker integration during installation — prompt user to connect GitHub Issues or Jira for issue management, store preference in CLAUDE.md, and route analyze flow intake accordingly. -> [requirements](docs/requirements/REQ-0032-issue-tracker-integration-during-installation/)

### 2026-02-22
- [x] REQ-0034: Free-text intake reverse-lookup GitHub issues — added `checkGhAvailability()`, `searchGitHubIssues()`, `reverseMatchIssue()` to `three-verb-utils.cjs` + Step 3c-prime UX flow in `isdlc.md` for `/isdlc add` to auto-detect matching GitHub issues and offer linking or creation. 13 new tests, 306/306 passing, 96.83% coverage. 4 files changed, 367 insertions.
- [x] #65: gate-blocker blocks `/isdlc analyze` and `/isdlc add` during active workflows — added `analyze` and `add` to gate-blocker Skill exemption check in `gate-blocker.cjs`.
- [x] BUG-0028 (#64): Agents ignore injected gate requirements — refactored `gate-requirements-injector.cjs` to emit structured CRITICAL CONSTRAINTS block with `buildCriticalConstraints()` and `buildConstraintReminder()` APIs. Updated 4 agents (software-developer, integration-tester, quality-loop-engineer, roundtable-analyst) to parse and obey injected constraints. Fixed 3 pre-existing branch-guard test failures. 108/108 tests, 18 files changed, 1110 insertions, 247 deletions *(merged d7b42b9)*.
- [x] REQ-0032 (#63): Concurrent phase execution in roundtable analyze flow — replaced monolithic `roundtable-analyst.md` with multi-agent architecture: `roundtable-analyst.md` (lead orchestrator) + 3 persona agents (`persona-business-analyst.md`, `persona-solutions-architect.md`, `persona-system-designer.md`) running Phase 02-04 concurrently. 6 topic files under `analysis-topics/` replace 24 step files. Updated `isdlc.md` dispatch for new agent routing. 50 new tests (33 structural + 17 meta compat), zero regressions. 17 files changed, 1985 insertions, 614 deletions *(merged 1d741d3)*.
- [x] #22: Transparent Critic/Refiner at step boundaries (REQ-0035) — confirmation sequence state machine in roundtable-analyst.md Section 2.5. Sequential confirm-critic-refiner-accept flow at each analysis step boundary. 45 tests, 100% coverage on new code. *(merged d42237e)*
- [x] #80: Optimize analyze flow — parallelize and defer to cut first-message latency (REQ-0037). -> [requirements](docs/requirements/REQ-0037-optimize-analyze-flow-parallelize-defer/)

### 2026-02-21
- [x] #39: State.json pruning at workflow completion — 4 new pruning functions in `common.cjs` (`pruneSkillUsageLog`, `pruneCompletedPhases`, `pruneHistory`, `pruneWorkflowHistory`) + enforcer integration in `workflow-completion-enforcer.cjs`. Prunes stale/transient fields at workflow end, prevents unbounded state growth. 77 new tests, zero regressions. 2 files changed, 276 insertions *(merged f60f1cc)*.
- [x] #3: Framework file operations should not require user permission — added `Write(*/.isdlc/*)` and `Edit(*/.isdlc/*)` allow rules to `src/claude/settings.json`. Trivial tier, 1 tracked file changed *(commit 37a1501)*.

### 2026-02-20
- [x] #62: Stale pending_delegation marker expiry — added `STALENESS_THRESHOLD_MINUTES` to delegation-gate.cjs with auto-clearing of cross-session stale markers.
- [x] #21: Elaboration mode — multi-persona roundtable discussions in roundtable-analyst.md, elaboration records in meta.json, `elaborations[]` + `elaboration_config` in three-verb-utils.cjs. Built as part of #20 roundtable agent.
- [x] Feature A (#57 + #59): Analyze decisions — post-Phase-02 tier + sizing in analyze verb. `computeRecommendedTier()`, `parseSizingFromImpactAnalysis()`, `computeStartPhase()`/`deriveAnalysisStatus()` with light-skip awareness, trivial tier execution path, `-light` flag, sizing_decision in meta.json.
- [x] Feature B (#60 + #61): Build consumption — clean build-side consumption of pre-analyzed items (REQ-0031). #60: Split build init from phase execution. #61: Smart staleness check — blast-radius-aware git diff intersection, 3-tier response. -> [requirements](docs/requirements/gh-60-61-build-consumption-init-split-smart-staleness/) *(merged 5480c98)*
- [x] REQ-0027 (#20): Roundtable analysis agent with named personas — single-agent roundtable analyst with BA/Architect/Designer persona hats during analyze verb, step-file architecture, adaptive depth, resumable sessions *(GitHub #20, merged c02145b)*.
  - New `roundtable-analyst.md` agent (307 LOC, persona router + step orchestration), 24 step files under `src/claude/skills/analysis-steps/` (5 phases: quick-scan, requirements, impact-analysis, architecture, design), updated `three-verb-utils.cjs` for roundtable integration. 63 new tests, 2836/2840 full suite, zero regressions. 8 FRs, 5 NFRs, ~40 ACs. 35 files changed, 2146 insertions, 385 deletions.
- [x] BUG-0029-GH-18: Framework agents generate multiline Bash commands that bypass permission auto-allow rules — rewrite multiline Bash commands to single-line form across 10 agent files *(GitHub #18, merged 20e2edb)*.

### 2026-02-19
- [x] #51: Sizing decision always prompts the user — no silent fallback paths bypass user consent. Added `extractFallbackSizingMetrics()` + `normalizeRiskLevel()` to `common.cjs`, updated `isdlc.md` S1/S2/S3 paths to warn and prompt instead of silently defaulting, added audit trail fields to `applySizingDecision()`. 17 new tests, 88% coverage of new code, zero regressions. 6 FRs, 4 NFRs, 11 ACs. 7 files changed *(merged 3de5162)*.
- [x] #58: GitHub issue label sync — auto-label GitHub-sourced issues as they progress through the pipeline. Added analyze handler step 9 (`gh issue edit N --add-label ready-to-build` on analysis complete) and GitHub sync block in finalize (`gh issue close N` on build complete). Both non-blocking.
- [x] #18: Framework agents generate multiline Bash commands that bypass permission auto-allow rules — rewrite multiline Bash to single-line form across 10 agent files *(merged 20e2edb)*.
- [x] REQ-0025 (backlog 2.4): Performance budget and guardrail system — per-workflow timing limits, intensity-tier budgets, graceful degradation of debate rounds and fan-out parallelism, regression tracking, completion dashboard *(merged 3707b11)*.
  - New `performance-budget.cjs` library (581 LOC, 15 functions), timing instrumentation in 5 dispatchers + common.cjs, budget enforcement in isdlc.md phase-loop, regression tracking in workflow-completion-enforcer.cjs, workflows.json budget config. 38 new tests, zero regressions. 8 FRs, 5 NFRs, 35 ACs. 20 files changed, 1470 insertions, 242 deletions.
- [x] 16.5 (#23): Build auto-detection and seamless handoff (REQ-0026) — when user says "build X", auto-detect analysis completion level, offer to resume or start from current point, staleness check. -> [requirements](docs/requirements/REQ-0026-build-auto-detection-seamless-handoff/)

### 2026-02-18
- [x] REQ-0024: Gate requirements pre-injection — inject gate pass criteria into phase agent delegation prompts so agents know what hooks will check before they start, enabling first-pass success without retries *(GitHub #25, merged 8ca3d45)*.
  - New `gate-requirements-injector.cjs` utility (369 LOC, 7 internal helpers), STEP 3d GATE REQUIREMENTS INJECTION block in `isdlc.md`. Reads iteration-requirements.json, artifact-paths.json, constitution.md, workflows.json at delegation time. Fail-open on all error paths. 55 new tests, zero regressions. 6 FRs, 5 NFRs, 26 ACs.
- [x] BUG-0030-GH-24: Impact analysis sub-agents perform independent search instead of anchoring on quick scan *(GitHub #24, merged d9a5bd6)* (backlog 14.4).
  - Added independent Glob/Grep search directives to M1 (impact-analyzer), M2 (entry-point-finder), M3 (risk-assessor). Added Step 4c independent completeness verification to M4 (cross-validation-verifier) with `completeness_gap` finding category. 4 agent files modified, 1 new test file (17 tests), zero regressions.
- [x] #19: Three-verb backlog model (add/analyze/build) — unified command surface around three natural verbs, eliminated Phase A/B naming, redesigned intent detection and orchestrator backlog picker *(merged 7673354)*.
  - New `three-verb-utils.cjs` library (8 utility functions, 636 LOC), updated `isdlc.md` (add/analyze/build verb handlers), `00-sdlc-orchestrator.md` (backlog picker removal), `CLAUDE.md.template` (intent detection rewrite), `delegation-gate.cjs` + `skill-delegation-enforcer.cjs` (add/analyze exemptions). 126 new tests, zero regressions. 9 FRs, 6 NFRs, 44 ACs.
- [x] #14: Custom skill management — add, wire, and inject user-provided skills into workflows *(merged 06f6925)*.
  - New `skill-manager.md` agent, 6 utility functions in `common.cjs` (loadExternalSkill, validateSkillFrontmatter, registerExternalSkill, wireSkillToAgents, getExternalSkillsForPhase, formatExternalSkillBlock), STEP 3d injection in `isdlc.md`, intent detection in CLAUDE.md. 111 new tests, zero regressions. 9 FRs, 6 NFRs, 27 ACs.
- [x] #15: Built-in skills never injected into agent Task prompts — added getAgentSkillIndex() + formatSkillIndexBlock() to common.cjs, STEP 3d skill index injection, 52 agent files updated with ## Skills section. 40 new tests, zero regressions. 5 FRs, 5 NFRs, 7 ACs *(merged eeaae30)*.

### 2026-02-17
- [x] #55: Phase handshake audit — investigated state transitions, artifact passing, gate validation, pre-delegation state writes, post-phase updates. Verified no data loss or stale state between phase boundaries. *(REQ-0020, commit b9c5cb2)*
- [x] #16: artifact-paths.json filename mismatches — Phase 08 `review-summary.md` → `code-review-report.md`, Phase 01 fix workflow artifact validation disabled. 13 new tests, zero regressions. 2 bugs, 6 ACs, 3 NFRs *(merged b25fbdd)*.
- [x] BUG-0022-GH-1: /isdlc test generate declares QA APPROVED while project build is broken *(Gitea #1, merged 506d4de)*
  - Updated test-generate workflow from legacy pipeline (phases 11+07) to Phase 16 quality-loop. Added Build Integrity Check Protocol to quality-loop-engineer with language-aware build detection, mechanical auto-fix loop (max 3 iterations), honest failure reporting for logical issues. Added GATE-08 build integrity safety net. 39 new tests, zero regressions. 5 files modified + 1 new test file.
- [x] REQ-0021: T7 Agent prompt boilerplate extraction — extracted ROOT RESOLUTION, MONOREPO, SKILL OBSERVABILITY, SUGGESTED PROMPTS, and CONSTITUTIONAL PRINCIPLES protocols from 29 agent files into shared CLAUDE.md subsections. Agents now use 1-line references. ~3,600 lines removed, 113 lines added to CLAUDE.md. 29 agent files modified, 1 test file updated, zero regressions. 12 FRs, 6 NFRs.
- [x] #5: delegation-gate infinite loop on `/isdlc analyze` — missing carve-out for Phase A *(merged 27ae7cf)*
  - Added `EXEMPT_ACTIONS = new Set(['analyze'])` to `skill-delegation-enforcer.cjs` (primary fix) and `delegation-gate.cjs` (defense-in-depth). 22 new tests, zero regressions.
- [x] #4: Artifact path mismatch between agents and gate-blocker — no single source of truth *(merged b777cee)*
  - Created `artifact-paths.json` as single source of truth, corrected 4 mismatched paths in `iteration-requirements.json`, updated `gate-blocker.cjs`. 23 new tests, zero regressions.

### 2026-02-16
- [x] REQ-0020: T6 Hook I/O optimization — config file mtime caching, `getProjectRoot()` per-process cache, state-write-validator single-read consolidation, `ctx.manifest` passthrough. 3 production files, 46 new tests, zero regressions. 5 FRs, 4 NFRs, 19 ACs.
- [x] REQ-0019: Pre-analysis pipeline — `/isdlc analyze` and `/isdlc start` commands for pre-workflow requirements capture and consumption. Phase A Preparation Pipeline runs outside workflow machinery.
- [x] #1: Blast radius response bugs (Batch E bugs 0.17 + 0.18) — re-implementation targeting for unaddressed files + `tasks.md` cross-referencing. 66 new tests, zero regressions. 5 FRs, 3 NFRs, 19 ACs.
- [x] #2: Backlog picker pattern mismatch after BACKLOG.md restructure — strip `-> [requirements](...)` suffix. 26 new tests, zero regressions. 5 FRs, 3 NFRs, 19 ACs.
- [x] REQ-0018: Quality Loop true parallelism — explicit dual-Task spawning for Track A + Track B. 40 new tests, zero regressions. 7 FRs, 4 NFRs, 23 ACs.
- [x] REQ-0017: Fan-out/fan-in parallelism — shared fan-out engine (QL-012 skill). 46 new tests, zero regressions. 7 FRs, 4 NFRs, 35 ACs.

### 2026-02-15
- [x] BUG-0017: Batch C hook bugs — misleading artifact errors (0.9), version lock bypass (0.10). 137 new tests.
- [x] BUG-0009: Batch D tech debt — centralize phase prefixes, null checks, document detectPhaseDelegation(), remove dead code. 4 items.
- [x] BUG-0008: Batch B inconsistent hook behavior — phase index bounds, empty workflows fallback, supervised review. 20 new tests. 3 bugs, 17 ACs, 4 NFRs.
- [x] BUG-0007: Batch A gate bypass bugs — phase-status early-return, checkVersionLock() guards. 16 new tests. 3 bugs, 13 ACs, 3 NFRs.
- [x] BUG-0006: Batch B hook bugs — dispatcher null defaults, test-adequacy phase detection, menu tracker init, phase timeout hints. 48 new tests. 4 FRs, 3 NFRs, 21 ACs.
- [x] BUG-0004: Orchestrator overrides conversational opening. 17 new tests. 2 FRs, 2 NFRs, 9 ACs.
- [x] REQ-0016: Multi-agent Design Team (Phase 04) + Test Strategy Team (Phase 05). 175 new tests.
- [x] REQ-0017: Multi-agent Implementation Team (Phase 06). 86 new tests. 7 FRs, 4 NFRs, 34 ACs.
- [x] REQ-0015: Multi-agent Architecture Team (Phase 03) + IA cross-validation Verifier (Approach A). 120 new tests.
- [x] REQ-0014: Multi-agent Requirements Team (Phase 01). 90 new tests. 8 FRs, 5 NFRs, 28 ACs.
- [x] REQ-0013: Supervised mode — per-phase review gates. 88 new tests. 8 FRs, 6 NFRs, 35 ACs.
- [x] REQ-0008: Backlog management integration — Jira + Confluence. 72 new tests. 9 FRs, 5 NFRs, 22 ACs.
- [x] BUG-0015: branch-guard false positive after merge. 4 new tests.
- [x] BUG-0016: state-file-guard false positive on read-only Bash. 20 tests.
- [x] BUG-0017: Orchestrator exceeds `init-and-phase-01` scope. 20 tests.

### 2026-02-14
- [x] REQ-0016: Multi-agent Design Team. 87 new tests. 7 FRs, 4 NFRs, 34 ACs.
- [x] REQ-0015: Multi-agent Architecture Team. 87 new tests. 7 FRs, 4 NFRs, 30 ACs.
- [x] REQ-0014: Multi-agent Requirements Team. 90 new tests. 8 FRs, 5 NFRs, 28 ACs.
- [x] REQ-0008: Backlog management integration. 72 new tests. 9 FRs, 5 NFRs, 22 ACs.
- [x] REQ-0013: Supervised mode. 88 new tests. 8 FRs, 6 NFRs, 35 ACs.
- [x] BUG-0015: branch-guard false positive. 4 new tests.
- [x] BUG-0016: state-file-guard false positive. 20 tests.
- [x] BUG-0017: Orchestrator scope. 20 tests.

### 2026-02-13
- [x] BUG-0014: Early branch creation. 22 new tests.
- [x] REQ-0012: Invisible framework — CLAUDE.md rewrite. 49 tests, 28/28 ACs.
- [x] BUG-0013: Phase-loop-controller false blocks. 11 new tests.
- [x] BUG-0012: Premature git commits. 17 new tests.
- [x] REQ-0011: Adaptive workflow sizing. 3 intensities, `-light` flag.
- [x] BUG-0011: Subagent phase state overwrite — V8.

### 2026-02-12
- [x] BUG-0010: Orchestrator finalize stale tasks.
- [x] BUG-0009: Subagent state.json drift — optimistic locking V7.
- [x] REQ-0010: Blast radius coverage validation. 66 tests.
- [x] BUG-0008: Constitution validator false positive. detectPhaseDelegation() guard.
- [x] BUG-0007: Test watcher circuit breaker false positives.

### 2026-02-11
- [x] REQ-0009: Enhanced plan-to-tasks pipeline.
- [x] Split large files: installer.js + common.cjs.
- [x] npx and npm publishing.
- [x] REQ-0008: Update Node version — 18→20 minimum.
- [x] Add BMAD party mode for requirements.
- [x] Fix: `/isdlc start` only for new projects.

### 2026-02-10
- [x] REQ-0010: Performance optimization — T1/T2/T3.
- [x] REQ-0005: Workflow progress snapshots.

### 2026-02-09
- [x] Self-healing hook system. 917 total tests.

### 2026-02-08
- [x] Foreground task visibility and hook escalation.
- [x] Skill delegation enforcement hooks.
- [x] Reduce hook noise when no SDLC workflow active.
- [x] Rename hook files .js → .cjs for Node 24.
- [x] Claude Code detection and provider section.
- [x] Post-install tour → interactive guide.
- [x] Preserve uninstall.sh and update.sh during install.
- [x] Remove stale convert-manifest.sh.
- [x] REQ-0003: Formalize hooks API contract.
- [x] REQ-0005: Enforce advisory behaviors — 7 hooks.
- [x] REQ-0002: PowerShell scripts for Windows.

### 2026-02-07
- [x] Fix skill count discrepancy.
- [x] In-place update mechanism.
- [x] Post-discovery walkthrough (DE-002).
- [x] Clean handover /discover → /sdlc start (DE-003).
- [x] Remove --shallow from /discover (DE-004).
- [x] Review /discover UX (DE-005).
- [x] Extend /discover to markdown files (DE-001).

### 2026-02-06
- [x] Agent delegation validation in gate-blocker.
- [x] Wire discovery context into Phases 01-03.
- [x] Merge reverse-engineer into discover (37→36 agents).

### 2026-02-05
- [x] Refactor skills model: observability over ownership (v3.0.0).
- [x] Remove duplicate agent files.
- [x] Fix phase numbering consistency.
- [x] Bug report sufficiency check.

### 2026-02-04
- [x] Cross-platform npm package distribution.
- [x] Fix skills/agents consistency.
- [x] Create missing skill files for QS-*/IA-*.

### 2026-01-22 — 2026-01-23
- [x] Gates validation, test agent, iteration enforcement.
- [x] Article XI: Integration Testing Integrity.
- [x] Phase 5: Testing Infrastructure Setup.
- [x] skills.sh integration for Phase 3.
- [x] Cloud config moved to Phase 5.
- [x] Phase 1b: Test Automation Evaluation.
