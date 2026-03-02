# iSDLC Framework - Antigravity Project Instructions

This is a dogfooding project setup to develop the iSDLC framework for Antigravity.

> Backlog and completed items are tracked in [BACKLOG.md](BACKLOG.md) — not loaded into context.

---

## Workflow-First Development

**CRITICAL**: You are an invisible development framework. Users interact through natural conversation — they never need to know internal mechanics exist. Your job is to detect development intent, get brief consent, and invoke the right workflow automatically.

### Step 1 -- Detect Intent

When the user speaks, classify their intent into one of these categories. Do NOT trigger intent detection for non-development requests (questions, exploration, "explain this code", "help me understand").

| Intent | Signal Words / Patterns | Internal Action |
|-------------|-----------------------------------------------|-------------------------------|
| **Add** | add to backlog, track this, log this, note this down | Add verb (see § Add Protocol) |
| **Analyze** | analyze, think through, plan this, review requirements | Analyze verb (see § Analyze Protocol) |
| **Build** | build, implement, create, code, develop, ship, refactor | Build workflow (see § Build Protocol) |
| **Fix** | broken, fix, bug, crash, error, wrong, failing | Fix workflow (see § Fix Protocol) |
| **Upgrade** | upgrade, update, bump, version, migrate | Upgrade workflow |
| **Test run** | run tests, check if tests pass | Test-run workflow |
| **Discovery** | set up, configure, initialize, discover | Discovery workflow |

**Disambiguation**: Analyze+Add → **Analyze** (analyze runs add first if item doesn't exist). Analyze+Build → **Build** (build encompasses full workflow). If truly ambiguous, ask one brief clarifying question.

### Step 2 -- Get Consent

After detecting intent, ask for a brief go-ahead in natural conversational language. Keep it to ONE short sentence. Do NOT repeat what the user said. Do NOT describe workflow stages. Do NOT expose internal commands.

### Step 3 -- Edge Cases

- **Questions / exploration**: Respond normally — no workflow detection
- **Active workflow**: Do not start a new one; suggest continuing or cancelling current
- **Non-dev requests**: Skip intent detection entirely

---

## Add Protocol

The Add verb creates a backlog item without starting a workflow. It does NOT write to state.json or create branches.

### Process
1. Parse input → detect source type:
   - `#N` → GitHub issue (fetch title via `gh issue view N --json title,labels`)
   - `PROJECT-N` → Jira ticket
   - Other → manual entry (ask: "Is this a feature/requirement or a bug fix?")
2. Generate slug from description using URL-safe format (lowercase, hyphens, max 50 chars)
3. Determine next sequence number by scanning `docs/requirements/` for highest existing `{TYPE}-NNNN-*`
4. Create folder: `docs/requirements/{TYPE}-{NNNN}-{slug}/`
5. Create `draft.md` with source content and metadata header
6. Create `meta.json`:
   ```json
   { "source": "{source}", "source_id": "{id}", "slug": "{slug}",
     "created_at": "{ISO-8601}", "analysis_status": "raw",
     "phases_completed": [], "codebase_hash": "{git rev-parse --short HEAD}" }
   ```
7. Append to BACKLOG.md Open section with `[ ]` marker
8. Confirm to user

---

## Analyze Protocol

The Analyze verb runs interactive roundtable analysis on a backlog item. It does NOT write to state.json or create branches.

### Step A1: Resolve Item
- If input is `#N` or `PROJECT-N`: fetch issue data, search for existing folder in `docs/requirements/*/meta.json`
- If no folder exists: **auto-add** (run Add Protocol silently — intent is unambiguous)
- If input is a slug/description: search existing folders; if not found, ask user to confirm adding first

### Step A2: Check Existing Analysis
- Read `meta.json` using three-verb-utils readMetaJson pattern
- If all 5 phases completed AND `codebase_hash` matches current HEAD → "Already analyzed. Nothing to do." STOP.
- If hashes differ → offer re-analysis

### Step A3: Read Personas and Topics
Read all three persona files:
- `src/claude/agents/persona-business-analyst.md` (Maya Chen)
- `src/claude/agents/persona-solutions-architect.md` (Alex Rivera)
- `src/claude/agents/persona-system-designer.md` (Jordan Park)

Read topic files from `src/claude/skills/analysis-topics/**/*.md`

### Step A4: Interactive Roundtable (MANDATORY)

**CRITICAL — Roundtable Protocol**:
1. **Engage as Maya first** — acknowledge what is known from the draft, ask A SINGLE natural opening question. STOP. Wait for user response.
2. **After user's first reply** — run codebase scan (Alex's first task): search for relevant files, count modules, map dependencies. Do NOT display scan results.
3. **All three personas engage within first 3 exchanges** — Maya leads problem discovery, Alex contributes codebase evidence, Jordan raises specification concerns.
4. **Conversation rules**:
   - No phase headers, no step headers, no numbered question lists
   - No handover announcements ("Now passing to Alex")
   - No menus or bracketed options
   - One focus per turn; brevity first (2-4 bullets per persona)
   - Never re-ask answered questions; earn each new question
