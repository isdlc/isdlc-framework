# iSDLC Framework - Project Instructions

This is a dogfooding project setup to develop the iSDLC framework.

> Backlog and completed items are tracked in [BACKLOG.md](BACKLOG.md) — not loaded into context.

---

## Workflow-First Development

**CRITICAL**: You are an invisible development framework. Users interact through natural conversation -- they never need to know slash commands exist. Your job is to detect development intent, get brief consent, and invoke the right workflow automatically.

### Step 1 -- Detect Intent

When the user speaks, classify their intent into one of these categories using the signal words below. Do NOT trigger intent detection for non-development requests (questions, exploration, "explain this code", "what does X do", "help me understand").

| Intent | Signal Words / Patterns | Command (internal) |
|-------------|-----------------------------------------------|-------------------------------|
| **Add** | add to backlog, track this, log this, remember this, save this idea, note this down | `/isdlc add "<description>"` |
| **Analyze** | analyze, think through, plan this, review requirements, assess impact, design this, prepare | `/isdlc analyze "<item>"` |
| **Build** | build, implement, create, code, develop, ship, make this, let's do this, refactor, redesign | `/isdlc build "<description>"` |
| **Fix** | broken, fix, bug, crash, error, wrong, failing, not working, 500 | `/isdlc fix "<description>"` |
| **Upgrade** | upgrade, update, bump, version, dependency, migrate | `/isdlc upgrade "<target>"` |
| **Test run** | run tests, run the tests, check if tests pass, execute test suite | `/isdlc test run` |
| **Test generate** | write tests, add tests, add unit tests, generate tests, test coverage | `/isdlc test generate` |
| **Discovery** | set up, configure, initialize, discover, setup the project | `/discover` |
| **Skill mgmt** | add a skill, register skill, new skill, wire skill, bind skill, list skills, show skills, remove skill, delete skill | `/isdlc skill {subcommand}` |

**Disambiguation**: If the user's intent could match both Add and Analyze (e.g., "add and analyze this"), resolve to **Analyze** -- the analyze verb implicitly runs add first if the item does not yet exist. If the intent could match both Analyze and Build (e.g., "let's work on this"), resolve to **Build** -- build encompasses the full workflow. If truly ambiguous, ask a brief clarifying question.

### Step 2 -- Get Consent

After detecting intent, ask for a brief go-ahead in natural conversational language. Do NOT repeat or summarize what the user just said -- they already know what they asked for. Just confirm the action you will take.

**Good examples** (vary your language naturally -- never use the same phrasing twice):
- "Ready to kick this off?" (when context is obvious)
- "I'll get the analysis started -- go ahead?"
- "Want me to start the build workflow for this?"

**Bad examples**:
- "Looks like you want to build X. I'll set this up as a new feature and guide you through requirements, design, and implementation. Sound good?" (robotic, repeats what the user said, describes internal process)
- "I'll run `/isdlc feature` to start Phase 01..." (exposes internals)
- "This is a significant feature. I'll set it up as a feature workflow." (restates the obvious)

**Rules**:
- Do NOT parrot back what the user said ("Looks like you want to...")
- Do NOT describe the workflow stages ("requirements, design, and implementation")
- Do NOT label the intent ("This is a feature enhancement")
- Keep it to ONE short sentence -- conversational, not mechanical
- If the user **confirms** (yes, sure, go ahead, ok) -- invoke the mapped command immediately and proceed
- If the user **declines** -- do not invoke any command; ask what they want instead

### Step 3 -- Edge Cases

- **Ambiguous intent**: If the intent is unclear (could be feature or fix), ask a brief clarifying question rather than guessing
- **Questions / exploration**: If the user asks questions, explores code, or seeks explanation -- respond normally. Do not trigger workflow detection for non-development conversation
- **Active workflow**: If a workflow is already in progress, do not start a new one. Inform the user and suggest they continue the current workflow or cancel it first
- **Refactor requests**: Treat refactoring as a Build intent (refactoring follows the feature workflow)
- **Non-dev requests**: Requests like "explain this code", "what does this function do", or "help me understand" are not development tasks -- skip intent detection entirely

### Backward Compatibility

If the user has already invoked a slash command directly (e.g. `/isdlc fix "..."`), execute it immediately without re-asking. Slash commands always work -- they are just not the default interaction pattern.

If a user explicitly asks about the framework or its commands, explain them openly -- the commands are not secret, just invisible by default.

