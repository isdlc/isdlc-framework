# Design Specification: Simplify /discover Command Menu

**ID**: REQ-0001
**Phase**: 04 - Design
**Generated**: 2026-02-08

---

## 1. File Change Specifications

### File 1: `src/claude/commands/discover.md`

#### Change 1.1: Replace menu block (Lines 20-40)

**Remove:**
```
[1] Discover (auto-detect) (Recommended)
    Auto-detect new vs existing project and run full analysis

[2] New Project Setup
    Force new project flow (define project, tech stack, constitution)

[3] Existing Project Analysis
    Force existing project analysis (architecture, tests, features)

[4] Scoped Analysis
    Focus on a specific domain, module, or endpoint

Enter selection (1-4):
```

**Replace with:**
```
[1] New Project Setup
    Define your project, select tech stack, and create constitution

[2] Existing Project Analysis (Recommended)
    Full codebase analysis with behavior extraction

[3] Chat / Explore
    Explore the project, discuss functionality, review backlog, ask questions

Enter selection (1-3):
```

Note: "(Recommended)" shown on [2] by default. The orchestrator will dynamically move it to [1] when no existing code is detected.

#### Change 1.2: Replace selection mapping table (Lines 42-49)

**Remove:**
```
| [1] | `/discover` (auto-detect) | Proceed to auto-detect flow (FAST PATH CHECK) |
| [2] | `/discover --new` | Skip detection, go directly to NEW PROJECT FLOW |
| [3] | `/discover --existing` | Skip detection, go directly to EXISTING PROJECT FLOW |
| [4] | `/discover --existing --scope ...` | Ask follow-up for scope type and target, then run EXISTING PROJECT FLOW with scope |
```

**Replace with:**
```
| [1] | `/discover --new` | Go directly to NEW PROJECT FLOW |
| [2] | `/discover --existing` | Go directly to EXISTING PROJECT FLOW |
| [3] | (no CLI equivalent) | Enter Chat / Explore conversational mode |
```

#### Change 1.3: Remove Option [4] follow-up paragraph (Line 51)

**Remove** the entire paragraph:
```
**Option [4] follow-up:** Ask for scope type (module/endpoint/domain) and target name, then proceed as if `--existing --scope {type} --target {name}` were provided.
```

#### Change 1.4: Update flags-provided guard (Line 53)

**Replace:**
```
**If any flags/options ARE provided** (`--new`, `--existing`, `--scope`, `--project`, etc.), skip this menu entirely and proceed directly to the appropriate flow.
```
**With:**
```
**If any flags/options ARE provided** (`--new`, `--existing`, `--project`, etc.), skip this menu entirely and proceed directly to the appropriate flow.
```

#### Change 1.5: Remove --scope, --target, --priority from options table (Lines 63-65)

**Remove these 3 rows:**
```
| `--scope {value}` | Analysis scope: `all`, `module`, `endpoint`, `domain` (default: all) |
| `--target {name}` | Target name (required when scope is module/endpoint/domain) |
| `--priority {value}` | Filter by risk priority: `all`, `critical`, `high`, `medium` (default: all) |
```

#### Change 1.6: Remove scope/target/priority examples (Lines 82-93)

**Remove these examples:**
```
# Focus on specific domain
/discover --scope domain --target "payments"

# Only critical paths (payment, auth, core business)
/discover --priority critical

# Analyze specific endpoint
/discover --scope endpoint --target "/api/users/register"
```

#### Change 1.7: Update implementation note (Line 170)

**Replace:**
```
3. The orchestrator presents the 4-option menu and waits for user selection before taking further action
```
**With:**
```
3. The orchestrator presents the 3-option menu and waits for user selection before taking further action
```

---

### File 2: `src/claude/agents/discover-orchestrator.md`

#### Change 2.1: Update NO-ARGUMENT MENU guard (Line 97)

**Replace:**
```
**CRITICAL**: When invoked via `/discover` with NO flags or options (no `--new`, `--existing`, `--scope`, `--target`, `--priority`, `--atdd-ready`, `--skip-tests`, `--skip-skills`, `--project`), present a discovery mode selection menu BEFORE proceeding to the FAST PATH CHECK.
```
**With:**
```
**CRITICAL**: When invoked via `/discover` with NO flags or options (no `--new`, `--existing`, `--atdd-ready`, `--skip-tests`, `--skip-skills`, `--project`), present a discovery mode selection menu BEFORE proceeding to the FAST PATH CHECK.
```

#### Change 2.2: Replace menu presentation (Lines 106-123)