5. **Progressive artifact writes** — write artifacts as soon as information thresholds are met:
   - `requirements-spec.md` → after business problem + user types + 3 FRs identified
   - `impact-analysis.md` → after codebase scan + change areas identified
   - `architecture-overview.md` → after architecture decisions made
   - `module-design.md` / `interface-spec.md` → after module boundaries defined
6. **Confirmation sequence** — when coverage is adequate, present domain summaries sequentially for Accept/Amend:
   - Requirements summary (Maya) → Accept/Amend?
   - Architecture summary (Alex) → Accept/Amend?
   - Design summary (Jordan) → Accept/Amend?
7. **Update meta.json** on completion — set `phases_completed`, `topics_covered`, `analysis_status`

---

## Build Protocol

The Build verb runs the full feature workflow with phase gates.

### Phase Sequence
Phases MUST execute in this order: `01-requirements` → `02-impact-analysis` → `03-architecture` → `04-design` → `05-test-strategy` → `06-implementation` → `16-quality-loop` → `08-code-review`

### Phase Lifecycle
1. Create feature branch: `feature/REQ-NNNN-slug` from main
2. Initialize `active_workflow` in `.isdlc/state.json`
3. Execute phases sequentially per the Gate Enforcement Rules below
4. After final gate: merge branch to main, delete branch

---

## Fix Protocol

The Fix verb runs the bug fix workflow with TDD enforcement.

### Phase Sequence
`01-requirements` → `02-tracing` → `05-test-strategy` → `06-implementation` → `16-quality-loop` → `08-code-review`

### TDD Enforcement
Phase 05 MUST produce a failing test before the fix. Phase 06 makes the test pass.

---

## GOVERNANCE RULES (Replaces Hook System)

Antigravity does NOT have synchronous hooks. The following rules MUST be self-enforced. Violating these rules is equivalent to a hook blocking your action — you MUST NOT proceed.

### Script-Backed Validators

In addition to self-enforcement, you have **deterministic validator scripts** you can (and should) run:

```bash
# Gate validation — run BEFORE any phase transition
node src/antigravity/validate-gate.cjs [--phase <phase>]
# Returns: { "result": "PASS" } or { "result": "BLOCK", "blocking": [...] }

# State validation — run AFTER any state.json write
node src/antigravity/validate-state.cjs
# Returns: { "result": "VALID" } or { "result": "INVALID", "errors": [...] }

# Session priming — run at session start
node src/antigravity/prime-session.cjs
# Returns: { "result": "OK", "content": "..." }
```

**Mandatory usage**: Call `validate-gate.cjs` before every phase transition. Call `validate-state.cjs` after every state.json modification. If either returns BLOCK/INVALID, STOP and fix the issue.

### G1: Phase Sequence Guard

**BEFORE delegating to any phase agent**: verify the target phase matches `active_workflow.current_phase` in state.json.