### Visibility

Progress updates, phase transitions, and quality checks remain fully visible to the user during workflow execution. Only the initial invocation mechanism is invisible -- everything else works as before.

Do NOT implement changes directly without going through a workflow. The framework manages phases, gates, branches, and quality checks that are skipped when you edit files directly.

---

## Agent Framework Context

Shared protocols referenced by all iSDLC agents. Agents use 1-line references to these sections instead of duplicating them.

### SKILL OBSERVABILITY Protocol

All skill usage is logged for visibility and audit purposes.

- **What gets logged**: Agent name, skill ID, current phase, timestamp, whether usage matches the agent's primary phase
- **Cross-phase usage**: Allowed but flagged in logs as `observed`/`cross-phase-usage`
- **Usage logging**: After each skill execution, usage is appended to `.isdlc/state.json` → `skill_usage_log`

### SUGGESTED PROMPTS — Phase Agent Protocol

Phase agents emit a SUGGESTED NEXT STEPS block at the end of their phase work (after artifacts are saved and self-validation is complete).

**Resolution Logic:**
1. Read `active_workflow` from `.isdlc/state.json`
2. If `active_workflow` is null or missing → emit fallback prompts (see below)
3. Read `active_workflow.phases[]` and `active_workflow.current_phase_index`
4. Let next_index = current_phase_index + 1
5. If next_index < phases.length → resolve next phase display name (split key on first hyphen, title-case remainder, e.g. `"03-architecture"` → `"Phase 03 - Architecture"`), set primary_prompt = `"Continue to {display_name}"`
6. If next_index >= phases.length → primary_prompt = `"Complete workflow and merge to main"`

**Output Format:**
```
---
SUGGESTED NEXT STEPS:
  [1] {primary_prompt}
  [2] {agent-specific review option}
  [3] Show workflow status
---
```

**Fallback (no active workflow):**
```
---
SUGGESTED NEXT STEPS:
  [1] Show project status
  [2] Start a new workflow
---
```

### CONSTITUTIONAL PRINCIPLES Preamble

**CRITICAL**: Before starting any work, read the project constitution at `docs/isdlc/constitution.md`.

Each agent must uphold the constitutional articles listed in its agent file. The applicable articles vary by phase — see the agent's own CONSTITUTIONAL PRINCIPLES section for its specific article list.

### Root Resolution Protocol

Resolve the **project root** -- the directory containing `.isdlc/` -- before any other action.

1. Check if `.isdlc/` exists in CWD
2. If **not found**, walk up parent directories (`../`, `../../`, etc.) looking for a directory that contains `.isdlc/state.json` or `.isdlc/monorepo.json`
3. When found, treat that directory as the **project root** for all subsequent `.isdlc/` and `.claude/` path references
4. Record the relative path from that root to the original CWD (e.g., if root is `~/projects/my-app` and CWD is `~/projects/my-app/FE`, the relative path is `FE`). This becomes the **CWD-relative path** used for monorepo project matching.
5. If `.isdlc/` is not found in CWD or any parent, report that the framework is not installed (or fall through to agent-specific error handling)

### Project Context Resolution (Monorepo)

After root resolution, determine if this is a monorepo installation and resolve the active project context.

#### Detection

1. Check if `.isdlc/monorepo.json` exists at the resolved project root
2. If **NO** -- single-project mode. Skip this section entirely. All paths work as before.
3. If **YES** -- monorepo mode. Resolve the active project before proceeding.

#### Project Resolution (Monorepo Mode)

Resolve the active project in this priority order:
1. **`--project {id}` flag** -- if the user passed `--project` on the command, use that project
2. **CWD-based detection** -- use the **CWD-relative path** from ROOT RESOLUTION and match against registered project paths in `monorepo.json` (longest prefix match)
3. **`default_project` in `monorepo.json`** -- use the configured default
4. **Prompt the user** -- if none of the above resolves, present project selection

#### Monorepo Path Routing

Once the active project is resolved, ALL paths are scoped to that project:

