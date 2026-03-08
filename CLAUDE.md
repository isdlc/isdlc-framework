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

Skill usage is logged for visibility. Agent name, skill ID, phase, and timestamp are appended to `.isdlc/state.json` → `skill_usage_log`. Cross-phase usage is allowed but flagged as `cross-phase-usage`.

### SUGGESTED PROMPTS — Phase Agent Protocol

Phase agents emit a `SUGGESTED NEXT STEPS` block after phase work completes. Resolution: read `active_workflow` from state.json → if next phase exists, primary prompt = `"Continue to {Phase NN - Name}"`; if last phase, prompt = `"Complete workflow and merge to main"`; if no active workflow, prompt = `"Show project status"`. Format: numbered list with primary prompt, agent-specific review option, and "Show workflow status".

### CONSTITUTIONAL PRINCIPLES Preamble

**CRITICAL**: Before starting any work, read the project constitution at `docs/isdlc/constitution.md`.

Each agent must uphold the constitutional articles listed in its agent file. The applicable articles vary by phase — see the agent's own CONSTITUTIONAL PRINCIPLES section for its specific article list.

### Root Resolution Protocol

Resolve the **project root** -- the directory containing `.isdlc/` -- before any other action.

1. Check if `.isdlc/` exists in CWD
2. If **not found**, walk up parent directories until `.isdlc/state.json` or `.isdlc/monorepo.json` is found
3. That directory becomes the **project root** for all `.isdlc/` and `.claude/` path references
4. Record the relative path from root to original CWD (used for monorepo project matching)
5. If not found in any parent, report framework not installed

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

**Do NOT run `git add`, `git commit`, or `git push` during phase work.** The orchestrator handles all git operations at workflow finalize.

### Single-Line Bash Convention

All Bash code blocks in agent/command markdown files MUST be a single command line. Claude Code's permission auto-allow globs don't match newlines — multiline commands trigger interactive prompts. Chain with `&&`, join pipes on one line, or extract to a script in `bin/`. Use single quotes for `node -e '...'` (double quotes cause zsh `!` expansion errors).

Agent files reference this convention with:
> See **Single-Line Bash Convention** in CLAUDE.md.

### Tool Call Efficiency

Minimize wall-clock time by maximizing parallel tool calls and avoiding unnecessary work.

**Reads — choose the right tool:**
- **Discovery and orientation**: Use `mcp__code-index-mcp__search_code_advanced` and `mcp__code-index-mcp__get_file_summary` first. Find which files matter, understand their structure, locate relevant symbols — all without reading full file contents. Don't read files speculatively; search semantically first, then read only what you need.
- **Editing prep**: Use `Read` when you need exact line content for `Edit` calls. Read all target files in a single parallel batch — if you need 6 files, read all 6 at once.
- Never re-read a file you already have in context unless it was modified since you last read it.

**Shell text processing:**
- Prefer dedicated tools (`Read` + parse, `Grep`) over shell commands (`awk`, `cut`, `sort`) for file content extraction.
- When shell text processing is genuinely the simplest option (e.g., piping CSV columns through `sort -u`), use it — permissions are pre-allowed for `awk`, `sort`, `cut`, `wc`, `head`, `tail`, `sed`.

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

### Important Conventions

- Each agent owns exactly ONE phase (1-to-1 mapping)
- Skills are logged for observability (primary agent documented, not enforced)
- Hooks enforce iteration requirements deterministically
- State tracked in `.isdlc/state.json` (gitignored)