**Remove entire old menu block. Replace with:**
```
╔══════════════════════════════════════════════════════════════╗
║  iSDLC Framework - Discovery Mode Selection                  ║
╚══════════════════════════════════════════════════════════════╝

Select a discovery mode:

[1] New Project Setup
    Define your project, select tech stack, and create constitution

[2] Existing Project Analysis {RECOMMENDED_BADGE}
    Full codebase analysis with behavior extraction

[3] Chat / Explore
    Explore the project, discuss functionality, review backlog, ask questions

Enter selection (1-3):
```

Where `{RECOMMENDED_BADGE}` is dynamically set:
- If existing code detected: show "(Recommended)" on [2]
- If no existing code: show "(Recommended)" on [1] instead

The orchestrator runs auto-detect (read `state.json` `project.is_new_project`) BEFORE rendering the menu to determine badge placement.

#### Change 2.3: Replace selection mapping table (Lines 125-132)

**Replace with:**
```
| Selection | Action |
|-----------|--------|
| [1] New Project | Skip FAST PATH CHECK, go directly to **NEW PROJECT FLOW** |
| [2] Existing Project | Skip FAST PATH CHECK, go directly to **EXISTING PROJECT FLOW** |
| [3] Chat / Explore | Enter **CHAT / EXPLORE MODE** (see below) |
```

#### Change 2.4: Remove Option [4] Follow-up section (Lines 134-151)

**Remove the entire section:**
```
#### Option [4] Follow-up

If the user selects Scoped Analysis, ask two follow-up questions:
... (entire block through line 151)
```

#### Change 2.5: Add Chat / Explore Mode section

**Insert new section after the selection mapping (before "FAST PATH CHECK"):**

```markdown
#### Chat / Explore Mode

When the user selects [3] Chat / Explore, enter a conversational mode:

**Behavior:**
- Answer questions about the project's codebase, architecture, and functionality
- Read and summarize existing discovery artifacts (discovery report, constitution, state.json) if they exist
- Read and discuss codebase files on demand
- Discuss project backlog (CLAUDE.md unchecked items, workflow history from state.json)
- Provide architectural explanations and code walkthroughs

**Constraints (STRICT):**
- DO NOT modify state.json
- DO NOT generate or modify the constitution
- DO NOT install skills
- DO NOT launch discovery sub-agents (D1-D8)
- DO NOT write any files

**Exit conditions:**
- User says "exit", "done", "back", or "back to menu"
- User invokes another command (/discover --new, /sdlc, etc.)

**On exit**, display:
```
Chat session ended. To run a full analysis, use:
  /discover --new       (new project)
  /discover --existing  (existing project)
Or run /discover again to see the menu.
```
```

---

### File 3: `src/claude/agents/discover/feature-mapper.md`

#### Change 3.1: Remove scope/target filtering note (Line 279)

**Remove:**
```
If `--scope` and `--target` were specified, narrow to matching targets only.
```

#### Change 3.2: Update command inventory example (Line 337)

**Replace:**
```json
"options": ["--existing", "--shallow", "--atdd-ready", "--scope", "--target", "--priority", "--project"],
```
**With:**
```json
"options": ["--existing", "--atdd-ready", "--project", "--skip-tests", "--skip-skills"],
```

(Also removes `--shallow` which was already removed per DE-004.)

---

## 2. Implementation Order

1. `src/claude/commands/discover.md` -- command definition (Changes 1.1-1.7)
2. `src/claude/agents/discover-orchestrator.md` -- orchestrator (Changes 2.1-2.5)
3. `src/claude/agents/discover/feature-mapper.md` -- sub-agent cleanup (Changes 3.1-3.2)

## 3. Verification Checklist

After implementation, verify with grep:

```bash
# OLD patterns that must NOT exist:
grep -r "auto-detect" src/claude/commands/discover.md        # Should find 0
grep -r "Scoped Analysis" src/claude/                        # Should find 0
grep -r "\[4\] Scoped" src/claude/                           # Should find 0
grep -r "\-\-scope" src/claude/commands/discover.md          # Should find 0
grep -r "\-\-target" src/claude/commands/discover.md         # Should find 0
grep -r "\-\-priority" src/claude/commands/discover.md       # Should find 0
grep -r "Enter selection (1-4)" src/claude/                  # Should find 0

# NEW patterns that MUST exist:
grep -r "Chat / Explore" src/claude/commands/discover.md     # Should find 1+
grep -r "Chat / Explore" src/claude/agents/discover-orchestrator.md  # Should find 1+
grep -r "Enter selection (1-3)" src/claude/                  # Should find 2
grep -r "CHAT / EXPLORE MODE" src/claude/agents/discover-orchestrator.md  # Should find 1

# PRESERVED patterns (reverse-engineer workflow):
grep -r '"scope"' .isdlc/config/workflows.json               # Should still exist
grep -r '"target"' .isdlc/config/workflows.json              # Should still exist
```