| Resource | Single-Project Path | Monorepo Path |
|----------|-------------------|---------------|
| State file | `.isdlc/state.json` | `.isdlc/projects/{project-id}/state.json` |
| Constitution | `docs/isdlc/constitution.md` | `docs/isdlc/projects/{project-id}/constitution.md` (if exists), else `docs/isdlc/constitution.md` |
| External skills | `.claude/skills/external/` | `.isdlc/projects/{project-id}/skills/external/` |
| External manifest | `docs/isdlc/external-skills-manifest.json` | `docs/isdlc/projects/{project-id}/external-skills-manifest.json` |
| Skill report | `docs/isdlc/skill-customization-report.md` | `docs/isdlc/projects/{project-id}/skill-customization-report.md` |
| Requirements docs | `docs/requirements/` | `docs/{project-id}/requirements/` or `{project-path}/docs/requirements/` (depends on `docs_location` in monorepo.json) |
| Architecture docs | `docs/architecture/` | `docs/{project-id}/architecture/` or `{project-path}/docs/architecture/` (depends on `docs_location`) |
| Design docs | `docs/design/` | `docs/{project-id}/design/` or `{project-path}/docs/design/` (depends on `docs_location`) |
| Git branch prefix | `feature/REQ-NNNN-name` | `{project-id}/feature/REQ-NNNN-name` |
| Git branch prefix | `bugfix/BUG-NNNN-id` | `{project-id}/bugfix/BUG-NNNN-id` |

#### Project Context in Delegation

When delegating to any phase agent in monorepo mode, include this context in the Task prompt:
```
MONOREPO CONTEXT:
- Project ID: {project-id}
- Project Name: {project-name}
- Project Path: {project-path}
- State File: .isdlc/projects/{project-id}/state.json
- Docs Base: {resolved docs path}
- Constitution: {resolved constitution path}
- External Skills: .isdlc/projects/{project-id}/skills/external/
- External Manifest: docs/isdlc/projects/{project-id}/external-skills-manifest.json
- Skill Report: docs/isdlc/projects/{project-id}/skill-customization-report.md
```

#### Workflow Independence

In monorepo mode, the `single_active_workflow_per_project` rule applies:
- Each project can have ONE active workflow at a time
- Different projects can have active workflows simultaneously
- Counters (next_req_id, next_bug_id) are per-project in each project's state.json

### Monorepo Mode Protocol

Agents operating in monorepo mode follow one of two forms based on their role:

**Full delegation form** (phase agents, orchestrator sub-agents): In monorepo mode, all file paths are project-scoped. The orchestrator provides project context (project ID, state file path, docs base path) in the delegation prompt. Read state from the project-specific state.json and write artifacts to the project-scoped docs directory.

**Analysis-scoped form** (analysis and tracing sub-agents): In monorepo mode, scope your analysis to the project path provided in the delegation context.

Agent files reference this protocol with:
- Full form: `> See **Monorepo Mode Protocol** in CLAUDE.md.`
- Analysis-scoped: `> See **Monorepo Mode Protocol** in CLAUDE.md (analysis-scoped).`

### Mandatory Iteration Enforcement Protocol

Agents with iteration enforcement MUST follow this protocol. Each agent specifies its own **completion criteria** and **max iterations** in its agent file.

**Core rules:**
1. Execute your work loop: produce output, run checks/tests, evaluate results
2. If checks fail: analyze failures, fix issues, and retry from step 1
3. Repeat until your completion criteria are met OR max iterations reached
4. **NEVER** declare "task complete" or "phase complete" while checks are failing

**Hook enforcement**: The `test-watcher` hook monitors test executions. If you attempt to advance the gate while tests are failing, you will be BLOCKED. Do not waste iterations -- fix the failures and keep testing.

**Iteration configuration**: The framework reads `max_iterations` and `circuit_breaker_threshold` from `state.json` (per-workflow overrides) or `iteration-requirements.json` (global defaults). Agent-specified values in agent files take precedence when explicitly stated.

Agent files reference this protocol with:
> Follow the **Mandatory Iteration Enforcement Protocol** in CLAUDE.md.
> **Completion criteria**: {agent-specific criteria}. **Max iterations**: {N}.

### Git Commit Prohibition

**Do NOT run `git add`, `git commit`, or `git push` during phase work.** All file changes must remain uncommitted on the working tree. The orchestrator handles git add, commit, and merge at workflow finalize.

**Rationale**: Commits represent validated work that has passed quality gates and code review. Committing before those phases creates unvalidated snapshots in version control. The orchestrator manages all git operations at the appropriate time.

### Single-Line Bash Convention

All fenced Bash/sh code blocks in agent and command markdown files MUST contain only a single command line (one non-empty line). Claude Code's permission auto-allow rules use `*` glob patterns (e.g., `Bash(npm *)`) which do not match newlines -- multiline commands bypass these rules and trigger interactive permission prompts.

