# iSDLC Framework: Antigravity Compatibility Analysis

The iSDLC framework is currently deeply integrated with Claude Code's internal mechanics. Migrating it to Antigravity requires shifting from synchronous "hooks" to an asynchronous "Skill-centric" or "Agent-as-Hook" model.

## Key Compatibility Challenges

### 1. Hook System (The "Hardest" Part)
- **Claude Code**: Uses synchronous Node.js hooks (`.claude/hooks/*.cjs`) that intercept tool usage (e.g., `PreToolUse`, `PostToolUse`).
- **Antigravity**: Does not use external hook files. Enforcement must be moved into **Skills** or dedicated **Validator Agents** that are explicitly called as part of the orchestration flow.
- **Solution**: Convert `gate-blocker.cjs` and `state-write-validator.cjs` into Antigravity Skills that are invoked by the Orchestrator before/after state-modifying actions.

### 2. Environment & Context
- **Claude Code**: Relies on `CLAUDE_PROJECT_DIR` and specific paths like `.claude/skills/`.
- **Antigravity**: Uses workspace URIs and distinct artifact/brain directories.
- **Solution**: Update `lib/common.cjs` to detect Antigravity context (e.g., checking for workspace mappings or specific Antigravity environment indicators) and redirect file resolution from `.claude/` to `.antigravity/` (or equivalent framework config paths).

### 3. Tool Names & Input Formats
- **Claude Code**: Hooks filter for specific tool names like `Skill`, `Write`, and `Edit`.
- **Antigravity**: Uses different tool names (`write_to_file`, `replace_file_content`, `multi_replace_file_content`).
- **Solution**: Update the framework's internal dispatchers and validators to support Antigravity's tool schema.

### 4. Agent Orchestration
- **Claude Code**: Agents are defined as markdown files with specific frontmatter.
- **Antigravity**: Antigravity itself is an agentic assistant. The iSDLC hierarchy (Orchestrator -> Manager -> Skill Agent) can be ported directly, but the "prompt injection" and "context management" must be handled via Antigravity's native `task_boundary` and `notify_user` mechanisms.

## Deterministic Governance vs. Instructional Adherence

A key concern is the "Hard Enforcement" (no options for the LLM).

- **In Claude Code**: Enforcement is **External & Deterministic**. The hook runs *outside* the LLM's cognition. The LLM cannot "forget" or "bypass" it because the tool call is physically intercepted.
- **In Antigravity**: Enforcement becomes **Instructional & Script-Backed**.
    - **Instructional**: The Orchestrator's system prompt is its "Internal Constitution." It is instructed that it *cannot* proceed without a success signal.
    - **Script-Backed**: Instead of a "hook", we use a **Deterministic Validator Tool** (e.g., `isdlc validate-gate --phase 05`).
    - **The Gap**: An LLM *could* technically decide to ignore its instructions.
    - **The Fix**: To achieve Claude-level "hardness," the iSDLC framework for Antigravity should use **Tool-Wrapping**. Instead of the agent calling `write_to_file` to update `state.json`, it calls a custom `isdlc_update_state` tool (an MCP tool or a Skill script) that **internally** performs the validation before allowing the write.

### Moving from "Police at the Door" to "Embedded Logic"
The logic moves from the *interceptor* (the door) into the **Skill tools** themselves. If the agent wants to "Save Phase 05," the save tool internally checks for Phase 05 completion artifacts. If they are missing, the tool returns a failure, and the agent literally cannot update the state.

| Feature | Claude Code Implementation | Antigravity Requirement |
| :--- | :--- | :--- |
| **Strict Enforcement** | Pre/Post Tool Hooks (`.cjs`) | Validator Skills + Orchestrator-led Checks |
| **State Persistence** | `.isdlc/state.json` | Same, but with Antigravity-aware path resolution |
| **Skill Definition** | `.claude/skills/` | `.antigravity/skills/` (or root-level `/skills`) |
| **User Interaction** | Standard Stdout/Stdin | `notify_user` Tool + Task UI |
| **Context** | Single Directory | Workspace-aware (Multi-Root support) |

## Next Steps for Compatibility

1.  **Refactor Hooks**: Port the JS logic from `common.cjs` and the hooks directory into a set of standard Antigravity Skills.
2.  **Path Abstraction**: Update the framework to use a `PathResolver` that handles both Claude Code and Antigravity directory structures.
3.  **Tool Mapping**: Logic to map Claude's `Skill` tool calls to Antigravity's native toolset.
