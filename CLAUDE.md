@.isdlc/at-import-probe.md

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
| **Analyze** | analyze, think through, plan this, review requirements, assess impact, design this, prepare, broken, fix, bug, crash, error, wrong, failing, not working, 500 | `/isdlc analyze "<item>"` |
| **Build** | build, implement, create, code, develop, ship, make this, let's do this, refactor, redesign | `/isdlc build "<description>"` |
| **Upgrade** | upgrade, update, bump, version, dependency, migrate | `/isdlc upgrade "<target>"` |
| **Test run** | run tests, run the tests, check if tests pass, execute test suite | `/isdlc test run` |
| **Test generate** | write tests, add tests, add unit tests, generate tests, test coverage | `/isdlc test generate` |
| **Discovery** | set up, configure, initialize, discover, setup the project | `/discover` |
| **Skill mgmt** | add a skill, register skill, new skill, wire skill, bind skill, list skills, show skills, remove skill, delete skill | `/isdlc skill {subcommand}` |

**Disambiguation**: If the user's intent could match both Add and Analyze (e.g., "add and analyze this"), resolve to **Analyze** -- the analyze verb implicitly runs add first if the item does not yet exist. If the intent could match both Analyze and Build (e.g., "let's work on this"), resolve to **Build** if the item is already analyzed, otherwise **Analyze**. If truly ambiguous, ask a brief clarifying question.

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

- **Ambiguous intent**: If the intent is unclear, ask a brief clarifying question rather than guessing
- **Questions / exploration**: If the user asks questions, explores code, or seeks explanation -- respond normally. Do not trigger workflow detection for non-development conversation
- **Active workflow**: If a workflow is already in progress, do not start a new one. Inform the user and suggest they continue the current workflow or cancel it first
- **Refactor requests**: Treat refactoring as an Analyze intent (analyze first, then build)
- **Non-dev requests**: Requests like "explain this code", "what does this function do", or "help me understand" are not development tasks -- skip intent detection entirely

### Backward Compatibility

If the user has already invoked a slash command directly (e.g. `/isdlc build "..."`), execute it immediately without re-asking. Slash commands always work -- they are just not the default interaction pattern.

Note: `/isdlc fix` and `/isdlc feature` have been removed. If invoked, display a message directing the user to use `/analyze` and `/build` instead.

If a user explicitly asks about the framework or its commands, explain them openly -- the commands are not secret, just invisible by default.

### Visibility

Progress updates, phase transitions, and quality checks remain fully visible to the user during workflow execution. Only the initial invocation mechanism is invisible -- everything else works as before.

Do NOT implement changes directly without going through a workflow. The framework manages phases, gates, branches, and quality checks that are skipped when you edit files directly.

### Analysis Completion Rules

**CRITICAL — These are mandatory steps after every roundtable analysis:**

1. **Four-domain confirmation sequence**: ALWAYS present confirmations sequentially per domain — Requirements (Maya) → Architecture (Alex) → Design (Jordan) → Tasks — each with explicit Accept/Amend. NEVER collapse into a single combined confirmation. Produce the corresponding artifacts (requirements-spec.md, architecture-overview.md, module-design.md, tasks.md) BEFORE their respective confirmation prompts. Use the templates in `src/claude/hooks/config/templates/` for both confirmation presentation and artifact structure.

2. **Finalize after acceptance**: After the user accepts all four domain confirmations, the analyze handler finalizes meta.json, updates BACKLOG.md marker, and syncs GitHub labels (steps 7.8-9 of the analyze handler in `src/claude/commands/isdlc.md`). Do NOT just update meta.json manually.

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

### Hook Block Auto-Recovery Protocol

When a hook blocks your action (PreToolUse, PostToolUse, or notification), you MUST auto-recover without waiting for user input. Read the block message, understand the expected approach, and immediately retry with the correct method.

**Auto-recovery rules:**
1. **Read the block message carefully** — hooks always explain why the action was blocked and what to do instead
2. **Retry with the specified approach** — if the message says "use Write or Edit tools instead of Bash", immediately use Write/Edit
3. **Do NOT stop and ask the user** — hook blocks are guardrails, not decision points. The correct action is always specified in the message
4. **Do NOT retry the exact same blocked action** — that will be blocked again

**Common tool-level blocks and their recovery:**

| Hook | Block Signal | Auto-Recovery |
|------|-------------|---------------|
| `state-file-guard` | "BASH STATE GUARD" | Use Write/Edit tool to modify state.json instead of Bash |
| `branch-guard` | "COMMIT TO MAIN BLOCKED" | Switch to the feature branch before committing |
| `explore-readonly-enforcer` | "WRITE BLOCKED" | Do not write files during explore-mode agents |
| `state-write-validator` | Schema/version violation | Fix the state.json content to match the expected schema, then retry Write/Edit |
| `phase-sequence-guard` | "OUT-OF-ORDER PHASE DELEGATION" | Complete the current phase before delegating to the next |
| `delegation-gate` | Agent delegation blocked | Use the correct agent for the current phase |
| `tool-router` | "TOOL ROUTING" | Use the preferred tool named in the block message (e.g., `mcp__code-index-mcp__get_file_summary` instead of `Read`). The hook tells you exactly which tool to use — switch immediately. |

**CRITICAL**: When a hook blocks your action, read the response and act on the considerations it provides. The hook message is not a suggestion — it is an instruction. Do not ignore it and proceed with the original tool.

**Harness bug detection (REQ-0059):**

If a hook error is caused by a bug in the framework itself (not the user's code), follow this protocol:
1. **Identify the bug** — the error originates from `src/claude/hooks/`, or framework config files
2. **Inform the user** — explain that this is a framework bug, not their code
3. **Suspend the active workflow** — use `--interrupt` to suspend and start a fix workflow:
   ```
   /isdlc fix --interrupt "Fix <description>"
   ```
4. **Fix the bug** through the normal fix workflow (requirements → tracing → test strategy → implementation → quality loop → code review)
5. **Finalize the fix** — `workflow-finalize.cjs` automatically restores the suspended workflow with phase iteration reset
6. **Resume the original workflow** — the user continues where they left off

**Constraints**: Only fix workflows can interrupt. Max 1 level of suspension depth (no nested interrupts).

**Escalate to user ONLY when:**
- The block message does not specify a recovery action
- You have already retried the alternative and it was also blocked
- The recovery requires a user decision (e.g., choosing between options)

Agent files reference this protocol with:
> See **Hook Block Auto-Recovery Protocol** in CLAUDE.md.

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

This is the iSDLC (Intelligent Software Development Lifecycle) Harness for Claude Code.

### Key Files

- **Agents**: `src/claude/agents/` - 48 specialized agents
- **Skills**: `src/claude/skills/` - 240 skills across 17 categories
- **Hooks**: `src/claude/hooks/` - 26 runtime enforcement hooks
- **Config**: `src/claude/hooks/config/` - Skills manifest and iteration requirements
- **CLI**: `bin/isdlc.js` + `lib/` - Cross-platform npm package CLI
- **CI/CD**: `.github/workflows/` - GitHub Actions for testing and publishing

### Current Version

**0.1.0-alpha** - Initial public release

### Guides

- **Persona Authoring**: `docs/isdlc/persona-authoring-guide.md` - How to create, override, and configure roundtable personas

### Important Conventions

- Each agent owns exactly ONE phase (1-to-1 mapping)
- Skills are logged for observability (primary agent documented, not enforced)
- Hooks enforce iteration requirements deterministically
- State tracked in `.isdlc/state.json` (gitignored)