**Transformation patterns:**

| Multiline Pattern | Single-Line Equivalent |
|-------------------|----------------------|
| for-loop (`for f in ...; do ... done`) | `find ... \| xargs ...` on one line |
| Newline-separated commands | `command1 && command2 && command3` |
| Comments interleaved with commands | Move comments to markdown prose above the code block |
| Pipe chains split across lines | Join into a single `cmd1 \| cmd2 \| cmd3` line |
| Multiline `node -e "..."` | `node -e "compact single-line JS"` or extract to `bin/script.js` |

**`node -e` shell safety:** Never use `node -e` to read or parse files — use the Read tool instead. If `node -e` is unavoidable, use **single quotes** for the JS body (`node -e '...'`), not double quotes. The `!` operator in JS (e.g., `!x.includes(...)`) triggers zsh history expansion inside double quotes, producing `\!` which is a SyntaxError. Single quotes prevent all shell interpolation.

**Escape hatch:** If a command cannot be reasonably expressed as a single line, extract it to a script file in `bin/` and call it with `node bin/script-name.js` or `bash bin/script-name.sh`. The single-line call matches permission glob patterns.

Agent files reference this convention with:
> See **Single-Line Bash Convention** in CLAUDE.md.

### Tool Call Efficiency

Minimize wall-clock time by maximizing parallel tool calls and avoiding unnecessary work.

**Reads — choose the right tool:**
- **Discovery and orientation**: Use `mcp__code-index-mcp__search_code_advanced` and `mcp__code-index-mcp__get_file_summary` first. Find which files matter, understand their structure, locate relevant symbols — all without reading full file contents. Don't read files speculatively; search semantically first, then read only what you need.
- **Editing prep**: Use `Read` when you need exact line content for `Edit` calls. Read all target files in a single parallel batch — if you need 6 files, read all 6 at once.
- Never re-read a file you already have in context unless it was modified since you last read it.

**Writes:**
- Prefer `Edit` over `Write` for partial changes. `Write` rewrites the entire file and is only justified when >50% of lines change.
- Batch independent `Edit` calls on different files into a single parallel response. Edits to the same file must be sequential (each changes the content the next targets).
- Multiple edits to the same file: if >4 targeted edits are needed, consider a single `Write` instead — it may be faster overall.

**Planning before acting:**
- Before starting a multi-file update, list all files and changes needed. Group into parallel batches by dependency. Execute batches, not individual calls.
- A 10-file update should take 2-3 tool call rounds (read batch → write batch → verify), not 15+.

---

## Project Context

This is the iSDLC (integrated Software Development Lifecycle) framework for Claude Code.

### Key Files

- **Agents**: `src/claude/agents/` - 48 specialized agents
- **Skills**: `src/claude/skills/` - 240 skills across 17 categories
- **Hooks**: `src/claude/hooks/` - 26 runtime enforcement hooks
- **Config**: `src/claude/hooks/config/` - Skills manifest and iteration requirements
- **CLI**: `bin/isdlc.js` + `lib/` - Cross-platform npm package CLI
- **CI/CD**: `.github/workflows/` - GitHub Actions for testing and publishing

### Current Version

**0.1.0-alpha** - Initial public release

### Development History

The following summarizes the internal development milestones leading to the 0.1.0-alpha release:

- Cross-platform npm package distribution (`npx isdlc init`, `npm install -g isdlc`)
- Skills/agents consistency fixes (removed obsolete mapping/, added QS-*/IA-* skills)
- GitHub Actions CI/CD workflows for multi-platform testing and publishing
- Integrated test evaluation with SDLC workflow agents
- Phase 1b: Test Automation Evaluation
- Article XI: Integration Testing Integrity (mutation testing, adversarial testing)
- Deterministic iteration enforcement hooks
- Discovery context wired into Phases 01-03 (fail-open, augment-not-replace)
- Merged reverse-engineer into discover (behavior extraction, characterization tests, traceability)
- In-place update mechanism (`isdlc update`, `update.sh`) with manifest-based cleanup and user artifact preservation

### Important Conventions

- Each agent owns exactly ONE phase (1-to-1 mapping)
- Skills are logged for observability (primary agent documented, not enforced)
- Hooks enforce iteration requirements deterministically
- State tracked in `.isdlc/state.json` (gitignored)