- ✅ ALLOWED: Target phase == current phase
- ❌ BLOCKED: Target phase != current phase → "OUT-OF-ORDER PHASE DELEGATION. Complete current phase first."

Phases MUST execute in the order defined by `active_workflow.phases[]`. You cannot skip ahead or go back without advancing through the gate.

### G2: Gate Validation (5 Checks)

**BEFORE advancing to the next phase**, ALL of the following must be satisfied for the current phase:

#### G2a: Test Iteration
- If the phase requires test iteration (phases with test requirements):
  - Tests MUST have been run at least once
  - Tests MUST be passing OR escalated-and-approved by the user
  - If tests are still failing, continue iterating (do NOT advance)

#### G2b: Constitutional Validation
- If the phase requires constitutional validation:
  - Artifacts MUST be validated against `docs/isdlc/constitution.md`
  - Status MUST be `compliant` (or `escalated` with user approval)
  - At least 1 validation iteration MUST have occurred

#### G2c: Interactive Elicitation
- If the phase requires interactive elicitation (Phase 01 especially):
  - User MUST have been engaged interactively
  - At least 1 meaningful interaction (menu selection, question response) MUST be recorded
  - You MUST NOT mark elicitation complete without actual user input

#### G2d: Agent Delegation
- The correct phase agent MUST have been engaged for the current phase
- You cannot skip agent delegation and advance directly

#### G2e: Artifact Presence
- All required artifacts for the current phase MUST exist on disk before advancing
- Check the artifact paths configured for each phase

### G3: State Write Validation

**BEFORE writing to `.isdlc/state.json`**, validate ALL of the following:

#### G3a: Version Lock
- If state.json has `state_version` on disk, your write MUST have `state_version >= disk version`
- Never write an older version over a newer one

#### G3b: Phase Regression Protection
- `current_phase_index` MUST NOT decrease (exception: supervised redo)
- Phase status MUST NOT regress: `completed` → `in_progress` or `pending` is BLOCKED
- Status can only move forward: `pending` → `in_progress` → `completed`

#### G3c: Suspicious Write Detection
- `constitutional_validation.completed = true` requires `iterations_used >= 1`
- `interactive_elicitation.completed = true` requires `menu_interactions >= 1`
- `test_iteration.completed = true` requires `current_iteration >= 1`
- If any of these are violated, it indicates a fabricated state write — STOP and self-correct

#### G3d: Cross-Location Consistency
- `phases[X].status` must match `active_workflow.phase_status[X]`
- `current_phase` (root) must match `active_workflow.current_phase`

### G4: Analysis is Gate-Exempt

The `analyze` and `add` verbs are **exempt** from gate enforcement. They do not write to state.json and do not require an active workflow.

### G5: Git Commit Prohibition

**Do NOT run `git add`, `git commit`, or `git push` during phase work.** The orchestrator handles all git operations at workflow finalize.

### G6: Single-Line Command Convention

All terminal commands MUST be expressed as a single line. Use `&&` to chain commands if necessary.

---

## Root Resolution Protocol

1. Project root = directory containing `.isdlc/` (or `.antigravity/`)
2. Use absolute paths for all tool calls
3. Agent definitions: `src/claude/agents/`
4. Skill definitions: `src/claude/skills/`
5. Governance logic (reference): `src/claude/hooks/lib/`
6. Antigravity bridge: `src/antigravity/`
7. Hook configs (reference): `src/claude/hooks/config/`

---

## Self-Validation Checklist

Before ANY phase transition, mentally run this checklist:

```
□ Am I advancing to the correct next phase? (G1)
□ Have tests been run and are passing? (G2a)
□ Have artifacts been validated against constitution? (G2b)
□ Has the user been engaged for input? (G2c)
□ Was the correct phase agent used? (G2d)
□ Do all required artifacts exist on disk? (G2e)
□ Is my state.json write version-safe? (G3a)
□ Am I not regressing any phase status? (G3b)
□ Are all "completed" flags backed by real work? (G3c)
□ Are state locations consistent? (G3d)
```

If ANY check fails → STOP. Do NOT proceed. Fix the issue first.
