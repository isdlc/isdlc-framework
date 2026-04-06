## SDLC Orchestrator Command
Invoke the SDLC Orchestrator to coordinate software development lifecycle workflows.

### Usage
`/isdlc <action> [options]`

### Monorepo Support

When the project is a monorepo (`.isdlc/monorepo.json` exists), all commands accept a `--project {id}` flag to target a specific project. The orchestrator resolves the project root by walking up parent directories from CWD to find `.isdlc/`, so you can launch Claude from a sub-project directory (e.g., `cd FE && claude`) and it will find the framework at the monorepo root.

**Project resolution order** (when `--project` is not provided):
1. **CWD-based detection** — compute the relative path from the resolved project root to CWD, match against registered project paths in `monorepo.json` (longest prefix match)
2. **`default_project`** from `monorepo.json` — the configured default
3. **Interactive prompt** — if no project can be resolved, present selection menu

**Project subcommands:**
```
/isdlc project list                    — List all registered projects
/isdlc project add {id} {path}         — Manually register a project
/isdlc project scan                    — Auto-detect projects from scan_paths
/isdlc project select {id}             — Set default project
```

**Project flag on action commands:**
```
/isdlc feature "description" --project api-service
/isdlc fix "description" --project web-frontend
/isdlc status --project api-service
```

### No-Argument Behavior (Interactive Menu)

When `/isdlc` is invoked without any action, present a context-aware menu based on project state.

**Detection Logic:**
1. Check if `docs/isdlc/constitution.md` exists and is NOT a template. Template markers include:
   - `<!-- CONSTITUTION_STATUS: STARTER_TEMPLATE -->` (init script marker)
   - `## ⚠️ CUSTOMIZATION REQUIRED` section
   - `**Status**: ⚠️ NEEDS CUSTOMIZATION`
   - `[PROJECT_NAME]` or `[PROJECT NAME]` placeholders
   - `## Instructions` section
   - `(Customize This)` markers
   - `## Articles (Generic - Customize for Your Project)`
2. Check if `.isdlc/state.json` exists and has `current_phase` set (workflow in progress)
3. Check if this is a new or existing project

**Project Type Detection (Priority Order):**

1. **Primary: Check `state.json`** - Read `.isdlc/state.json` → `project.is_new_project`
   - If `is_new_project: true` → NEW project
   - If `is_new_project: false` → EXISTING project (or discovery completed)

2. **Fallback: File-based detection** (if `is_new_project` not set or state.json missing)
   An existing project is detected if ANY of these are found:
   - `src/` or `lib/` or `app/` directory exists
   - `package.json` exists (Node.js project)
   - `requirements.txt` or `pyproject.toml` exists (Python project)
   - `go.mod` exists (Go project)
   - `Cargo.toml` exists (Rust project)
   - `pom.xml` or `build.gradle` exists (Java project)
   - More than 5 source code files (`*.py`, `*.js`, `*.ts`, `*.go`, `*.rs`, `*.java`)

---

**SCENARIO 0: Monorepo detected, no project selected**

When `.isdlc/monorepo.json` exists but no `--project` flag was provided AND no `default_project` is set (or the default project is invalid):

```
╔══════════════════════════════════════════════════════════════╗
║  iSDLC Framework - Monorepo Project Selection                ║
╚══════════════════════════════════════════════════════════════╝

Monorepo detected with [N] registered projects.

Select a project to work with:

[1] api-service        — apps/api-service
[2] web-frontend       — apps/web-frontend
[3] shared-lib         — packages/shared-lib

Or manage projects:
[P] Scan for projects  — Auto-detect from scan_paths
[A] Add project        — Register a new project manually

Enter selection:
```

After selection, set `default_project` in `monorepo.json` and proceed to the appropriate scenario (1-4) for that project.

---

**SCENARIO 1: Constitution NOT configured + NEW project (is_new_project: true)**

```
╔══════════════════════════════════════════════════════════════╗
║  iSDLC Framework - New Project Setup                         ║
╚══════════════════════════════════════════════════════════════╝

Constitution Status: Not configured
Project Type: New project

Select an option:

[1] Run /discover (Recommended)
    Define your project, set up tech stack, and create constitution

[2] Edit constitution.md Manually
    Open docs/isdlc/constitution.md and customize the template yourself

Enter selection (1-2):
```

---

**SCENARIO 2: Constitution NOT configured + EXISTING project (is_new_project: false)**

```
╔══════════════════════════════════════════════════════════════╗
║  iSDLC Framework - Existing Project Setup                    ║
╚══════════════════════════════════════════════════════════════╝

Constitution Status: Not configured
Project Type: Existing codebase detected (Node.js, TypeScript)

Select an option:

[1] Run /discover (Recommended)
    Analyze codebase and auto-generate tailored constitution

[2] Edit constitution.md Manually
    Open docs/isdlc/constitution.md and customize the template yourself

Enter selection (1-2):
```

---

**SCENARIO 3: Constitution IS configured + No active workflow**

```
╔══════════════════════════════════════════════════════════════╗
║  iSDLC Framework - Ready                                     ║
╚══════════════════════════════════════════════════════════════╝

Constitution Status: Configured ✓
Workflow Status: No active workflow

What would you like to do?

[1] Add               — Add an item to the backlog
[2] Analyze           — Analyze a backlog item (roundtable)
[3] Build             — Implement an analyzed item
[4] Run Tests         — Execute existing automation tests
[5] Generate Tests    — Create new tests for existing code
[6] View Status       — Check current project status
[7] Upgrade           — Upgrade a dependency, runtime, or tool

Enter selection (1-7):
```

---

**SCENARIO 4: Constitution IS configured + Workflow IN PROGRESS**

```
╔══════════════════════════════════════════════════════════════╗
║  iSDLC Framework - In Progress                               ║
╚══════════════════════════════════════════════════════════════╝

Constitution Status: Configured ✓
Active Workflow: feature (Phase 03 - Design, 3/7 complete)
Active Agent: System Designer (Agent 03)

Select an option:

[1] Continue     — Resume current workflow (Recommended)
[2] Gate Check   — Validate current phase gate
[3] View Status  — Check detailed progress
[4] Escalate     — Escalate a blocker to human
[5] Cancel       — Cancel current workflow

Enter selection (1-5):
```

**Supervised review recovery check** (before presenting SCENARIO 4 menu):

1. Read `active_workflow.supervised_review` from state.json
2. If `supervised_review` exists AND `supervised_review.status` is `"reviewing"` or `"gate_presented"`:
   a. Display recovery banner:
      ```
      A review was in progress for Phase {NN} ({Phase Name}).
      Summary: .isdlc/reviews/phase-{NN}-summary.md

      [C] Continue to next phase
      [R] Show summary and review again
      ```
   b. Handle user response:
      - **[C] Continue**: Clear `supervised_review`, advance to next phase (proceed with standard SCENARIO 4 [1] Continue)
      - **[R] Review**: Display summary file content, then present "When ready, say 'continue'" and wait
3. If `supervised_review` exists AND `supervised_review.status` is `"redo_pending"`:
   a. Display: "A redo was in progress for Phase {NN}. The phase will be re-run."
   b. Proceed as if user selected [1] Continue (the phase-loop will re-run from the current phase)
4. If `supervised_review` does not exist: proceed to standard SCENARIO 4 menu (no change)

---

**After Selection Mapping:**

| Scenario | Option | Action |
|----------|--------|--------|
| 0 (Monorepo, no project) | [1-N] | Set selected project as default, proceed to scenario 1-4 |
| 0 (Monorepo, no project) | [P] | Execute `/isdlc project scan` |
| 0 (Monorepo, no project) | [A] | Prompt for project ID and path, execute `/isdlc project add` |
| 1 (New, no constitution) | [1] | Execute `/discover` (runs NEW PROJECT FLOW) |
| 1 (New, no constitution) | [2] | Display path to constitution.md and exit |
| 2 (Existing, no constitution) | [1] | Execute `/discover` (runs EXISTING PROJECT FLOW) |
| 2 (Existing, no constitution) | [2] | Display path to constitution.md and exit |
| 3 (Ready, no workflow) | [1] | Execute `/isdlc add` (prompts for description) |
| 3 (Ready, no workflow) | [2] | Execute `/isdlc analyze` (presents backlog picker) |
| 3 (Ready, no workflow) | [3] | Execute `/isdlc build` (presents analyzed items picker) |
| 3 (Ready, no workflow) | [4] | Execute `/isdlc test run` |
| 3 (Ready, no workflow) | [5] | Execute `/isdlc test generate` |
| 3 (Ready, no workflow) | [6] | Execute `/isdlc status` |
| 3 (Ready, no workflow) | [7] | Ask what to upgrade, then execute `/isdlc upgrade "<name>"` |
| 4 (Workflow active) | [1] | Resume current workflow at active phase |
| 4 (Workflow active) | [2] | Execute `/isdlc gate-check` |
| 4 (Workflow active) | [3] | Execute `/isdlc status` |
| 4 (Workflow active) | [4] | Prompt for issue description, then `/isdlc escalate` |
| 4 (Workflow active) | [5] | Execute `/isdlc cancel` |

---

### Shared Utilities

The following utility functions support the add, analyze, and build verbs. They are implemented
in `src/claude/hooks/lib/three-verb-utils.cjs` for testability.

- **generateSlug(description)**: Sanitizes a description to a URL-safe slug (lowercase, hyphens, max 50 chars). Returns "untitled-item" for empty input. This produces the description portion only — the full directory name is `{TYPE}-{NNNN}-{slug}` (composed by the add command).
- **detectSource(input, options?)**: Detects source type from input (#N -> github/GH-N, PROJECT-N -> jira, else manual). When `options` is provided with `issueTracker` and `jiraProjectKey` from the `## Issue Tracker Configuration` section in CLAUDE.md, bare numbers are routed to the configured tracker (e.g., `"1234"` with jira + PROJ -> `PROJ-1234`). Explicit patterns (#N, PROJECT-N) always win over options.
- **readMetaJson(slugDir)**: Reads and parses meta.json with legacy migration (phase_a_completed -> analysis_status + phases_completed).
- **writeMetaJson(slugDir, meta)**: Writes meta.json, deriving analysis_status from phases_completed, removing legacy fields.
- **deriveAnalysisStatus(phasesCompleted, sizingDecision?)**: 0 phases = "raw", 1-4 = "partial", 5 = "analyzed". When sizingDecision has effective_intensity "light" and light_skip_phases array, fewer phases qualify as "analyzed" (GH-57).
- **deriveBacklogMarker(analysisStatus)**: raw -> " ", partial -> "~", analyzed -> "A".
- **updateBacklogMarker(backlogPath, slug, newMarker)**: Updates the marker character for a slug in BACKLOG.md.
- **appendToBacklog(backlogPath, itemNumber, description, marker)**: Appends a new item to the Open section.
- **resolveItem(input, requirementsDir, backlogPath)**: Resolves user input to a backlog item using priority chain: exact slug, partial slug, item number, external ref, fuzzy match.
- **checkGhAvailability()**: Checks if `gh` CLI is installed and authenticated. Returns `{ available: true }` or `{ available: false, reason: "not_installed"|"not_authenticated" }`. Never throws. (REQ-0034)
- **searchGitHubIssues(query, options?)**: Searches GitHub issues via `gh issue list --search`. Returns `{ matches: [{number, title, state}], error?: string }`. Options: `{ limit, timeout }`. Never throws. (REQ-0034)
- **createGitHubIssue(title, body?)**: Creates a GitHub issue via `gh issue create`. Returns `{ number, url }` or null. Default body: "Created via iSDLC framework". Never throws. (REQ-0034)

---

### Actions

**test run** - Execute existing automation tests
```
/isdlc test run
```
1. Present test type selection: Unit, System, E2E (multi-select)
2. Initialize `active_workflow` with type `"test-run"` and phases `["11-local-testing", "07-testing"]`
3. Delegate to Integration Tester (Phase 06) with selected test types
4. Report results — does NOT fix failures (suggest `/isdlc fix` for each)

**test generate** - Create new tests for existing code
```
/isdlc test generate
```
1. Present test type selection: Unit, System, E2E (single-select)
2. Initialize `active_workflow` with type `"test-generate"` and phases `["05-test-strategy", "06-implementation", "16-quality-loop", "08-code-review"]`
3. Phase 05: Check for existing `test.skip()` scaffolds in `tests/characterization/` (from `/discover`). If found, use them as the test design basis and generate a `docs/isdlc/tasks.md` where each scaffold file becomes a Phase 06 task (one task per scaffold file, with `files:` pointing to the scaffold and `traces:` from the scaffold's AC references). If not found, analyze code and design test cases from scratch.
4. Phase 06: Write the test code. If tasks.md was generated from scaffolds in step 3, the Phase-Loop Controller uses task-level dispatch (REQ-GH-220) to implement each scaffold as a separate task. Otherwise, single-call delegation.
5. Phase 16: Run quality loop including build verification, test execution, and automated QA
6. Phase 08: Review test quality

**cancel** - Cancel the active workflow
```
/isdlc cancel
```
1. Check for active workflow (if none, inform user)
2. Prompt for cancellation reason (required)
3. If git branch is active: commit uncommitted work, checkout main, preserve branch
4. Collect workflow progress snapshots: call `collectPhaseSnapshots(state)` to capture phase-by-phase execution data before it is lost
5. Move workflow to `workflow_history` with status `"cancelled"`, reason, `phases` (copy of `active_workflow.phases`), `phase_snapshots`, and `metrics`
6. Clear `active_workflow` from state.json
7. Display cancellation confirmation (include branch preservation note if applicable)

**status** - Show current project status
```
/isdlc status
```
1. Read `.isdlc/state.json`
2. Report current phase, active agent, blockers, and progress
3. Show completed vs pending phases

**gate-check** - Validate current phase gate
```
/isdlc gate-check
```
1. Identify current phase from state
2. Run gate validation checklist
3. Report pass/fail with details
4. Check constitutional compliance

**advance** - Move to next phase (requires gate pass)
```
/isdlc advance
```
1. Validate current phase gate passes
2. Update state to next phase
3. Delegate to next phase agent

**delegate** - Assign task to specific agent
```
/isdlc delegate <agent-name> "task description"
```
Agents: requirements-analyst, solution-architect, system-designer, test-design-engineer, software-developer, integration-tester, qa-engineer, security-compliance-auditor, cicd-engineer, environment-builder, deployment-engineer-staging, release-manager, site-reliability-engineer

**escalate** - Escalate issue to human
```
/isdlc escalate "issue description"
```
1. Log escalation in state
2. Pause workflow
3. Present issue to user for resolution

**constitution** - Create or validate project constitution (for NEW projects)
```
/isdlc constitution
```
This command interactively creates a tailored constitution for new projects.

**Step 1: Gather Project Information**
- Prompt: "What is this project about?"
- Wait for user response with project description

**Step 2: Launch Parallel Research Agents**
After receiving the project description, launch 4 research agents IN PARALLEL using a single message with multiple Task tool calls:

```
┌──────────────────────────────────────────────────────────────┐
│  LAUNCHING PARALLEL RESEARCH                                 │
├──────────────────────────────────────────────────────────────┤
│  Agent 1: Best Practices Research                            │
│  Agent 2: Compliance Requirements Research                   │
│  Agent 3: Performance Benchmarks Research                    │
│  Agent 4: Testing Standards Research                         │
└──────────────────────────────────────────────────────────────┘
```

Launch these 4 agents simultaneously (in ONE message with 4 Task tool calls):

| Agent | Task | Search Queries |
|-------|------|----------------|
| **Best Practices** | Research industry best practices | "{project_type} best practices 2026", "{project_type} architecture patterns" |
| **Compliance** | Research compliance requirements | "{project_type} compliance requirements", "HIPAA/PCI-DSS/GDPR {project_type}" |
| **Performance** | Research performance benchmarks | "{project_type} performance benchmarks", "{project_type} SLA standards" |
| **Testing** | Research testing standards | "{project_type} testing best practices", "{project_type} test coverage standards" |

Each agent should:
1. Perform 2-3 WebSearches
2. Extract actionable recommendations
3. Return a structured summary with suggested articles

**Step 3: Collect Results**
Wait for all 4 agents to complete. Aggregate their findings into:
- Recommended domain-specific articles
- Suggested thresholds and requirements
- Compliance considerations

**Step 4: Generate Draft Constitution**
Create a draft with:
- All 10 universal articles (from template)
- Suggested domain-specific articles based on parallel research
- Customized thresholds from research findings

**Step 5: Interactive Article Review**
Walk through each article one by one:
- Display the article with research context
- Ask: "Keep this article as-is, modify it, or remove it?"
- If modify: Ask for specific changes
- Allow adding custom articles

**Step 6: Save and Validate**
Write final constitution to `docs/isdlc/constitution.md`

**Example Flow:**
```
> What is this project about?
User: "An e-commerce platform for selling handmade crafts with payment processing"

┌──────────────────────────────────────────────────────────────┐
│  LAUNCHING PARALLEL RESEARCH (4 agents)                      │
├──────────────────────────────────────────────────────────────┤
│  ◐ Best Practices: Researching e-commerce patterns...        │
│  ◐ Compliance: Researching PCI-DSS, GDPR requirements...     │
│  ◐ Performance: Researching e-commerce SLAs...               │
│  ◐ Testing: Researching e-commerce testing standards...      │
└──────────────────────────────────────────────────────────────┘

[All agents complete in ~10-15 seconds instead of ~40-60 seconds]

> Research complete! Based on findings, I recommend these articles:
  - Article XI: PCI-DSS Compliance (payment processing detected)
  - Article XII: Performance Requirements (p95 < 200ms for API)
  - Article XIII: Data Privacy (GDPR for customer data)
  - Article XIV: Accessibility (WCAG 2.1 for e-commerce)

> Let's review each article...
```


**upgrade** - Upgrade a dependency, runtime, framework, or tool
```
/isdlc upgrade "react"
/isdlc upgrade "typescript" --project api-service
/isdlc upgrade "node"
```
1. Validate constitution exists and is not a template
2. Check no active workflow (block if one exists, suggest `/isdlc cancel` first)
3. Initialize `active_workflow` in state.json with type `"upgrade"` and phases `["15-upgrade-plan", "15-upgrade-execute", "08-code-review"]`
4. **Validate test adequacy** — run the full test suite to confirm adequate coverage exists. If no tests exist, block the upgrade and recommend `/isdlc test generate` first. If coverage is below thresholds, warn the user and require explicit acceptance before proceeding.
5. Delegate to Upgrade Engineer (Phase 14) with `scope: "analysis"`:
   - Detect ecosystem and current version
   - Look up available versions from registry
   - Perform impact analysis (changelogs, codebase scan)
   - Generate migration plan ranked by risk
   - **Require user approval** before proceeding
6. After plan approval: create `upgrade/{name}-v{version}` branch from main
7. Delegate to Upgrade Engineer (Phase 14) with `scope: "execution"`:
   - Capture baseline test results
   - Execute migration steps with implement-test loop
   - Max iterations configurable (default: 10)
   - Circuit breaker: 3 identical failures → escalate
8. Delegate to QA Engineer (Phase 07) with `scope: "upgrade-review"` for code review
9. After GATE-07: merge branch to main, delete branch

---

**memory** - Manage roundtable memory (REQ-0063)
```
/isdlc memory compact           # Compact both user and project memory
/isdlc memory compact --user    # Compact user memory only
/isdlc memory compact --project # Compact project memory only
```
1. Parse subcommand: `compact` is the only supported action
2. Parse flags: `--user` (compact user memory only), `--project` (compact project memory only). Default: both.
3. Call `compact({ user, project, projectRoot, userMemoryDir })` from `lib/memory.js`
4. Display results:
   - For user: "Compacting user memory... Read {N} session records, Aggregated {N} topics, Wrote ~/.isdlc/user-memory/profile.json"
   - For project: "Compacting project memory... Read {N} session records, Aggregated {N} topics, Wrote .isdlc/roundtable-memory.json"
5. On error: display error message and exit with code 1
6. On success: display "Done."

---

**add** - Add a new item to the backlog
```
/isdlc add "Add payment processing"
/isdlc add "#42"
/isdlc add "JIRA-1250"
```
1. Does NOT require an active workflow -- runs inline
2. Does NOT write to state.json, does NOT create branches, does NOT invoke hooks
3. Parse input to identify source type using `detectSource(input, options)`:
   - **Read issue tracker preference**: Check the `## Issue Tracker Configuration` section in CLAUDE.md for `**Tracker**:`, `**Jira Project Key**:`, and `**GitHub Repository**:` values. Pass these as `options = { issueTracker, jiraProjectKey }` to `detectSource()`.
   - Bare numbers (e.g., `"1234"`) are routed based on the configured tracker preference. Explicit patterns (#N, PROJECT-N) always win.
   a. GitHub issue (`#N` pattern or bare number with github preference): source = "github", source_id = "GH-N".
      If pre-fetched issue data is provided (title, labels, body) from the analyze handler fast path,
      use the pre-fetched data instead of fetching. Otherwise:
      Fetch the issue title using `gh issue view N --json title,labels -q '.title'`.
      Check labels: if "bug" label present, item_type = "BUG", else item_type = "REQ".
   b. Jira ticket (`PROJECT-N` pattern or bare number with jira preference): source = "jira", source_id = input.
      If pre-fetched issue data is provided (issueData from the analyze handler fast path), use it instead of fetching. Otherwise:
      **Jira ticket fetch via Atlassian MCP** (BUG-0032):
      1. Check if Atlassian MCP is available. If Atlassian MCP is not available, log "Atlassian MCP not available. Provide Jira ticket details manually." and proceed with manual entry (ask user for summary and type).
      2. Call `getAccessibleAtlassianResources` to resolve cloudId. If multiple cloud instances are returned, use the first accessible resource (first result). If the call fails, log "Could not fetch Jira ticket {source_id}: {error}" and fall back to manual entry.
      3. Call `getJiraIssue(cloudId, source_id)` to fetch the ticket. Extract: `summary` (for slug via `generateSlug(summary)` instead of the raw PROJECT-N input), `description` (for draft content), `issuetype.name` (for type mapping), `priority.name`.
      4. Map issue type: if `issuetype.name` is "Bug", set item_type = "BUG", else set item_type = "REQ".
      5. On any error during fetch: log "Could not fetch Jira ticket {source_id}: {error}" and fall back to manual entry (ask user for summary and type).
      6. Use the fetched summary for `generateSlug()` (producing a descriptive slug instead of the raw ticket ID).
   c. All other input: source = "manual", source_id = null.
      Ask the user: "Is this a feature/requirement or a bug fix?" → item_type = "REQ" or "BUG".
   c'. **GitHub issue reverse-lookup** (REQ-0034): When `detectSource()` returns "manual", attempt to find a matching GitHub issue:
      1. Call `checkGhAvailability()`. If `{ available: false }`:
         - Display info: "GitHub CLI not available ({reason}). Proceeding with manual entry."
         - Skip to step 4 (continue as manual).
      2. Call `searchGitHubIssues(description)`. If error:
         - Display warning: "GitHub search failed ({error}). Proceeding with manual entry."
         - Skip to step 4 (continue as manual).
      3. If matches found (matches.length > 0):
         - Present numbered list:
           ```
           Found matching GitHub issues:
             1. #{number} {title} ({state})
             2. #{number} {title} ({state})
             ...
             C. Create new GitHub issue
             S. Skip (keep as manual entry)
           ```
         - If user selects a match (1-N): override source = "github", source_id = "GH-{number}".
           Re-fetch the issue title for slug generation.
         - If user selects "C" (Create new): call `createGitHubIssue(description)`.
           If successful: override source = "github", source_id = "GH-{number}".
           If failed: display warning "Could not create issue. Proceeding as manual." and continue.
         - If user selects "S" (Skip): proceed unchanged (manual).
      4. If no matches found (matches.length === 0):
         - Present:
           ```
           No matching GitHub issues found.
             C. Create new GitHub issue
             S. Skip (keep as manual entry)
           ```
         - If "C": call `createGitHubIssue(description)`, override as above.
         - If "S": proceed unchanged.
4. Generate description slug:
   - For external sources (github/jira): use `generateSlug()` on the fetched ticket title (NOT the reference number)
   - For manual input: use `generateSlug()` on the user's description text
5. Determine directory identifier:
   - **External sources** (github/jira): use the `source_id` from `detectSource()` (e.g. `GH-208`, `AUTH-456`). No sequence number needed.
   - **Manual** (no external source): scan `docs/requirements/` for existing folders matching `{item_type}-NNNN-*`, extract the highest NNNN, use NNNN+1 (zero-padded to 4 digits). If none found, start at 0001.
6. Compose directory name using `composeDirName(item_type, source, source_id, description_slug, sequenceNumber)`:
   - **External sources**: `{item_type}-{source_id}-{description_slug}`
   - **Manual**: `{item_type}-{NNNN}-{description_slug}`
   - Example (github): `#208` with title "Generate structured task breakdown" → `REQ-GH-208-generate-structured-task-breakdown`
   - Example (jira): `AUTH-456` with title "Login crash on empty password" → `BUG-AUTH-456-login-crash-on-empty-password`
   - Example (manual): "Add payment processing" → `REQ-0001-add-payment-processing`
7. Check for slug collision in `docs/requirements/`:
   - If exists: warn "This item already has a folder. Update it or choose a different name?"
   - Options: [U] Update draft | [R] Rename | [C] Cancel
8. Create `docs/requirements/{slug}/draft.md` with source content and metadata header
9. Create `docs/requirements/{slug}/meta.json` with v2 schema:
   `{ "source": "{source}", "source_id": "{source_id}", "slug": "{slug}", "created_at": "{ISO-8601}", "analysis_status": "raw", "phases_completed": [], "codebase_hash": "{git rev-parse --short HEAD}" }`
10. Append to BACKLOG.md Open section using `appendToBacklog()` with `[ ]` marker
11. Confirm: "Added '{description}' to the backlog. You can analyze it now or come back later."

> **Constraints**: No state.json writes (NFR-002). No workflow creation. No branch creation. No orchestrator delegation (ADR-0012). Performance target: under 5 seconds (NFR-004).

---

**analyze** - Run interactive analysis on a backlog item
```
/isdlc analyze "payment-processing"
/isdlc analyze "3.2"
/isdlc analyze "#42"
/isdlc analyze "JIRA-1250"
/isdlc analyze -light "config-update"
```
1. Does NOT require an active workflow -- runs inline (no orchestrator)
2. Does NOT write to state.json, does NOT create branches
2.5. **Parse flags** (GH-57): Extract `-light` flag from command arguments before resolving the item.
   ```
   args = user input (text after "/isdlc analyze")
   lightFlag = false
   IF args contains "-light":
       lightFlag = true
       args = args with "-light" removed (preserve remaining text as item identifier)
   item_input = args.trim()
   ```
   **--light deprecation notice** (REQ-0046): If lightFlag is true, emit: "Note: The --light flag is deprecated for depth control. The roundtable now adapts depth automatically and recommends scope based on the conversation. The flag will pre-set the scope recommendation to 'light' as a starting suggestion during the transition period."
3. **Detect input type** (REQ-0037): Classify item_input as one of:
   - **External ref** (`#N` for GitHub, `PROJECT-N` for Jira): proceed to optimized dependency group path (step 3a)
   - **Non-external ref** (slug, item number, description): proceed to standard resolution (step 3b)

   3a. **Optimized path for external references** (`#N` or `PROJECT-N`):

   The following operations are structured as dependency groups. Fire all operations within a group as parallel tool calls in a single response. Groups execute sequentially (Group 2 needs Group 1 results).

   **Group 1** (fire all in parallel at T=0):
   - **GitHub** (if source is "github"): `gh issue view N --json title,labels,body` --> issueData (title, labels, body). If this fails, fail fast: "Could not fetch issue #N: {error}" and STOP.
   - **Jira** (if source is "jira" and source_id matches PROJECT-N pattern): Call `getAccessibleAtlassianResources` to resolve cloudId (use first accessible resource if multiple), then call `getJiraIssue(cloudId, source_id)` to fetch the ticket --> issueData (summary, description, issuetype, priority). If the Jira fetch fails, fail fast: "Could not fetch Jira ticket {source_id}: {error}" and STOP (matching GitHub fail-fast behavior). Pass fetched Jira content into draft.md: use the summary as the draft heading, the description body as context, and include acceptance criteria if present in the Jira description.
   - `Grep "GH-N"` (or source_id) across `docs/requirements/*/meta.json` --> existingMatch (slug and directory if found, null if not)
   - `Glob docs/requirements/{TYPE}-*` --> folderList (for sequence number calculation)
   - **Memory read** (REQ-0063, FR-003; BUG-0056, FR-003): Read roundtable memory in parallel with other Group 1 operations. Prefer hybrid path: call `searchMemory()` from `lib/memory-search.js` with `{ codebaseIndexPath: 'docs/.embeddings/codebase.emb', traverseLinks: true, includeProfile: true, profilePath }`. If hybrid search returns non-empty results, call `formatHybridMemoryContext(result)` to produce `memoryContextBlock`. If hybrid search returns empty (no vector indexes exist on first run), fall back to legacy path: call `readUserProfile()` and `readProjectMemory(projectRoot)` from `lib/memory.js`, then `mergeMemory(userProfile, projectMemory)` and `formatMemoryContext(merged)`. If the result is empty string, `MEMORY_CONTEXT` is omitted from the dispatch prompt.
   - **Persona + topic files** (REQ-0001 FR-006): Check if session context contains `<!-- SECTION: ROUNDTABLE_CONTEXT -->`.
     If found:
       - Extract persona content from `### Persona: Business Analyst`, `### Persona: Solutions Architect`, `### Persona: System Designer` headings --> personaContent
       - Extract topic content from `### Topic: {topic_id}` headings --> topicContent
       - SKIP the persona file reads and topic Glob/reads below.
     If not found (cache absent or section missing):
       - FALLBACK: Read 3 persona files in parallel --> personaContent:
         - `src/claude/agents/persona-business-analyst.md`
         - `src/claude/agents/persona-solutions-architect.md`
         - `src/claude/agents/persona-system-designer.md`
       - `Glob src/claude/skills/analysis-topics/**/*.md` --> topicPaths

   **Group 2** (needs Group 1 results, fire all in parallel):
   - **If no existingMatch found**: Auto-add without confirmation prompt -- invoke the `add` handler with the input and pre-fetched issueData (title, labels, body for GitHub; summary, description, issuetype for Jira). The add handler creates the folder, draft.md, meta.json, and updates BACKLOG.md. Reuse the in-memory meta and draft objects it produces (do NOT re-read from disk).
   - **If existingMatch found**: Read meta.json from the existing folder; read draft.md from disk.
   - **If topicPaths was populated (fallback path)**: Read all topic files from topicPaths in parallel --> topicContent

   **Auto-add rationale** (FR-002): For `#N` and `PROJECT-N` inputs, intent to analyze is unambiguous -- the user explicitly referenced an external ticket. Skip the "Add to backlog?" confirmation and invoke the add handler automatically when no existing folder is found. For non-external-ref inputs (slugs, descriptions), preserve the existing confirmation prompt behavior (step 3b).

   **In-memory reuse** (FR-004): After the add handler writes meta.json and draft.md, compose the dispatch prompt from the in-memory meta and draft objects. Do NOT issue Read tool calls for files just written.

   After Group 2, proceed to step 4 (completed analysis check) with the resolved slug, meta, and draft.

   3b. **Standard resolution for non-external refs** (existing behavior preserved):
   Resolve target item using `resolveItem(input)`:
   - If no match: "No matching item found. Would you like to add it to the backlog first?"
     If user confirms: run `add` handler with the input, then continue with analysis.

   For non-external refs, also pre-read persona and topic files for dispatch optimization (REQ-0001 FR-006):
   - Check if session context contains `<!-- SECTION: ROUNDTABLE_CONTEXT -->`.
     If found: extract personaContent and topicContent from cached section (same extraction as step 3a).
     If not found: FALLBACK -- Read 3 persona files in parallel --> personaContent; Glob + read topic files --> topicContent

   After resolution, proceed to step 4.

4. Read meta.json using `readMetaJson()` (skip if already in-memory from step 3a):
   - If meta.json missing (folder exists but no meta): create default meta.json with
     analysis_status: "raw", phases_completed: [], then continue
5. Check for completed analysis:
   a. If all 5 phases are in meta.phases_completed:
      - Check codebase staleness: compare meta.codebase_hash with current git HEAD short SHA
      - If hashes match: "Analysis is already complete and current. Nothing to do." STOP.
      - If hashes differ: warn "Codebase has changed since analysis ({N} commits). Re-run analysis?"
        Options: [R] Re-analyze | [C] Cancel
        If re-analyze: clear phases_completed, topics_covered, steps_completed, set analysis_status to "raw", continue

6. **SIZING PRE-CHECK** (GH-57): If lightFlag === true AND meta.sizing_decision is NOT already set:
   - Read `light_skip_phases` from `workflows.json -> workflows.feature.sizing.light_skip_phases` (fallback: `["03-architecture", "04-design"]`)
   - Build sizing_decision record: `{ intensity: "light", effective_intensity: "light", recommended_intensity: null, decided_at: ISO timestamp, reason: "light_flag", user_prompted: false, forced_by_flag: true, overridden: false, overridden_to: null, file_count: 0, module_count: 0, risk_score: "unknown", coupling: "unknown", coverage_gaps: 0, fallback_source: null, fallback_attempted: false, light_skip_phases: light_skip_phases, epic_deferred: false, context: "analyze" }`
   - Set `meta.sizing_decision = sizing_decision`, call `writeMetaJson(slugDir, meta)`
   - Display forced-light banner: "ANALYSIS SIZING: Light (forced via -light flag)."
   - Note: The lead orchestrator will adapt its artifact production accordingly.

6.5. **Bug Classification Gate** (REQ-0061, FR-001, FR-002, FR-004, FR-005):

   Read the draft content: `docs/requirements/{slug}/draft.md`. If missing and not already in-memory from step 3a, set draftContent = "(No draft available)".

   **Discovery context extraction**: Check if session context contains `<!-- SECTION: DISCOVERY_CONTEXT -->`. If found, extract the full section content as `{discoveryContent}`. If not found, set `{discoveryContent}` to empty string.

   6.5a. **Classify subject as bug or feature**: Read the full issue description (draftContent) and any labels from meta. Infer whether the subject is a bug or a feature based on the description content:
   - **Bug signals**: error messages, stack traces, crash descriptions, "expected X but got Y", regression language, unexpected behavior, broken functionality, ENOENT/TypeError/500 errors
   - **Feature signals**: "add support for", "it would be great if", "new capability", enhancement proposals, "allow users to", improvement descriptions
   - **Labels are supplementary**: Labels like "bug" or "enhancement" are additional evidence but do NOT override the inference from description content. A "bug" label on a feature request is still a feature. An "enhancement" label on a crash report is still a bug.
   - **Ambiguous cases**: If the description is genuinely ambiguous (could be either), ask the user directly: "I'm not sure if this is a bug or a feature request. Which analysis flow should I use?" and let the user decide.

   6.5b. **Route based on classification**:

   **IF classified as "feature"** (or user overrides bug classification to feature):
   - Proceed directly to step 7 (Roundtable conversation loop). No bug confirmation prompt. No bug-gather agent. No bug artifacts produced. (AC-001-02, AC-005-01, AC-005-02, AC-005-03)

   **IF classified as "bug"**:
   - Present classification with reasoning to the user: "This looks like a bug -- [1-2 sentence reasoning based on specific signals from the description]. Use the bug analysis flow?"
   - Wait for user response. (AC-001-01)
   - **If user confirms** (yes, go ahead, correct): proceed to step 6.5c (bug-gather dispatch).
   - **If user overrides** (no, it's a feature, treat as feature): proceed to step 7 (Roundtable). (AC-001-04)

   6.5c. **Read bug roundtable protocol reference** (REQ-GH-218, FR-001): Read `src/claude/agents/bug-roundtable-analyst.md` using the Read tool. This is a protocol reference -- do NOT spawn it as a separate agent via Task tool. The file defines the bug roundtable conversation protocol, tracing delegation, confirmation state machine, and artifact batch write specifications that you will execute inline.

   6.5d. **Execute bug roundtable conversation protocol inline** (REQ-GH-218, FR-001, FR-002, FR-003, FR-004):

   CONTEXT (already in memory):
     - slug, meta, draftContent, discoveryContent: from earlier steps
     - memoryContextBlock: from step 3a Group 1 memory read
     - Personas, topics, constitution: in session cache (ROUNDTABLE_CONTEXT)

   RUNTIME COMPOSITION (REQ-GH-235 FR-005, AC-005-04):
     Before executing the protocol, compose the effective state machine from defaults + persona declarations:
     1. Read persona files from ROUNDTABLE_CONTEXT (already loaded in session cache)
     2. Call `composeEffectiveStateMachine(defaultStateMachine, personaFiles)` via bridge (`src/core/bridge/roundtable-composer.cjs`)
     3. Use `result.effectiveStateMachine` as the state machine for this roundtable session (replaces the hardcoded default sequence)
     4. If `result.warnings` is non-empty, log each warning to stderr (non-blocking -- roundtable proceeds regardless)
     5. If `result.conflicts` is non-empty, the first-declared persona wins per AC-005-05; losers are already recorded in warnings

   PROTOCOL (from bug-roundtable-analyst.md):
     1. Follow Section 2.1 Opening:
        - Open as Maya from draft content with structured bug summary
        - Ask a single clarifying question
        - STOP and wait for user reply (natural conversation turn)
     2. On user's first reply, follow Section 2.1 "On resume":
        - Run codebase scan (Alex's deferred task)
        - Compose response with Maya continuing + Alex contributing scan evidence
     3. For each subsequent exchange, follow Sections 2.2-2.3:
        - Conversation flow rules, persona contribution batching, natural steering
        - All 3 personas contribute within first 3 exchanges
     4. When sufficient understanding is reached, follow Section 2.4:
        - Write bug-report.md to artifact folder (ONLY pre-confirmation artifact)
     5. Follow Section 2.5 Tracing Delegation:
        - Spawn tracing-orchestrator via Task tool with BUG_REPORT_PATH, DISCOVERY_CONTEXT, ANALYSIS_MODE: true
        - On return: Alex presents root cause findings
        - On failure: fail-open, Alex presents conversation-based hypotheses
     6. Follow Section 2.6 Fix Strategy:
        - Jordan proposes fix approaches (at least 2) with tradeoffs
     7. When ready, enter confirmation sequence (Section 2.7):
        - Sequential: PRESENTING_BUG_SUMMARY -> PRESENTING_ROOT_CAUSE -> PRESENTING_FIX_STRATEGY -> PRESENTING_TASKS
        - Each domain: present summary, wait for Accept/Amend
     8. On final Accept, execute artifact batch write (Section 4):
        - Write root-cause-analysis.md, fix-strategy.md, tasks.md to artifact folder
        - Update meta.json with phases_completed, acceptance record
     9. Set confirmationState = COMPLETE (inline completion -- no signal parsing needed)

   **Conversation boundary**: During the bug roundtable conversation you ARE the roundtable. You do not:
   - Summarize the persona output ("Maya's asking whether...")
   - Add your own tables or formatting outside the protocol
   - Present AskUserQuestion menus
   - Add commentary between the persona output and the user's response
   - Interpret what the persona said
   The bug roundtable protocol owns the entire user-facing experience. Follow the conversation protocol from bug-roundtable-analyst.md directly.

   6.5e. **Post bug-roundtable: Update meta.json**: After the bug roundtable completes:
   - Re-read meta.json using `readMetaJson(slugDir)` to get the roundtable's updates
   - Verify meta.phases_completed includes both "01-requirements" and "02-tracing"
   - Update meta.analysis_status using `deriveAnalysisStatus(meta.phases_completed, meta.sizing_decision)`
   - Set `meta.bug_classification = { classification: "bug", reasoning: "<the reasoning from 6.5b>", confirmed_by_user: true }`
   - Update meta.codebase_hash to current git HEAD short SHA
   - Write meta.json using `writeMetaJson(slugDir, meta)`
   - Update BACKLOG.md marker using `updateBacklogMarker()` with `deriveBacklogMarker()`

   6.5f. **Automatic Build Kickoff** (REQ-GH-218, FR-005): After artifacts are produced and meta.json is updated:
   - Display a completion message listing all produced artifacts:
     ```
     Bug analysis complete. Artifacts created:
       - {ARTIFACT_FOLDER}/bug-report.md
       - {ARTIFACT_FOLDER}/root-cause-analysis.md
       - {ARTIFACT_FOLDER}/fix-strategy.md
       - {ARTIFACT_FOLDER}/tasks.md
     ```
   - Copy tasks.md to `docs/isdlc/tasks.md` for build consumption
   - Invoke the build workflow for this item. Follow the build handler's initialization steps (validate constitution, check no active workflow, initialize active_workflow with type "feature" and build phases `["05-test-strategy", "06-implementation", "16-quality-loop", "08-code-review"]`). Since Phase 01 (requirements via bug-report) and Phase 02 (tracing via tracing-orchestrator) are already complete during analysis, pass `START_PHASE: "05-test-strategy"` and `ARTIFACT_FOLDER: "{slug}"` to the orchestrator so the build workflow begins at Phase 05. (AC-005-02, AC-005-03)
   - **In all cases**: STOP after this step. Do NOT proceed to step 7 (Feature Roundtable). The bug flow is complete. Skip steps 7, 7.5, 7.6, 7.7, 7.8, 8, and 9 entirely.

7. **Roundtable conversation loop** (REQ-0032, FR-014, REQ-0037):
   (NOTE: This step is ONLY reached for items classified as features. Bugs are handled entirely by step 6.5 above.)

   7a. **Read protocol reference**: Read `src/claude/agents/roundtable-analyst.md` using the Read tool. This is a protocol reference -- do NOT spawn it as a separate agent via Task tool. The file defines the conversation protocol, topic coverage rules, confirmation state machine, and artifact batch write specifications that you will execute inline. (Note: draftContent and discoveryContent were already resolved in step 6.5 -- reuse them here.)

   7b. **Execute roundtable conversation protocol inline** (REQ-0065, FR-001):

   CONTEXT (already in memory -- no reads needed):
     - slug, artifact_folder: from step 3 resolution
     - meta: from step 4 readMetaJson()
     - draftContent: from step 6.5 draft read
     - discoveryContent: from step 6.5 discovery extraction
     - memoryContextBlock: from step 3a Group 1 memory read
     - lightFlag, sizing_decision: from step 2.5 / step 6
     - Personas, topics, constitution: in session cache (ROUNDTABLE_CONTEXT)

   RUNTIME COMPOSITION (REQ-GH-235 FR-005, AC-005-04):
     Before executing the protocol, compose the effective state machine from defaults + persona declarations:
     1. Read persona files from ROUNDTABLE_CONTEXT (already loaded in session cache)
     2. Call `composeEffectiveStateMachine(defaultStateMachine, personaFiles)` via bridge (`src/core/bridge/roundtable-composer.cjs`)
     3. Use `result.effectiveStateMachine` as the state machine for this roundtable session (replaces the hardcoded default sequence)
     4. If `result.warnings` is non-empty, log each warning to stderr (non-blocking -- roundtable proceeds regardless)
     5. If `result.conflicts` is non-empty, the first-declared persona wins per AC-005-05; losers are already recorded in warnings

   PROTOCOL (from roundtable-analyst.md):
     1. Follow Section 2.1 Opening:
        - Open as Maya from draft content
        - Ask a single opening question
        - STOP and wait for user reply (natural conversation turn -- no Task resume)
     2. On user's first reply, follow Section 2.1 "On resume":
        - Run codebase scan (Alex's deferred task)
        - Compose response with Maya continuing + Alex contributing scan evidence
     3. For each subsequent exchange, follow Sections 2.2-2.5:
        - Conversation flow rules, persona contribution batching, natural steering
        - Topic coverage tracking (Section 3)
        - Depth adaptation (Section 4)
     4. When coverage is complete, enter confirmation sequence (Section 2.5):
        - Sequential: PRESENTING_REQUIREMENTS -> PRESENTING_ARCHITECTURE -> PRESENTING_DESIGN
        - Each domain: present summary, wait for Accept/Amend
     5. On final Accept, execute artifact batch write (Section 5.5):
        - Write all artifacts to docs/requirements/{slug}/
        - Update meta.json with phases_completed, topics_covered, acceptance record
     6. Set confirmationState = COMPLETE (inline completion -- no signal parsing needed)

   **Conversation boundary**: During the roundtable conversation you ARE the roundtable. You do not:
   - Summarize the persona output ("Maya's asking whether...")
   - Add your own tables or formatting outside the protocol
   - Present AskUserQuestion menus
   - Add commentary between the persona output and the user's response
   - Interpret what the persona said
   The roundtable protocol owns the entire user-facing experience. Follow the conversation protocol from roundtable-analyst.md directly.

7.5. **Post-dispatch: Re-read meta.json**: After the roundtable-analyst returns:
   - Re-read meta.json using `readMetaJson(slugDir)` to get the lead's updates
   - The lead will have populated phases_completed, topics_covered, and written artifacts

7.5a. **Memory write-back** (REQ-0063, FR-006; REQ-0065, FR-007; BUG-0056, FR-003): After the roundtable conversation completes inline:
   - Construct an EnrichedSessionRecord from in-memory conversation state: `{ session_id, timestamp, topics_covered, depth_preferences_observed, overrides, summary, context_notes, playbook_entry, importance }`. The `summary` is a 1-2 sentence description of the session outcome. `context_notes` are topic-specific observations (array of `{ topic, content, relationship_hint }`). `playbook_entry` is the key takeaway. `importance` is 0-10 rating.
   - Call `writeSessionRecord(enrichedRecord, projectRoot, userMemoryDir)` from `lib/memory.js`
   - This writes the enriched session record to both `~/.isdlc/user-memory/sessions/{session_id}.json` and `.isdlc/roundtable-memory.json`
   - After write succeeds, trigger async embedding: spawn `embedSession(enrichedRecord, userStore, projectStore, engineConfig)` from `lib/memory-embedder.js`. This generates vector embeddings for semantic search. Embedding failure is non-blocking (fail-open, Article X).
   - Write failures are non-blocking: the result `{ userWritten, projectWritten, enriched }` is logged internally but does not affect the analyze flow (AC-006-04, AC-008-05)

7.6. **SIZING TRIGGER** (GH-57, fires after dispatch returns):
   IF meta.sizing_decision is NOT already set AND meta.phases_completed includes '02-impact-analysis':

   **Interactive sizing** (lightFlag === false):
   - B.1: Read `docs/requirements/{slug}/impact-analysis.md`. If missing, set `ia_reason = 'ia_file_missing'`.
   - B.2: Call `parseSizingFromImpactAnalysis(iaContent)` from `common.cjs`. If parse returns null, set `ia_reason = 'ia_parse_failed'`.
   - B.3: If metrics is null (primary failed), call `extractFallbackSizingMetrics(slug, projectRoot)` from `common.cjs`.
   - B.4: Read thresholds from `workflows.json -> workflows.feature.sizing.thresholds` (fallback: `{ light_max_files: 5, epic_min_files: 20 }`).
   - B.5: Call `computeSizingRecommendation(metrics, thresholds)` from `common.cjs`.
   - B.6: Display recommendation banner (with fallback warning if ia_reason is set, or happy-path banner with metrics).
   - B.7: Present menu: `[A] Accept recommendation | [O] Override (choose different) | [S] Show impact analysis`. Override picker: `[1] Light  [2] Standard` (epic requires build workflow -- CON-004, ADR-005).
   - B.8: Epic deferral: if `chosen_intensity === 'epic'`, set `effective_intensity = 'standard'`, `epic_deferred = true`.
   - B.9: If `effective_intensity === 'light'`, read `light_skip_phases` from `workflows.json` (fallback: `["03-architecture", "04-design"]`).
   - B.10: Build sizing_decision record: `{ intensity, effective_intensity, recommended_intensity, decided_at, reason, user_prompted: true, forced_by_flag: false, overridden, overridden_to, file_count, module_count, risk_score, coupling, coverage_gaps, fallback_source, fallback_attempted, light_skip_phases, epic_deferred, context: "analyze" }`
   - B.11: Set `meta.sizing_decision = sizing_decision`, call `writeMetaJson(slugDir, meta)`. Do NOT call `applySizingDecision()` (CON-002, NFR-001).

7.7. **TIER COMPUTATION** (GH-59, fires after dispatch returns):
   IF meta.phases_completed includes '02-impact-analysis':
   - Read `docs/requirements/{slug}/impact-analysis.md`. If missing, skip tier computation (tier stays null).
   - Call `parseSizingFromImpactAnalysis(iaContent)` from `common.cjs`. If parse returns null, skip tier computation.
   - Read `tier_thresholds` from `workflows.json -> workflows.feature.tier_thresholds` (fallback: `DEFAULT_TIER_THRESHOLDS` from `three-verb-utils.cjs`).
   - Call `computeRecommendedTier(metrics.file_count, metrics.risk_score, thresholds)` from `three-verb-utils.cjs`.
   - Set `meta.recommended_tier = tier` (AC-003a: top level of meta.json, NOT inside quick_scan).
   - Call `writeMetaJson(slugDir, meta)`.
   - Display: `"  Recommended tier: {tier} -- {description} ({metrics.file_count} files, {metrics.risk_score} risk)"` using `getTierDescription(tier)`.

7.8. **Finalize meta.json**:
   - Update meta.analysis_status using `deriveAnalysisStatus(meta.phases_completed, meta.sizing_decision)`
   - Update meta.codebase_hash to current git HEAD short SHA
   - Preserve the `acceptance` field written by the roundtable-analyst during the confirmation sequence (accepted_at, domains, amendment_cycles). Do not overwrite or remove it.
   - Write meta.json using writeMetaJson()
   - Update BACKLOG.md marker using updateBacklogMarker() with deriveBacklogMarker()

8. After analysis complete:
   a. Display: "Analysis complete. {slug} is ready to build."
   b. Read recommended_tier from meta.json (GH-59, FR-004, AC-004a, AC-004b):
      - LET tier = meta.recommended_tier || null
      - IF tier is not null:
          LET desc = getTierDescription(tier)  // from three-verb-utils.cjs
          Display: "Recommended tier: {tier} -- {desc.description}"
      - ELSE:
          (omit tier line entirely -- no error, no placeholder)
9. **GitHub label sync** (non-blocking): If `meta.source === "github"` and `meta.source_id` matches `GH-N`, extract the issue number and run `gh issue edit N --add-label ready-to-build`. If the command fails, log a warning and continue — never block the pipeline.

> **Constraints**: No state.json writes (NFR-002). No workflow creation. No branch creation. Resumable at any phase boundary (NFR-003). Phase transition overhead under 2 seconds (NFR-004).

---

**build** - Start a feature workflow for a backlog item
```
/isdlc build "payment-processing"
/isdlc build "3.2"
/isdlc build "#42"
/isdlc build "Feature description"
/isdlc build "payment-processing" --supervised
/isdlc build "payment-processing" --debate
```
1. Validate constitution exists and is not a template
2. Check no active workflow (block if one exists, suggest `/isdlc cancel` first)
3. Resolve target item using `resolveItem(input)`:
   - If no match and input looks like a description (not a slug/number/ref):
     "No matching item found. Would you like to add it to the backlog and start building?"
     If user confirms: run `add` handler, then proceed to step 4
   - If no match and input looks like a reference: ERROR per error taxonomy ERR-BUILD-001
4. Read meta.json using `readMetaJson()` -- this is now actionable for build auto-detection.
   If `meta.recommended_scope` exists (written by the roundtable during `/isdlc analyze`), use it as an input signal for tier selection in step 4a-tier alongside `recommended_tier`.

**--- REQ-0026: Build Auto-Detection Steps 4a-4e ---**

**Step 4a: Compute analysis status** (FR-001, FR-002, FR-003)

Read feature workflow phases from `workflows.json` (`workflows.feature.phases`).
Call `computeStartPhase(meta, featurePhases)` from `three-verb-utils.cjs`.
This returns `{ status, startPhase, completedPhases, remainingPhases, warnings }`.
If `warnings` is non-empty, log each warning to stderr.
Let `analysisStatus = result.status`, `startPhase = result.startPhase`.
If `analysisStatus === 'raw'`: skip steps 4b-4e, fall through to step 5 (full workflow).

**--- GH-59: Tier Selection (Step 4a-tier) ---**

Step 4a-tier: Tier Selection (GH-59, FR-005, FR-006, FR-008, NFR-001, AD-07)

**IMPORTANT**: Tier selection ONLY applies when analysis is incomplete. When analysis is
fully complete (`analysisStatus === 'analyzed'`), the remaining phases are fixed
(implementation phases only) — the tier choice cannot affect which phases run. Skip
the tier menu entirely and proceed to Step 4b.

0. Guard: Skip tier selection when analysis is complete:
   IF analysisStatus === 'analyzed':
       // All analysis phases done. Remaining phases (05+) are fixed regardless of tier.
       // Proceed directly to Step 4b (staleness check).
       SKIP to Step 4b.
   IF analysisStatus === 'raw':
       // No analysis done. Tier selection was already skipped (Step 4a skips to step 5).
       // This guard is redundant but explicit for clarity.
       SKIP to Step 4b.
   // Only 'partial' status reaches the tier menu below.

1. Read recommended tier from meta (already loaded in step 4):
   LET recommended = meta.recommended_tier OR null

2. Determine default selection:
   IF recommended IS null:
       LET default = "standard"
       Display warning: "No tier recommendation available. Defaulting to standard."
   ELSE:
       LET default = recommended

3. Check for --trivial flag:
   IF --trivial flag is set:
       Display: "Trivial tier selected via flag. Proceed with direct edit? [Y/n]"
       IF user confirms (Y or Enter):
           GOTO step T1 (TRIVIAL TIER EXECUTION)
       ELSE:
           (fall through to tier menu below)

4. Present tier menu:
   LET descriptions = {
       trivial:  getTierDescription("trivial"),
       light:    getTierDescription("light"),
       standard: getTierDescription("standard"),
       epic:     getTierDescription("epic")
   }

   Display:
   ```
   Recommended workflow tier: {default} ({descriptions[default].fileRange}, {descriptions[default].description})

   [1] Trivial -- {descriptions.trivial.description} ({descriptions.trivial.fileRange})
   [2] Light -- {descriptions.light.description} ({descriptions.light.fileRange})
   [3] Standard -- {descriptions.standard.description} ({descriptions.standard.fileRange})
   [4] Epic -- {descriptions.epic.description} ({descriptions.epic.fileRange})
   ```

   Append " <-- RECOMMENDED" to the menu line matching default.
   Display: "Select tier [{defaultNumber}]:"

5. Handle user input:
   LET TIER_MAP = { "1": "trivial", "2": "light", "3": "standard", "4": "epic" }
   LET input = user selection (or empty for default)

   IF input is empty or Enter:
       LET selected = default
   ELSE IF input in TIER_MAP:
       LET selected = TIER_MAP[input]
   ELSE:
       Display: "Invalid selection. Using default: {default}"
       LET selected = default

6. Record tier override if applicable (AC-005e):
   IF selected != recommended AND recommended IS NOT null:
       meta.tier_override = {
           recommended: recommended,
           selected: selected,
           overridden_at: new Date().toISOString()
       }
       writeMetaJson(slugDir, meta)

7. Route based on selection:
   IF selected === "trivial":
       GOTO --> TRIVIAL TIER EXECUTION (step T1)
   ELSE IF selected === "epic":
       Display: "Epic decomposition is not yet available. Running standard workflow."
       // CON-003: epic placeholder routes to standard
       // Fall through to step 4b unchanged
   ELSE:
       // light or standard: fall through to step 4b unchanged
       // existing sizing at 3e-sizing handles light/standard intensity

**--- End GH-59: Tier Selection ---**

**Step 4b: Check staleness** (FR-004, FR-006, NFR-002) -- only if `analysisStatus !== 'raw'`

```
TRY:
  currentHash = git rev-parse --short HEAD (trim whitespace)
CATCH:
  Log warning: "Could not determine current codebase version. Skipping staleness check."
  stalenessResult = { stale: false, severity: 'none', overlappingFiles: [],
                      changedFileCount: 0, blastRadiusFileCount: 0,
                      originalHash: null, currentHash: null, fallbackReason: null }
  SKIP to step 4d.

// Read impact-analysis.md for blast-radius-aware check (GH-61)
LET impactAnalysisContent = null
TRY:
  impactAnalysisPath = path.join(slugDir, 'impact-analysis.md')
  IF file exists at impactAnalysisPath:
    impactAnalysisContent = fs.readFileSync(impactAnalysisPath, 'utf8')
CATCH:
  impactAnalysisContent = null  // fallback to naive

stalenessResult = checkBlastRadiusStaleness(meta, currentHash, impactAnalysisContent, null)

// For fallback and warning modes, enrich with commit count
IF stalenessResult.stale AND (stalenessResult.severity === 'fallback' OR stalenessResult.severity === 'warning'):
  TRY:
    commitCount = git rev-list --count {stalenessResult.originalHash}..HEAD
    stalenessResult.commitsBehind = parseInt(commitCount.trim(), 10)
  CATCH:
    stalenessResult.commitsBehind = null
```

**Step 4c: Handle staleness** (FR-004, FR-006) -- tiered response based on severity

```
IF stalenessResult.severity === 'none':
  // Silent proceed -- no output, no user interaction
  (continue to step 4d)

ELSE IF stalenessResult.severity === 'info':
  // Informational note -- display but do not block
  Display:
    INFO: {overlappingFiles.length} file(s) in this item's blast radius
    changed since analysis (commit {originalHash} -> {currentHash}):
      - {overlappingFiles[0]}
      - {overlappingFiles[1]}
      - ...
    Proceeding with existing analysis.
  (continue to step 4d -- no menu, automatic proceed)

ELSE IF stalenessResult.severity === 'warning':
  // Full warning menu -- 4+ overlapping files
  LET commitsBehindStr = stalenessResult.commitsBehind != null ? " (" + stalenessResult.commitsBehind + " commits ago)" : ""
  Display:
    STALENESS WARNING: {item slug}
    {overlappingFiles.length} file(s) in this item's blast radius changed
    since analysis (commit {originalHash}{commitsBehindStr} -> {currentHash}):
      - {overlappingFiles[0]}
      - {overlappingFiles[1]}
      - {overlappingFiles[2]}
      - {overlappingFiles[3]}
      - ... ({remaining} more)
    Options:
      [P] Proceed anyway -- use existing analysis as-is
      [Q] Re-run quick-scan -- refresh scope check
      [A] Re-analyze from scratch -- clear all analysis, start fresh

  Handle each choice (same as below).

ELSE IF stalenessResult.severity === 'fallback':
  // Naive hash-based warning -- identical to legacy behavior
  LET commitsBehindStr = stalenessResult.commitsBehind != null ? " (" + stalenessResult.commitsBehind + " commits ago)" : ""
  Display:
    STALENESS WARNING: {item slug}
    Analysis was performed at commit {originalHash}{commitsBehindStr}.
    Current HEAD is {currentHash}.
    (Blast-radius check unavailable: {fallbackReason})
    Options:
      [P] Proceed anyway -- use existing analysis as-is
      [Q] Re-run quick-scan -- refresh scope check (re-runs analysis from Phase 00)
      [A] Re-analyze from scratch -- clear all analysis, start fresh

  Handle each choice (same as below).
```

Staleness menu handlers (for 'warning' and 'fallback' severities):
- **[P] Proceed**: No changes. Continue with current analysisStatus and startPhase.
- **[Q] Re-run quick-scan**: Set `startPhase = "00-quick-scan"`, `remainingPhases = featurePhases`, `analysisStatus = 'raw'`.
- **[A] Re-analyze**: Clear meta: `meta.phases_completed = []`, `meta.analysis_status = "raw"`, `meta.codebase_hash = currentHash`. Write via `writeMetaJson(slugDir, meta)`. Set `startPhase = null`, `analysisStatus = 'raw'`, `completedPhases = []`, `remainingPhases = [...featurePhases]`.

**Step 4d: Handle partial analysis** (FR-003) -- only if `analysisStatus === 'partial'` (after staleness handling)

Display partial analysis menu:
```
PARTIAL ANALYSIS: {item slug}

Completed phases:
  [done] Phase NN: {name}  (for each completed phase)

Remaining analysis phases:
  Phase NN: {name}  (for each remaining analysis phase)

Options:
  [R] Resume analysis -- continue from Phase {nextPhase}
  [S] Skip to implementation -- start at Phase 05 (analysis gaps may reduce quality)
  [F] Full restart -- re-run all phases from Phase 00
```

Handle each choice:
- **[R] Resume**: No changes. `startPhase` already set to next analysis phase.
- **[S] Skip**: Set `startPhase = "05-test-strategy"`, `remainingPhases = IMPLEMENTATION_PHASES`.
  Display warning: "Note: Skipping remaining analysis phases. Output quality may be affected."
- **[F] Full restart**: Clear meta: `meta.phases_completed = []`, `meta.analysis_status = "raw"`. Write via `writeMetaJson(slugDir, meta)`. Set `startPhase = null`, `analysisStatus = 'raw'`, `completedPhases = []`, `remainingPhases = [...featurePhases]`.

**Step 4e: Display BUILD SUMMARY banner** (FR-005) -- only if `analysisStatus !== 'raw'` (after all handling)

Display summary with completed and remaining phases, then confirm:
```
BUILD SUMMARY: {item slug}

Analysis Status: {Fully analyzed | Partial (N of 5 phases complete)}
Completed phases:
  [done] Phase NN: {name}  (for each completed)

Build will execute:
  Phase NN: {name}  (for each remaining)

Proceed? [Y/n]
```

Phase display names: 00=Quick Scan, 01=Requirements, 02=Impact Analysis, 03=Architecture, 04=Design, 05=Test Strategy, 06=Implementation, 16=Quality Loop, 08=Code Review.

If user declines: abort build. If user confirms: proceed to step 5.

**--- End REQ-0026: Build Auto-Detection ---**

5. Parse flags from command arguments:
   - --supervised, --debate, --no-debate, --no-fan-out, --trivial
6. Determine branch prefix from artifact folder:
   - If artifact folder name starts with `BUG-`: branch prefix = `bugfix/`
   - Otherwise: branch prefix = `feature/` (fail-safe default, Article X)
7. Delegate to orchestrator via Task tool:
   MODE: init-only, ACTION: build, DESCRIPTION: "{item description}", FLAGS: {parsed flags}, BRANCH_PREFIX: "{branch_prefix}"
   Include: `ARTIFACT_FOLDER: "{item.slug}"` in the Task prompt (always present — analysis is required)
8. Orchestrator initializes active_workflow with type "build", creates branch using the branch prefix, does NOT run any phase (init-only mode)
9. Phase-Loop Controller drives all 4 build phases (05 → 06 → 16 → 08)

**--- TRIVIAL TIER EXECUTION ---** (GH-59, FR-006, FR-007, NFR-003, NFR-004, NFR-005, AD-03, AD-04, AD-06)

IMPORTANT: This section runs INSTEAD OF steps 4a through 9.
No workflow is created. No branch is created. No state.json is touched.
No hooks fire. No gates are checked. (NFR-005, AC-006a)

T1. Read requirements context:
    LET slugDir = docs/requirements/{slug}/
    LET context = null

    // Priority order per architecture Section 14
    FOR source IN ["requirements-spec.md", "impact-analysis.md", "quick-scan.md", "draft.md"]:
        LET filePath = path.join(slugDir, source)
        IF file exists at filePath:
            context = Read(filePath)
            LET contextSource = source
            BREAK

    IF context IS null:
        Display ERROR: "No requirements context found in {slugDir}."
        Display: "Cannot proceed with trivial tier without context."
        Display: "Add context first: /isdlc add or /isdlc analyze"
        EXIT build handler

T2. Display change context:
    Display:
    ```
    TRIVIAL CHANGE: {slug}

    Based on: {contextSource}
    Source: {meta.source} {meta.source_id || ""}
    ```
    Display relevant excerpts from context (problem statement, what to change)

T3. Assist with edit:
    // Framework uses standard Claude Code editing (Read/Edit tools)
    // to make the change on the current branch.
    // Read the context, identify target files, make edits.
    //
    // CONSTRAINTS:
    // - No branch creation (ASM-002: commit to current branch)
    // - No state.json writes (NFR-005)
    // - No workflow initialization
    // - No orchestrator delegation
    // - No hook invocation

    (Framework makes the edit interactively)

T4. User confirms:
    Display: "Changes made. Review and confirm? [Y/n/retry]"

    IF user selects "n" (abort):
        Display: "Trivial change aborted. No changes committed."
        EXIT build handler (no change record written)

    IF user selects "retry":
        GOTO T3

    // user selects "Y" or Enter: proceed to commit

T5. Commit to current branch:
    LET modifiedFiles = (list of files modified in T3)

    TRY:
        git add {modifiedFiles}
        git commit -m "{commitType}: {commitDescription} ({slug})"
        // commitType derived from context: "fix", "feat", "refactor", etc.
        // commitDescription: brief summary of the change
    CATCH error:
        Display ERROR: "Commit failed: {error.message}"
        Display:
        ```
        Options:
          [R] Retry the edit
          [E] Escalate to light tier (creates workflow)
          [A] Abort (no changes committed)
        ```
        IF [R]: GOTO T3
        IF [E]: Return to step 4a-tier with "light" pre-selected
        IF [A]: EXIT build handler
        // AC-006e: no change record on commit failure

    LET commitSHA = git rev-parse HEAD

T6. Write change-record.md (AC-007a, AC-007b):
    LET recordPath = path.join(slugDir, "change-record.md")
    LET timestamp = new Date().toISOString()
    LET diffOutput = {}

    // Gather diffs (first 20 lines per file, AC-007a)
    FOR EACH file IN modifiedFiles:
        LET diff = git diff HEAD~1 -- {file}
        LET diffLines = diff.split("\n")
        IF diffLines.length > 20:
            diffOutput[file] = diffLines.slice(0, 20).join("\n")
            diffOutput[file] += "\n... (diff truncated, " + (diffLines.length - 20) + " more lines)"
        ELSE:
            diffOutput[file] = diff

    // Build entry content
    LET entry = """
    ## Entry: {timestamp}

    **Tier**: trivial
    **Summary**: {what changed and why -- from context + edit description}
    **Files Modified**:
    {for each file: "- {relativePath}"}

    **Commit**: {commitSHA}

    ### Diff Summary

    {for each file:
    #### {fileName}
    ```diff
    {diffOutput[file]}
    ```
    }
    """

    // Append or create
    IF file exists at recordPath:
        LET existing = Read(recordPath)
        Write(recordPath, existing + "\n---\n\n" + entry)
    ELSE:
        LET header = """
        # Change Record: {slug}

        Audit trail for trivial-tier changes. Each entry below represents
        a direct edit made without a full workflow.

        ---

        """
        Write(recordPath, header + entry)

T7. Update meta.json (AC-007c):
    meta.tier_used = "trivial"
    meta.last_trivial_change = {
        completed_at: timestamp,
        commit_sha: commitSHA,
        files_modified: modifiedFiles  // relative paths
    }
    // Preserve analysis_status (AC-007c: "or preserved if already set")
    writeMetaJson(slugDir, meta)

T8. Update BACKLOG.md marker (AC-007d):
    LET backlogPath = path.join(projectRoot, "BACKLOG.md")
    updateBacklogMarker(backlogPath, slug, "x")
    // "x" = completed marker per existing convention

T9. Display completion summary (AC-006d):
    Display:
    ```
    Trivial change completed:
      Files modified: {modifiedFiles, comma-separated}
      Commit: {commitSHA.substring(0, 7)}
      Change record: docs/requirements/{slug}/change-record.md
    ```

EXIT build handler

**--- END TRIVIAL TIER EXECUTION ---**

---

**discover** - Analyze project and create tailored constitution
```
/isdlc discover
```

> **REDIRECTED:** This command has been moved to a dedicated `/discover` command for better separation of concerns.

**Usage:** Use `/discover` instead of `/isdlc discover`.

The `/discover` command provides:
- Project type detection (new vs existing)
- Architecture analysis (existing projects)
- Test infrastructure evaluation
- Constitution generation with research
- Skills installation from skills.sh
- Project structure setup (new projects)

See `/discover --help` for full documentation.

**Quick Start:** `/discover` (auto-detects new vs existing), `/discover --new` (force new project setup), `/discover --existing` (force existing project analysis).

---

**project list** - List all registered projects in monorepo (monorepo only)
```
/isdlc project list
```
1. Read `.isdlc/monorepo.json`
2. Display all registered projects with their paths and status
3. Indicate the current default project

**project add** - Manually register a project in monorepo (monorepo only)
```
/isdlc project add {id} {path}
```
1. Validate the path exists
2. Add project entry to `monorepo.json`
3. Create `.isdlc/projects/{project-id}/` directory with initial `state.json`
4. Create docs directory structure (`docs/{project-id}/` or `{project-path}/docs/` based on `docs_location` in monorepo.json)

**project scan** - Auto-detect projects from scan_paths (monorepo only)
```
/isdlc project scan
```
1. Read `scan_paths` from `monorepo.json`
2. Scan for projects (look for package.json, go.mod, Cargo.toml, etc. in subdirectories)
3. Present discovered projects for confirmation
4. Register confirmed projects

**project select** - Set the default project (monorepo only)
```
/isdlc project select {id}
```
1. Validate project ID exists in `monorepo.json`
2. Update `default_project` in `monorepo.json`
3. Confirm selection

---

**configure-cloud** - Configure or reconfigure cloud provider for deployment
```
/isdlc configure-cloud
```
Use this command to configure cloud deployment settings at any time, especially:
- After selecting "Not decided yet" during discover
- When workflow is paused at Phase 10
- To change cloud provider settings

**Procedure:**
1. Present cloud provider selection:
   ```
   Configure Cloud Provider for Deployment

   Current setting: [current provider or "undecided"]

   Where will this project be deployed?
   [1] AWS
   [2] GCP
   [3] Azure
   [4] Local only (no cloud deployment)
   ```

2. If cloud provider selected (1-3):
   - **AWS**: Collect profile and region
     ```
     AWS Configuration:
     > Profile name (from ~/.aws/credentials): [default]
     > Region: [us-east-1]
     ```
   - **GCP**: Collect project ID and region
     ```
     GCP Configuration:
     > Project ID: [my-project-123]
     > Region: [us-central1]
     ```
   - **Azure**: Collect subscription, resource group, region
     ```
     Azure Configuration:
     > Subscription ID: [...]
     > Resource Group: [...]
     > Region: [eastus]
     ```

3. Optionally validate credentials:
   ```
   Validate cloud credentials? [Y/n]
   ```
   - If yes: Run validation command for the provider
   - Report success/failure

4. Update `state.json`:
   - Set `cloud_configuration.provider`
   - Set provider-specific config (aws/gcp/azure)
   - Set `cloud_configuration.configured_at` to current timestamp
   - Set `cloud_configuration.credentials_validated`
   - Recalculate deployment flags:
     - `staging_enabled: true` if cloud provider
     - `production_enabled: true` if cloud provider
     - `workflow_endpoint: "13-operations"` if cloud provider
     - `workflow_endpoint: "10-local-testing"` if none

5. If workflow was paused at Phase 10 with provider "undecided":
   ```
   Cloud provider configured. Workflow can now continue.

   Current status: Phase 10 complete, GATE-10 passed
   Next action: Advance to Phase 11 (Staging Deployment)

   Continue workflow? [Y/n]
   ```
   - If yes: Advance to Phase 11
   - If no: Inform user to run `/isdlc advance` when ready

### Workflows

Each subcommand maps to a predefined workflow with a fixed, non-skippable phase sequence. Workflow definitions are in `.isdlc/config/workflows.json`.

| Command | Workflow | Phases | Gate Mode | Branch |
|---------|----------|--------|-----------|--------|
| `/isdlc add` | *(inline)* | *(no workflow)* | none | none |
| `/isdlc analyze` | *(inline)* | *(phases 00-04, no workflow)* | none | none |
| `/isdlc build` | build | 05 → 06 → 16(QL) → 08 | strict | `feature/REQ-NNNN-...` or `bugfix/BUG-NNNN-...` |
| `/isdlc test run` | test-run | 11 → 07 | strict | none |
| `/isdlc test generate` | test-generate | 05 → 06 → 16(QL) → 08 | strict | none |
| `/isdlc upgrade` | upgrade | 15-plan → 15-execute → 08 | strict | `upgrade/{name}-v{ver}` |

**Enforcement rules:**
- Workflows start at phase 1 — no `--start-at` flag
- Phases cannot be skipped within a workflow
- Only one active workflow at a time
- Starting a new workflow requires cancelling the active one first

### Examples

```
/isdlc add "Add payment processing"
/isdlc add "#42"
/isdlc add "JIRA-1250"
/isdlc analyze "payment-processing"
/isdlc analyze "#42"
/isdlc analyze "JIRA-1250"
/isdlc build "payment-processing"
/isdlc build "#42"
/isdlc build "payment-processing" --supervised
/isdlc test run
/isdlc test generate
/isdlc upgrade "react"
/isdlc upgrade "node"
/isdlc status
/isdlc cancel
```

### Prerequisites

1. **Project Constitution**: A valid `docs/isdlc/constitution.md` is required before starting any workflow
2. **Framework Installation**: The iSDLC framework must be installed (run `init-project.sh`)

### Implementation

When this command is invoked:

**If in monorepo mode** (`.isdlc/monorepo.json` exists at the resolved project root — found by walking up parent directories from CWD):
- If `--project {id}` flag is present: extract the project ID from the flag
- Otherwise: auto-detect project from CWD (use the relative path from project root to CWD, match against registered project paths, longest prefix match)
- Otherwise: fall back to `default_project` in `monorepo.json`
- Include `MONOREPO CONTEXT: --project {id}` in the Task prompt passed to the orchestrator
- The orchestrator will resolve all paths (state, docs, constitution, external skills) to that project

**If NO action argument provided (`/isdlc` alone):**
1. Use the Task tool to launch the `sdlc-orchestrator` agent
2. Pass explicit instruction: "No action specified. Present the interactive context-aware menu based on constitution status, workflow status, and existing project detection."
3. In monorepo mode with no project resolved, the orchestrator MUST present SCENARIO 0 first
4. Otherwise, present the appropriate scenario menu (1-4) based on detection logic
5. Wait for user selection before taking further action

**If action is `feature` or `fix`** (removed commands):
Display: "The `/isdlc fix` and `/isdlc feature` commands have been removed. Use `/analyze` to analyze items and `/build` to implement them."

**If action is a NON-WORKFLOW command** (cancel, status, gate-check, constitution, configure-cloud, or any unrecognized action):
1. Use the Task tool to launch the `sdlc-orchestrator` agent (single invocation)
2. Pass the action and any flags to the agent
3. The orchestrator handles it and returns

**If action starts with `skill`** (REQ-0022: External Skill Management):

Parse the subcommand: `add`, `wire`, `list`, or `remove`.

**`skill add <path>`** (FR-001, FR-002, FR-003, FR-004):
1. Extract `<path>` from user input
2. Read file at `<path>` using Read tool. If not found: display error, abort.
3. Validate the skill file inline:
   - Check `.md` extension
   - Check frontmatter presence (YAML `---` delimiters) and required fields (`name`, `description`)
   - Check name format (lowercase alphanumeric with hyphens, 2+ chars)
   - If validation fails: display all errors with correction guidance, abort
4. Check path traversal: filename must not contain `/`, `\`, or `..`
5. Load manifest via `loadExternalManifest()`. If null: initialize as `{ "version": "1.0.0", "skills": [] }`
6. Check for duplicate by name. If found: prompt "Skill '{name}' already exists. Overwrite? [Y/N]"
7. Copy file to external skills directory (resolve via `resolveExternalSkillsPath()`, create dir if needed)
8. Analyze content for binding suggestions (scan body for phase keywords, generate suggestions with confidence)
9. Delegate to `skill-manager` agent for wiring session (pass: skill name, description, suggestions, available phases)
10. Write manifest with skill entry (name, description, file, added_at, source: "user", bindings) (REQ-0001 FR-009: include source field)
11. Display confirmation: "Skill '{name}' registered and wired to phases: {phases}. Delivery: {delivery_type} | Mode: always"
12. Rebuild session cache (REQ-0001 FR-007): Run `node bin/rebuild-cache.js`. If the rebuild fails, log a warning but do not fail the skill add operation.

**`skill wire <name>`** (FR-003, FR-009):
1. Load manifest. Find skill by name. If not found: display error with suggestion to run `skill list`.
2. Delegate to `skill-manager` agent with existing bindings pre-loaded.
3. Update skill entry with new bindings. Write manifest. Display confirmation.
4. Rebuild session cache (REQ-0001 FR-007): Run `node bin/rebuild-cache.js`. If the rebuild fails, log a warning but do not fail the skill wire operation.

**`skill list`** (FR-006):
1. Load manifest. If null or empty: display "No external skills registered. Use '/isdlc skill add <path>' to add one."
2. For each skill: display formatted entry (name, phases, delivery type, mode).

**`skill remove <name>`** (FR-007):
1. Load manifest. Find skill by name. If not found: display error.
2. Prompt: "Remove '{name}'? [K] Keep file [D] Delete file [C] Cancel"
3. On K: Remove from manifest, preserve file. On D: Remove from manifest, delete file. On C: Abort.
4. Write updated manifest. Display confirmation.
5. Rebuild session cache (REQ-0001 FR-007): Run `node bin/rebuild-cache.js`. If the rebuild fails, log a warning but do not fail the skill remove operation.

**If action is `add`**: Execute add handler inline -- no orchestrator, no Phase-Loop Controller.

**If action is `analyze`**: Execute analyze handler inline -- no orchestrator, no Phase-Loop Controller.

**If action is `build`**: Execute the build handler (steps 1-9 above) then use the Phase-Loop Controller for orchestrator delegation.

**If action is a WORKFLOW command** (test-run, test-generate, upgrade) **with description:**

Use the **Phase-Loop Controller** protocol. This runs phases one at a time in the foreground, giving the user visible task progress and immediate hook-blocker escalation.

Read `agent_modifiers` for this phase from `.isdlc/state.json` → `active_workflow.type`, then look up the workflow in `workflows.json` → `workflows[type].agent_modifiers[phase_key]`. If modifiers exist, include them as `WORKFLOW MODIFIERS: {json}` in the prompt.

**Discovery context** (all phases): Check if session context contains `<!-- SECTION: DISCOVERY_CONTEXT -->`. If found, extract the full section content and include it as a `DISCOVERY CONTEXT` block in the delegation prompt. If not found (cache absent or section missing), omit the block entirely. Project knowledge is delivered via AVAILABLE SKILLS and the SessionStart cache — the legacy `state.json → discovery_context` fallback has been removed (discovery_context is retained in state.json as audit-only metadata for provenance tracking).

**Skill injection** (before constructing the Task tool prompt below, execute these steps to build skill context):

**SKILL INJECTION STEP A — Built-In Skill Index** (REQ-0001 FR-005):
1. Check if session context contains `<!-- SECTION: SKILL_INDEX -->`.
   If found:
     a. Extract the block for the current agent by searching for `## Agent: {agent_name}` within the SKILL_INDEX section.
     b. Extract from `## Agent: {agent_name}` up to the next `## Agent:` heading or the closing `<!-- /SECTION: SKILL_INDEX -->` delimiter.
     c. Save the extracted block as `{built_in_skills_block}`.
   If not found (cache absent or section missing):
     a. FALLBACK: Run this single-line Bash command (replace `{agent_name}` with the resolved agent name from the table above):
        ```
        node -e 'const c = require("./src/claude/hooks/lib/common.cjs"); const r = c.getAgentSkillIndex("{agent_name}"); process.stdout.write(c.formatSkillIndexBlock(r));'
        ```
     b. If the Bash tool call succeeds and produces non-empty stdout: save the output as `{built_in_skills_block}`.
     c. If the Bash tool call fails or produces empty output: set `{built_in_skills_block}` to empty string.
2. Continue to Step B.

**SKILL INJECTION STEP B — External Skills** (fail-open — if ANY step fails, set `{external_skills_blocks}` to empty and skip to Step C) (REQ-0001 FR-005):
1. Check if session context contains `<!-- SECTION: EXTERNAL_SKILLS -->`.
   If found AND the section contains skill entries matching the current `{phase_key}` or `{agent_name}`:
     a. Extract matching skill blocks from the EXTERNAL_SKILLS section.
     b. Format each block per the delivery_type rules (steps 6d-6e below).
     c. Join as `{external_skills_blocks}`.
     d. SKIP to Step C.
   If not found (cache absent or section missing):
     a. FALLBACK: Continue with disk-based approach (existing steps 2-7 below).
2. Determine the external skills manifest path:
   - If MONOREPO CONTEXT is present in the current delegation: `docs/isdlc/projects/{project-id}/external-skills-manifest.json`
   - Otherwise: `docs/isdlc/external-skills-manifest.json`
3. Read the manifest file using Read tool.
   - If file does not exist or Read fails: set `{external_skills_blocks}` to empty. SKIP to Step C.
4. Parse the content as JSON. If parse fails: set `{external_skills_blocks}` to empty. SKIP to Step C.
5. Filter `manifest.skills[]` array: keep only skills where ALL of these conditions are true:
   - `skill.bindings` exists (skip skills without bindings for backward compatibility)
   - `skill.bindings.injection_mode === "always"`
   - EITHER the current `{phase_key}` is in `skill.bindings.phases[]` OR the current `{agent_name}` is in `skill.bindings.agents[]`
6. If no skills match the filter: set `{external_skills_blocks}` to empty. SKIP to Step C.
7. For each matched skill:
   a. Determine the external skills directory:
      - If MONOREPO CONTEXT: `.isdlc/projects/{project-id}/skills/external/`
      - Otherwise: `.claude/skills/external/`
   b. Read `{skills_directory}/{skill.file}` using Read tool.
   c. If Read fails for this skill: skip this skill, continue with next matched skill.
   d. Let `content` = the file contents. If `content.length > 10000` characters: set `delivery_type` to `"reference"` regardless of `skill.bindings.delivery_type`.
   e. Format the skill block based on `delivery_type` (use `skill.bindings.delivery_type` unless overridden by step 7d):
      - `"context"`: `EXTERNAL SKILL CONTEXT: {skill.name}\n---\n{content}\n---`
      - `"instruction"`: `EXTERNAL SKILL INSTRUCTION ({skill.name}): You MUST follow these guidelines:\n{content}`
      - `"reference"`: `EXTERNAL SKILL AVAILABLE: {skill.name} -- Read from {skills_directory}/{skill.file} if relevant to your current task`
8. Join all formatted skill blocks with double newlines (`\n\n`) as `{external_skills_blocks}`.

**SKILL INJECTION STEP C — Assemble into delegation prompt**:
- If `{built_in_skills_block}` is non-empty: include it in the delegation prompt after WORKFLOW MODIFIERS (or after DISCOVERY CONTEXT if present from SessionStart cache).
- If `{external_skills_blocks}` is non-empty: include it after `{built_in_skills_block}`, separated by a blank line.
- If both are empty: include nothing — no skill-related content in the prompt.

#### STEP 1: INIT — Launch orchestrator for workflow initialization

```
Use Task tool → sdlc-orchestrator with:
  MODE: init-only
  ACTION: {build|test-run|test-generate|upgrade}
  DESCRIPTION: "{user description}"
  (include MONOREPO CONTEXT if applicable)

  // REQ-0026: Build auto-detection parameters (only for build/feature):
  // Include these ONLY when the build handler (steps 4a-4e) determined them:
  START_PHASE: "{startPhase}"       // Only if startPhase is not null
  ARTIFACT_FOLDER: "{item.slug}"    // Only if item was resolved from an existing directory
```

The orchestrator initializes the workflow and creates the branch but does NOT execute any phase. It returns:
```json
{
  "status": "init_complete",
  "phases": ["01-requirements", "02-impact-analysis", "03-architecture", "04-design", "05-test-strategy", "06-implementation", "16-quality-loop", "08-code-review"],
  "artifact_folder": "REQ-0001-feature-name",
  "workflow_type": "feature",
  "next_phase_index": 0
}
```
Note: When `START_PHASE` is provided, the `phases[]` array may be shorter (only phases from START_PHASE onward). When absent, the orchestrator returns all workflow phases. `next_phase_index` is always 0 (no phases have been executed).

If initialization fails, stop here.

**BUILD-INIT COPY (REQ-GH-212 FR-004)**: If the artifact folder has a pre-generated tasks.md, copy it to the isdlc working directory.
1. Check if `docs/requirements/{artifact_folder}/tasks.md` exists.
2. If yes: copy it to `docs/isdlc/tasks.md`. Log: "Copied pre-generated task plan from {artifact_folder}."
3. If copy fails: retry up to 3 times. If all retries fail, display error and STOP (see step 4).
4. If no pre-generated tasks.md exists: display error `ERR-BUILD-002: No tasks.md found in artifact folder. Analysis must produce a task plan before build can proceed.` and STOP the build handler.

#### STEP 2: FOREGROUND TASKS — Create visible task list

Using the `phases[]` array from the init result, create one `TaskCreate` per phase. Assign each task a **sequential number** starting at 1, incrementing by 1 for each phase in the workflow. Use the format `[N]` as a prefix in the subject.

**IMPORTANT**: The `phases[]` array from the init result uses keys from `workflows.json` (the source of truth). Use these exact keys to look up subjects in the table below. Maintain a mapping of `{phase_key → task_id}` so you can update the correct task in STEP 3.

Look up the base subject and activeForm from this table:

| Phase Key | base subject | activeForm |
|-----------|---------|------------|
| `00-quick-scan` | Quick scan codebase (Phase 00) | Scanning codebase |
| `01-requirements` | Capture requirements (Phase 01) | Capturing requirements |
| `02-tracing` | Trace bug root cause (Phase 02) | Tracing bug root cause |
| `02-impact-analysis` | Analyze impact (Phase 02) | Analyzing impact |
| `03-architecture` | Design architecture (Phase 03) | Designing architecture |
| `04-design` | Create design specifications (Phase 04) | Creating design specifications |
| `05-test-strategy` | Design test strategy (Phase 05) | Designing test strategy |
| `06-implementation` | Implement features (Phase 06) | Implementing features |
| `16-quality-loop` | Run parallel quality loop (Phase 16) | Running quality loop |
| `11-local-testing` | Build and launch local environment (Phase 11) | Building local environment |
| `07-testing` | Run integration and E2E tests (Phase 07) | Running integration tests |
| `08-code-review` | Perform code review and QA (Phase 08) | Performing code review |
| `15-upgrade-plan` | Analyze upgrade impact and generate plan (Phase 15) | Analyzing upgrade impact |
| `15-upgrade-execute` | Execute upgrade with regression testing (Phase 15) | Executing upgrade |

**Subject format**: `[N] {base subject}` — e.g. `[1] Capture requirements (Phase 01)`, `[2] Analyze impact (Phase 02)`

For `description`, use: `"Phase {NN} of {workflow_type} workflow"`

All tasks start as `pending`. No task is pre-marked as completed -- the Phase-Loop Controller will mark each task as `in_progress` and then `completed` as it executes each phase.

The user now sees the full task list in their terminal with sequential numbering.

**PARENT TASK HYDRATION (REQ-GH-223 FR-004)**: After creating phase-level tasks, hydrate parent task context from tasks.md.
1. Call readTaskPlan(path.join(projectRoot, 'docs/isdlc/tasks.md'))
2. If plan exists and is valid: store plan in memory for STEP 3 TASK_CONTEXT injection and sub-task creation
3. For each parent task in the plan (ID matches TNNN without letter suffix): log parent task count per phase
4. If readTaskPlan fails: log warning, continue — phase-level tasks are sufficient for progress tracking
5. This hydration enables the Sub-Task Creation Protocol (CLAUDE.md) to create TaskCreate entries for sub-tasks during phase execution

#### STEP 3: PHASE LOOP — Execute all phases one at a time

For each phase from `next_phase_index` (0) through the end of `phases[]`:

**3a.** Mark the phase task as `in_progress` using `TaskUpdate` (user sees spinner).

**3b.** Read `.isdlc/state.json`. Before checking escalations, perform stale phase detection:

**3b-stale.** STALE PHASE DETECTION (INV-0055 REQ-006):
1. Read `phases[current_phase_key].status` and `phases[current_phase_key].timing.started_at`
2. If `status === "in_progress"` AND `started_at` exists:
   a. Compute `elapsed_minutes = Math.round((Date.now() - new Date(started_at).getTime()) / 60000)`
   b. Read phase timeout from `iteration-requirements.json`: `phase_requirements[current_phase_key].timeout_minutes` (default: 120)
   c. If `elapsed_minutes > timeout * 2`:
      Display stale phase warning banner:
      ```
      ========================================
      WARNING: Stale Phase Detected
      Phase: {current_phase_key}
      Started: {started_at}
      Elapsed: {elapsed_minutes} minutes (timeout: {timeout} minutes)
      This phase may have been interrupted by a crash or timeout.
      ========================================
      ```
      Use `AskUserQuestion` with options:
      - **[R] Retry phase** -- Clear timing, re-run the phase from STEP 3c-prime
      - **[S] Skip phase** -- Mark phase completed with summary "Skipped (stale)", continue
      - **[C] Cancel workflow** -- Launch orchestrator with cancel action, stop loop
3. If status is not `in_progress`, or `started_at` is missing, or elapsed is within threshold: skip silently.

Then check for `pending_escalations[]` (existing behavior, unchanged).

**3c.** If escalations exist, display the blocker banner and ask the user:

```
╔══════════════════════════════════════════════════════════════╗
║  BLOCKER — Phase {NN}: {Phase Name}                        ║
╠══════════════════════════════════════════════════════════════╣
║  Hook: {hook_name}                                         ║
║  Detail: {description}                                     ║
╚══════════════════════════════════════════════════════════════╝
```

Use `AskUserQuestion` with options:
- **Retry phase** — Clear escalations, re-run the phase
- **Skip (override)** — Clear escalations, mark task completed, continue
- **Cancel workflow** — Launch orchestrator with cancel action, stop loop

Clear `pending_escalations` after handling.

**3c-prime.** PRE-DELEGATION STATE UPDATE — Write phase activation to `state.json` BEFORE delegating to the phase agent. This ensures hooks see the correct state when the agent starts executing.

Using the `state.json` already read in step 3b, update the following fields:

1. Set **top-level** `phases` object → `phases[phase_key].status` = `"in_progress"` (this is the detailed phases object near the bottom of state.json, NOT `active_workflow.phase_status`)
2. Set **top-level** `phases` object → `phases[phase_key].started` = current ISO-8601 timestamp (only if not already set — preserve existing start time on retries)
3. Set `active_workflow.current_phase` = `phase_key`
4. Set `active_workflow.phase_status[phase_key]` = `"in_progress"` <!-- DEPRECATED (INV-0055): active_workflow.phase_status will be removed in Phase B. phases[phase_key].status (step 1) is authoritative. V9 cross-check validates consistency. -->
5. Set top-level `current_phase` = `phase_key`
6. Set top-level `active_agent` = agent name (resolved from PHASE_AGENT_MAP below)
7. Write `.isdlc/state.json`

**IMPORTANT**: Steps 1-2 and step 4 update DIFFERENT locations. `phases[phase_key]` (steps 1-2) is the detailed phase tracking object near the bottom of state.json. `active_workflow.phase_status[phase_key]` (step 4) is the summary map inside the workflow. Both MUST be updated — hooks read from the detailed `phases` object.

**3c-prime-timing.** PER-PHASE TIMING START (REQ-0022) -- After writing phase activation state:

8. **Initialize or preserve timing object**:
   - If `phases[phase_key].timing` does NOT exist (first run):
     - Create: `phases[phase_key].timing = { started_at: "<current ISO-8601>", retries: 0 }`
   - If `phases[phase_key].timing.started_at` already exists (retry case -- supervised redo or blast-radius re-run):
     - Increment: `phases[phase_key].timing.retries += 1`
     - Do NOT overwrite `started_at` -- preserve the original start time (AC-001c)

9. **Error handling**: If timing initialization fails, log a warning to stderr and continue.
   The phase MUST proceed regardless of timing errors (NFR-001).

**3d.** PHASE DELEGATION — Determine dispatch mode and delegate.

**3d-check.** TASK-LEVEL DISPATCH CHECK (REQ-GH-220):
Read `task_dispatch` config from `workflows.json`. Determine if this phase should use task-level dispatch:

Call `shouldUseTaskDispatch(workflowConfig, phase_key, tasksPath)` from `src/core/tasks/task-dispatcher.js` which checks:
1. `task_dispatch.enabled` and `phase_key` in `task_dispatch.phases` (from workflows.json)
2. `docs/isdlc/tasks.md` exists and has pending tasks for this phase
3. There are >= `task_dispatch.min_tasks_for_dispatch` (default 3) pending tasks

IF all checks pass → Execute **STEP 3d-tasks** (Task-Level Dispatch Protocol) below.
ELSE → Execute **STEP 3d-single** (existing single-call delegation) below.

**3d-tasks.** TASK-LEVEL DISPATCH PROTOCOL (REQ-GH-220, FR-001 through FR-008):

This protocol dispatches tasks one-per-agent in dependency order, with parallel execution within tiers.

1. **Read and plan**: Read `docs/isdlc/tasks.md` using `task-reader.js`. Filter tasks for the current `phase_key`. Compute tiers using `assignTiers()` — tier 0 has tasks with no blockers, tier 1 has tasks blocked by tier 0, etc.

2. **Initialize accumulator**: Create a `priorCompletedFiles` list (starts empty, accumulates files from completed tasks in this phase).

3. **For each tier** (sequential, tier 0 first):

   a. **Get unblocked tasks**: Filter the tier's tasks to only those not yet complete (`[ ]` not `[X]`).

   b. **Build per-task prompts**: For each task in the tier, construct a focused prompt:
      ```
      Execute task {task.id}: {task.description}
      Phase: {phase_key}
      Agent type: {agent_name from PHASE→AGENT table}
      Artifact folder: {artifact_folder}

      FILES:
      {for each file in task.files: "- {file.path} ({file.operation})"}

      TRACES:
      {task.traces joined with ", "}

      PRIOR COMPLETED FILES (this phase):
      {priorCompletedFiles list, or "(none)" if empty}

      CONTEXT:
      {Read the traced FR/AC sections from requirements-spec.md and include only the relevant excerpts}

      CONSTRAINTS:
      - Do NOT run git commit
      - Do NOT write to .isdlc/state.json
      - Implement ONLY the files listed above
      - Run tests for your changes before returning
      - Return a brief summary of what you implemented
      ```
      Include the same GATE REQUIREMENTS, PROTOCOL INJECTION, and SKILL INJECTION blocks as the single-call delegation (from step 3d-single below), but scoped to this single task.

   c. **Dispatch in parallel**: Issue one Task tool call per task in the tier, ALL in a single response (parallel execution). Use the agent type from the PHASE→AGENT table (same for all tasks in the phase).

   d. **Create task visibility**: Before dispatching, create a `TaskCreate` entry for each **top-level** task in the tier (task IDs matching `/^T\d+$/` — skip sub-tasks with letter suffixes like T006a). Subject = `{task.id}: {task.description}`, activeForm = `Implementing {task.id}`.

   e. **Handle returns**: For each task that returns:
      - **Success**: Read `docs/isdlc/tasks.md`, replace `- [ ] {task.id}` with `- [X] {task.id}`, recalculate Progress Summary table, write tasks.md. For top-level tasks (IDs matching `/^T\d+$/`): update the TaskCreate entry subject to `~~{task.id}: {task.description}~~` and set status to completed. Add the task's file paths to `priorCompletedFiles`.
      - **Failure**: Increment retry counter for this task. If retries < `task_dispatch.max_retries_per_task` (default 3): re-dispatch with the error message appended to the prompt. If retries >= max: present escalation menu:
        ```
        TASK FAILURE: {task.id} failed after {retries} retries.
        Error: {error message}

        Options:
        [R] Retry — Re-dispatch one more time
        [S] Skip — Skip this task and its dependents
        [C] Cancel phase
        ```
        If Skip: mark this task and all tasks that have it in `blocked_by` as `[SKIP]` in tasks.md with reason.

   f. **Persist task entries**: Per-task TaskCreate entries remain visible. No deletion at tier boundary — entries persist through the phase and are cleaned up at STEP 3f (phase boundary).

   g. **Next tier**: Proceed to the next tier. Repeat from step 3a.

4. **All tiers complete**: Proceed to step 3e (post-phase state update). The phase task in the main task list is marked completed by step 3f.

**3d-single.** DIRECT PHASE DELEGATION (existing behavior) — Bypass the orchestrator and delegate directly to the phase agent. This is used for self-orchestrating phases (16, 08) and as fallback when task-level dispatch criteria are not met.

Look up the agent for this phase from the PHASE→AGENT table:

| Phase Key | Agent (`subagent_type`) |
|-----------|------------------------|
| `00-quick-scan` | `quick-scan-agent` |
| `01-requirements` | `requirements-analyst` |
| `02-impact-analysis` | `impact-analysis-orchestrator` |
| `02-tracing` | `tracing-orchestrator` |
| `03-architecture` | `solution-architect` |
| `04-design` | `system-designer` |
| `05-test-strategy` | `test-design-engineer` |
| `06-implementation` | `software-developer` |
| `07-testing` | `integration-tester` |
| `08-code-review` | `qa-engineer` |
| `09-validation` | `security-compliance-auditor` |
| `10-cicd` | `cicd-engineer` |
| `11-local-testing` | `environment-builder` |
| `12-remote-build` | `environment-builder` |
| `12-test-deploy` | `deployment-engineer-staging` |
| `13-production` | `release-manager` |
| `14-operations` | `site-reliability-engineer` |
| `15-upgrade-plan` | `upgrade-engineer` |
| `15-upgrade-execute` | `upgrade-engineer` |
| `16-quality-loop` | `quality-loop-engineer` |

```
Use Task tool → {agent_name} with:
  "Execute Phase {NN} - {Phase Name} for {workflow_type} workflow.
   Artifact folder: {artifact_folder}
   Phase key: {phase_key}
   {WORKFLOW MODIFIERS: {json} — if applicable}
   {DISCOVERY CONTEXT: ... — if present in SessionStart cache}
   {built_in_skills_block — from SKILL INJECTION STEP A above, omit if empty}
   {external_skills_blocks — from SKILL INJECTION STEP B above, omit if empty}
   {GATE REQUIREMENTS INJECTION (REQ-0024, REQ-0001 FR-005) — Inject gate pass criteria so the agent knows what hooks will check before it starts. This block is fail-open — if anything fails, continue with the unmodified prompt.
    1. Check if session context contains `<!-- SECTION: ITERATION_REQUIREMENTS -->`.
       If found: parse the JSON content from that section.
       If not found: Read `src/claude/hooks/config/iteration-requirements.json` using Read tool.
       If neither succeeds: SKIP injection entirely (no-op).
       Parse as JSON. If parse fails: SKIP injection.
    2. Look up `phase_requirements[{phase_key}]` from the parsed config.
       If the phase key has no entry: SKIP injection (phase has no gate requirements).
    3. Check if session context contains `<!-- SECTION: ARTIFACT_PATHS -->`.
       If found: parse the JSON content from that section.
       If not found: Read `src/claude/hooks/config/artifact-paths.json` using Read tool (optional — skip if missing).
       Extract `phases[{phase_key}].paths[]` if present. For each path, replace `{artifact_folder}` with the actual artifact folder name.
    4. If `constitutional_validation` is enabled for this phase:
       Check if session context contains `<!-- SECTION: CONSTITUTION -->`.
       If found: extract article titles from the cached constitution content.
       If not found: read `docs/isdlc/constitution.md` from disk.
       Extract article titles using the pattern `### Article {ID}: {Title}` for each article ID listed in the phase config's `constitutional_validation.articles[]` array.
    5. Read `active_workflow.phases` array from state.json (the ordered list of phase keys in the current workflow).
       If missing or not an array: use `null` (the injector will use fail-safe defaults).
    6. Format and append the gate requirements block to the delegation prompt.
       The block now includes a CRITICAL CONSTRAINTS section at the top (with imperative prohibitions)
       and a REMINDER footer at the bottom. The format is produced by the gate-requirements-injector
       using the phase key, artifact folder, workflow type, project root, and phases array.
       The injector derives constraints automatically from the phase configuration:
       - Intermediate phases get "Do NOT run git commit" prohibition
       - Phases with test_iteration get coverage gate constraint
       - Phases with constitutional_validation get constitutional reminder
       - Workflow modifiers (e.g., require_failing_test_first) surface as imperative statements
    7. After the gate requirements block, append this acknowledgment instruction on a new line:
       "Read the CRITICAL CONSTRAINTS block above and confirm you will comply before starting work."
    8. Error handling: If any error occurs in steps 1-7, continue with unmodified prompt. Log warning but never block.}
   {ATDD_CONFIG INJECTION (REQ-GH-216 FR-004, AC-004-03) -- Inject atdd.* config values into Phase 05 and Phase 06 delegation prompts. Fail-open.
    1. Only inject for phase_key in ['05-test-strategy', '06-implementation']. Other phases: SKIP.
    2. Read atdd config via ConfigService bridge:
       `node -e 'const {getAtdd} = require("./src/core/bridge/config.cjs"); process.stdout.write(JSON.stringify(getAtdd()))'`
       If the bash call fails or returns invalid JSON: SKIP injection (agent uses defaults).
    3. Parse the JSON. If parse fails: SKIP injection.
    4. Append to delegation prompt:
       ATDD_CONFIG:
         enabled: {atdd.enabled}
         require_gwt: {atdd.require_gwt}
         track_red_green: {atdd.track_red_green}
         enforce_priority_order: {atdd.enforce_priority_order}
    5. Phase 05 and Phase 06 agents MUST read ATDD_CONFIG and gate behavior on its values. Missing block -> agents fall back to all-true defaults.
    6. Error handling: Any failure -> skip injection, continue. Never block delegation.}
   {BUDGET DEGRADATION INJECTION (REQ-0022) -- Inject degradation directive when budget is exceeded or approaching. Fail-open.
    1. Read `active_workflow.budget_status` from state.json.
       If `budget_status` is `"on_track"`, missing, or null: SKIP degradation injection.
       If `budget_status` is `"exceeded"` or `"approaching"`: Continue.
    2. Read the performance budget for `effective_intensity = active_workflow.sizing.effective_intensity || "standard"`.
       Look up `performance_budgets[effective_intensity]` from workflows.json.
       If not found, use defaults: standard = { max_debate_rounds: 2, max_fan_out_chunks: 4 }.
    3. Read workflow flags: `no_debate = active_workflow.options?.no_debate || false`, `no_fan_out = active_workflow.options?.no_fan_out || false`.
    4. Compute degradation:
       - Debate-enabled phases (01-requirements, 03-architecture, 04-design, 05-test-strategy):
         If --no-debate: skip. If exceeded: max_debate_rounds=1. If approaching: max_debate_rounds=max(1, tier_max-1).
       - Fan-out phases (16-quality-loop, 08-code-review):
         If --no-fan-out: skip. If exceeded: max_fan_out_chunks=2. If approaching: max_fan_out_chunks=max(2, floor(tier_max/2)).
       - Other phases: no degradation.
    5. If degradation applies, append to delegation prompt:
       BUDGET_DEGRADATION:
         budget_status: {status}
         {max_debate_rounds: N or max_fan_out_chunks: N}
         reason: "{reason}"
         phase: {phase_key}
    6. Record degraded values for STEP 3e.
    7. Error handling: If any step fails, skip injection and continue.}
   {TASK_CONTEXT INJECTION (REQ-GH-212 FR-007) -- Inject parsed task context for task-driven phase execution. Fail-open.
    1. Import readTaskPlan, formatTaskContext from src/core/tasks/task-reader.js
    2. Call readTaskPlan(path.join(projectRoot, 'docs/isdlc/tasks.md'))
    3. If null or error: SKIP injection (log warning if error)
    4. Determine options:
       - includeTestMapping = phase_key in ['06-implementation', '16-quality-loop']
       - testStrategyPath = docs/requirements/{artifact_folder}/test-strategy.md
    5. Call formatTaskContext(plan, phaseKey, options)
    6. Append result to delegation prompt
    7. Error handling: If any step fails, skip injection and continue. Never block.}
   {PROTOCOL INJECTION (REQ-GH-116) -- Inject CLAUDE.md protocol sections and user instructions into delegation prompt. Fail-open.
    1. Read `src/claude/hooks/config/protocol-mapping.json` using Read tool.
       If file missing or parse fails: SKIP injection entirely (fail-open).
    2. Determine source file from mapping config:
       - Claude provider: read `CLAUDE.md` from project root
       - Codex provider: read `AGENTS.md` from project root
       If source file missing or unreadable: SKIP injection (fail-open).
    3. Extract protocol section: find content between `protocol_section_start` and `protocol_section_end` headers.
       If boundaries not found: SKIP injection (fail-open).
    4. For each protocol in `mapping.protocols` where `phases` includes current `{phase_key}` or `"all"`:
       - Find the header line in the extracted section
       - Extract text from header to the next `###` header or end of protocol section
       - Accumulate into `{protocols_block}`
    5. If `{protocols_block}` is non-empty, format and append:
       ```
       PROTOCOLS (from CLAUDE.md — these are mandatory behavioral constraints):
       {protocols_block}
       ```
    6. Extract user content: source file content that is NOT inside `<!-- SECTION: -->` / `<!-- /SECTION: -->` markers AND NOT inside the protocol range (`protocol_section_start` to `protocol_section_end`).
       If non-empty, format and append:
       ```
       USER INSTRUCTIONS (from CLAUDE.md — project-specific guidance):
       {user_content_block}
       ```
    7. Error handling: Any failure at any step → log warning to stderr, continue with unmodified prompt. Never block delegation.}
   PHASE_TIMING_REPORT: Include { "debate_rounds_used": 0, "fan_out_chunks": 0 } in your result.
   Do NOT emit SUGGESTED NEXT STEPS or prompt the user to continue — the Phase-Loop Controller manages phase transitions. Simply return your result.
   Validate GATE-{NN} on completion."
```

**3d-relay.** INTERACTIVE PHASE RELAY — If the current phase has `interactive_elicitation.enabled: true` in iteration-requirements.json (currently: `01-requirements`), the phase agent is conversational and will RETURN when it needs user input. Enter a relay-and-resume loop:

WHILE the phase agent has NOT signaled completion:
  i.   **Output the agent's text VERBATIM as your response.**
       Copy-paste it. Do NOT summarize it into tables.
       Do NOT paraphrase it. Do NOT add headings like "Requirements Analyst:" above it.
       Do NOT re-present the agent's tables or menus in your own formatting.
       The agent's output IS the user-facing content — just emit it directly.
  ii.  **Let the user respond naturally.**
       Do NOT use AskUserQuestion. Do NOT present multiple-choice options.
       Do NOT create menus like "Looks good, continue / Needs adjustment".
       The agent presents its own menus — the user responds with their choice.
  iii. Resume the phase agent (using the `resume` parameter with the agent's ID),
       passing ONLY the user's exact response as the prompt.
       Do NOT add your own instructions, commentary, or analysis.
  iv.  On return, check if the agent signaled completion
       (output ends with "REQUIREMENTS_COMPLETE"). If yes, exit loop.

**Completion signal**: The requirements-analyst signals completion by including "REQUIREMENTS_COMPLETE" as the last line of its final output.

**Orchestrator boundary**: During the relay loop, you are INVISIBLE. You are a relay. You do not:
- Summarize the agent's output ("The analyst is asking about...")
- Add your own tables or formatting
- Present AskUserQuestion menus
- Add commentary between the agent's output and the user's response
- Interpret what the agent said
The phase agent owns the entire user-facing experience. Your only job is: emit agent output → wait for user text → resume agent.

**Non-interactive phases**: If the phase does NOT have `interactive_elicitation.enabled: true`, skip this step entirely — the agent returns its final result in one shot and you proceed directly to step 3e.

**3e.** POST-PHASE STATE UPDATE — After the phase agent returns successfully:
1. Read `.isdlc/state.json`
2. Set **top-level** `phases` object → `phases[phase_key].status` = `"completed"` (the detailed phases object near the bottom of state.json, NOT `active_workflow.phase_status`)
3. Set **top-level** `phases` object → `phases[phase_key].summary` = (extract from agent result, max 150 chars)
4. Set `active_workflow.current_phase_index` += 1
5. Set `active_workflow.phase_status[phase_key]` = `"completed"` (BUG-0005: sync phase_status map) <!-- DEPRECATED (INV-0055): active_workflow.phase_status will be removed in Phase B. phases[phase_key].status (step 2) is authoritative. -->
6. If more phases remain: (BUG-0006: next-phase activation moved to STEP 3c-prime at start of next iteration)
   - No action needed here — the next iteration's STEP 3c-prime handles phase activation
7. Write `.isdlc/state.json`
8. Update `docs/isdlc/tasks.md` (if it exists):
   - Find the completed phase section header (e.g., `## Phase NN: ... -- PENDING` or `-- IN PROGRESS`)
   - Change section header status to `-- COMPLETE`
   - Change all `- [ ] TNNNN ...` to `- [X] TNNNN ...` within that section (preserve pipe annotations like `| traces: AC-03a`)
   - Recalculate the Progress Summary table: update completed task counts per phase, total count, and percentage
   - Write the updated `docs/isdlc/tasks.md`
   - If `docs/isdlc/tasks.md` does not exist, skip this step silently

**3e-timing.** PER-PHASE TIMING END AND BUDGET CHECK (REQ-0022) -- After writing phase status = "completed" and incrementing current_phase_index:

18. **Record timing end**:
    - `phases[phase_key].timing.completed_at = new Date().toISOString()`
    - Compute wall-clock duration:
      `start = new Date(phases[phase_key].timing.started_at).getTime()`
      `end = new Date(phases[phase_key].timing.completed_at).getTime()`
      `phases[phase_key].timing.wall_clock_minutes = Math.round((end - start) / 60000)`
    - If `started_at` is missing or invalid, set `wall_clock_minutes = 0` and log warning.

19. **Extract PHASE_TIMING_REPORT from agent result**:
    - Scan the agent's response text for a line matching:
      `PHASE_TIMING_REPORT: { "debate_rounds_used": N, "fan_out_chunks": N }`
    - Parse the JSON object from that line.
    - Write:
      `phases[phase_key].timing.debate_rounds_used = parsed.debate_rounds_used || 0`
      `phases[phase_key].timing.fan_out_chunks = parsed.fan_out_chunks || 0`
    - If the line is not found or parsing fails: default both to `0`.

20. **Record degradation values** (if BUDGET_DEGRADATION was injected in STEP 3d for this phase):
    - `phases[phase_key].timing.debate_rounds_degraded_to = <degraded debate limit or null>`
    - `phases[phase_key].timing.fan_out_degraded_to = <degraded fan-out limit or null>`
    - If no degradation was applied: set both to `null`.

21. **Budget check**:
    a. Determine effective intensity:
       `effective_intensity = active_workflow.sizing?.effective_intensity || "standard"`
    b. Read performance budget for this intensity from workflows.json.
       If missing, use hardcoded defaults.
    c. Compute elapsed workflow time:
       `elapsed = Math.round((Date.now() - new Date(active_workflow.started_at).getTime()) / 60000)`
    d. Compute budget status:
       - `<= 80%`: `"on_track"`, `> 80%` and `<= 100%`: `"approaching"`, `> 100%`: `"exceeded"`
    e. Write budget status:
       `active_workflow.budget_status = <result>`
    f. If result is `"exceeded"` AND `active_workflow.budget_exceeded_at_phase` is NOT already set:
       `active_workflow.budget_exceeded_at_phase = phase_key`
    g. Emit warnings to stderr:
       - If `"exceeded"`: `BUDGET_WARNING: Workflow has consumed {elapsed}m of {budget}m budget ({percent}%). Phase {phase_key} took {wall_clock_minutes}m. [{intensity} tier]`
       - If `"approaching"`: `BUDGET_APPROACHING: Workflow at {percent}% of {budget}m budget. {remaining}m remaining. [{intensity} tier]`
       - If `"on_track"`: No output.

22. **Write state.json**: Persist all timing and budget updates in a single state write.

23. **Error handling**: If any timing or budget computation fails, log warning to stderr, continue to next phase.
    The workflow MUST proceed regardless. (NFR-001, AC-003f)

**PHASE_AGENT_MAP** (for STEP 3c-prime `active_agent` resolution):
```
01-requirements → requirements-analyst
02-tracing → trace-analyst
02-impact-analysis → impact-analyst
03-architecture → solution-architect
04-design → software-designer
05-test-strategy → test-design-engineer
06-implementation → software-developer
07-testing → quality-assurance-engineer
08-code-review → code-reviewer
09-security → security-engineer
10-local-testing → quality-assurance-engineer
16-quality-loop → quality-assurance-engineer
11-deployment → release-engineer
12-test-deploy → release-engineer
13-production → release-engineer
```

**3e-plan.** REMOVED (REQ-GH-223 FR-002): Task plan is now generated during analysis. BUILD-INIT COPY is the sole mechanism.

**3e-review.** SUPERVISED REVIEW GATE (conditional) -- After the post-phase
state update, check if a supervised review gate should fire.

**Gate trigger check**:
1. Read `supervised_mode` from state.json (already loaded in 3e)
2. Call `readSupervisedModeConfig(state)` (from common.cjs via inline logic)
   - If `config.enabled` is `false`: skip to 3e-sizing (no review gate)
3. Call `shouldReviewPhase(config, phase_key)`
   - If `false`: skip to 3e-sizing (this phase not in review_phases)
4. Call `generatePhaseSummary(state, phase_key, projectRoot, { minimal: !config.parallel_summary })`
   - Store the returned `summaryPath`
   - If `null` (generation failed): log warning, skip to 3e-sizing (fail-open)
5. Initialize `supervised_review` in state (if not already set for this phase):
   ```json
   {
     "phase": "{phase_key}",
     "status": "gate_presented",
     "paused_at": null,
     "resumed_at": null,
     "redo_count": 0,
     "redo_guidance_history": []
   }
   ```
   Write to `active_workflow.supervised_review` in state.json.

**REVIEW_LOOP**:
6. Determine menu options:
   a. Read `supervised_review.redo_count` from state
   b. If `redo_count >= 3`:
      - options = `[C] Continue`, `[R] Review`
   c. Else:
      - options = `[C] Continue`, `[R] Review`, `[D] Redo`

7. Present review gate banner and wait for user response:
   ```
   --------------------------------------------
   PHASE {NN} COMPLETE: {Phase Name}

   Summary: {summaryPath}
   Artifacts: {artifact_count} files created/modified
   Duration: {duration}

   [C] Continue -- advance to next phase
   [R] Review -- pause for manual review/edits, resume when ready
   [D] Redo -- re-run this phase with additional guidance

   Your choice: _
   --------------------------------------------
   ```

   Use `AskUserQuestion` to collect the user's response.

8. Handle user response:

   **CASE [C] Continue**:
   a. Call `recordReviewAction(state, phase_key, 'continue', { timestamp: now })`
   b. Delete `active_workflow.supervised_review` from state
   c. Write state.json
   d. PROCEED to 3e-sizing

   **CASE [R] Review**:
   a. Display the summary content inline (read the summary file and display it)
   b. Display instructions:
      "Review the artifacts listed above. Edit any files as needed.
       When ready, say 'continue' to advance to the next phase."
   c. Set `active_workflow.supervised_review.status` = `"reviewing"`
   d. Set `active_workflow.supervised_review.paused_at` = current timestamp
   e. Write state.json
   f. WAIT for user input (use `AskUserQuestion` with freeform text prompt)
   g. On user response (any confirmation like "continue", "done", "yes", "ok"):
      i.   Set `supervised_review.status` = `"completed"`
      ii.  Set `supervised_review.resumed_at` = current timestamp
      iii. Call `recordReviewAction(state, phase_key, 'review',
            { paused_at: supervised_review.paused_at, resumed_at: supervised_review.resumed_at })`
      iv.  Delete `active_workflow.supervised_review` from state
      v.   Write state.json
      vi.  PROCEED to 3e-sizing

   **CASE [D] Redo**:
   a. Prompt: "What additional guidance should this phase consider?"
   b. Capture guidance text from user (use `AskUserQuestion`)
   c. Read current `supervised_review.redo_count` from state
   d. Increment `supervised_review.redo_count` by 1
   e. Append guidance to `supervised_review.redo_guidance_history`
   f. Set `supervised_review.status` = `"redo_pending"`
   g. Write state.json
   h. Reset phase state for re-delegation:
      i.  Set `phases[phase_key].status` = `"in_progress"`
      ii. Set `active_workflow.phase_status[phase_key]` = `"in_progress"` <!-- DEPRECATED (INV-0055): will be removed in Phase B. phases[phase_key].status (step h.i) is authoritative. -->
      iii. Write state.json
   i. Re-delegate to the same phase agent (same pattern as STEP 3d):
      - Use the PHASE-AGENT table from STEP 3d
      - Append to the original delegation prompt:
        `"\nREDO GUIDANCE: {guidance text}"`
   j. On return, re-execute STEP 3e logic:
      - Set `phases[phase_key].status` = `"completed"`
      - Set `phases[phase_key].summary` = (extract from agent result)
      - Set `active_workflow.phase_status[phase_key]` = `"completed"` <!-- DEPRECATED (INV-0055): will be removed in Phase B. phases[phase_key].status is authoritative. -->
      - Write state.json
   k. Call `recordReviewAction(state, phase_key, 'redo',
        { redo_count: supervised_review.redo_count, guidance: guidance_text, timestamp: now })`
   l. Re-generate summary:
      - Call `generatePhaseSummary(state, phase_key, projectRoot, { minimal: !config.parallel_summary })`
      - Update summaryPath
   m. GOTO REVIEW_LOOP (step 6)

**3e-sizing.** SIZING DECISION POINT (conditional) -- After the post-phase
state update, check if adaptive workflow sizing should run.

**Trigger check**:
1. Read the phase key that was just completed from the state update in 3e
2. If `phase_key === '02-impact-analysis'` AND `active_workflow.type === 'feature'`:
   a. Read `active_workflow.sizing` from state.json
   b. If `sizing` is already set (not undefined/null): skip to 3e-refine (prevent double-sizing)
   c. If `sizing` is not set: execute sizing flow (below)
3. Otherwise (not Phase 02, or not feature workflow): skip to 3e-refine

**Sizing flow**:

**S1.** Read configuration:
   - Read `active_workflow.flags.light` from state.json
   - Read `workflows.json` -> `workflows.feature.sizing`
   - If `sizing.enabled` is falsy or `sizing` block is missing:
     a. Emit stderr warning: `[sizing] Adaptive sizing is disabled in workflows.json. Defaulting to standard workflow.\n`
     b. Write sizing record: `{ intensity: 'standard', effective_intensity: 'standard', recommended_by: 'framework', overridden: false, decided_at: <now>, forced_by_flag: false, epic_deferred: false, reason: 'sizing_disabled', user_prompted: false, fallback_source: null, fallback_attempted: false }`
     c. Write state.json, then skip to 3e-refine.

**S2.** IF `-light` flag is set (`active_workflow.flags.light === true`):
   a. Call `applySizingDecision(state, 'light', { forced_by_flag: true, config: sizingConfig, reason: 'light_flag', user_prompted: false })`
      where `sizingConfig` = `{ light_skip_phases: workflows.feature.sizing.light_skip_phases }`
   b. Write state.json
   c. Display forced-light banner:
      ```
      +----------------------------------------------------------+
      |  WORKFLOW SIZING: Light (forced via -light flag)          |
      |                                                           |
      |  Skipping phases:                                         |
      |    - Phase 03: Architecture                               |
      |    - Phase 04: Design                                     |
      |                                                           |
      |  Workflow: 00 -> 01 -> 02 -> 05 -> 06 -> 16 -> 08       |
      +----------------------------------------------------------+
      ```
   d. Update task list: find tasks for skipped phases, mark as completed with subject `~~[N] {subject} (Skipped -- light workflow)~~`
   e. Skip to 3e-refine

**S3.** ELSE (standard sizing flow):
   a. Read impact-analysis.md:
      - Path: `docs/requirements/{artifact_folder}/impact-analysis.md`
      - If file found: call `parseSizingFromImpactAnalysis(content)` -> `metrics_or_null`
      - If file not found: set `metrics_or_null = null`, set `ia_reason = 'ia_file_missing'`
   b. IF `metrics_or_null` is non-null (HAPPY PATH -- unchanged behavior):
      - `metrics = metrics_or_null`
      - GOTO S3.c (thresholds -> recommendation -> banner -> user menu)
      - When calling `applySizingDecision`, pass: `reason: 'user_accepted'` (or `'user_overridden'`), `user_prompted: true`, `fallback_attempted: false`
   b-fallback. ELSE (`metrics_or_null` is null -- FALLBACK PATH):
      - Set `ia_reason = ia_reason || 'ia_parse_failed'`
      - Call `extractFallbackSizingMetrics(artifact_folder, projectRoot)` -> `{ metrics, source }`
      - `metrics` may still be null; `source` is `'quick-scan'`, `'requirements-spec'`, or `null`
   c. Read thresholds: `workflows.json` -> `workflows.feature.sizing.thresholds`
      - If missing: use defaults `{ light_max_files: 5, epic_min_files: 20 }`
   d. Call `computeSizingRecommendation(metrics, thresholds)`
   e. Display sizing recommendation banner:
      - IF on fallback path:
        ```
        +----------------------------------------------------------+
        |  WARNING: Impact analysis metrics unavailable             |
        |                                                           |
        |  Could not extract sizing metrics from impact-analysis.md |
        |  {if source: "Partial metrics from: {source}.md"}         |
        |  {if !source: "No metrics available"}                     |
        |                                                           |
        |  Recommended: {recommendation.intensity}                  |
        |  Rationale: {recommendation.rationale}                    |
        +----------------------------------------------------------+
        ```
      - ELSE (happy path):
        ```
        +----------------------------------------------------------+
        |  WORKFLOW SIZING RECOMMENDATION                           |
        |                                                           |
        |  Recommended: {INTENSITY}                                 |
        |  Rationale: {rationale text}                              |
        |                                                           |
        |  Impact Analysis Summary:                                 |
        |    Files affected:  {N}                                   |
        |    Modules:         {N}                                   |
        |    Risk level:      {level}                               |
        |    Coupling:        {level}                               |
        |    Coverage gaps:   {N}                                   |
        +----------------------------------------------------------+
        ```
   f. Present user menu using `AskUserQuestion`:
      - `[A] Accept recommendation`
      - `[O] Override (choose different intensity)`
      - `[S] Show {on fallback path ? "available diagnostic info" : "full impact analysis"}`
   g. Handle user choice:
      - **[A] Accept**:
        - If intensity is 'epic': inform user that epic is deferred, proceeding with standard
        - Call `applySizingDecision(state, recommendation.intensity, { metrics, config: sizingConfig, reason: ia_reason || 'user_accepted', user_prompted: true, fallback_source: source || null, fallback_attempted: !!ia_reason })`
      - **[O] Override**:
        - IF metrics is null (no metrics available at all):
          - Present intensity picker: `[1] Light  [2] Standard`
          - Display note: `(Epic requires impact analysis metrics)`
        - ELSE:
          - Present intensity picker: `[1] Light  [2] Standard  [3] Epic`
        - Call `applySizingDecision(state, chosen, { metrics, overridden: true, overridden_to: chosen, recommended_intensity: recommendation.intensity, config: sizingConfig, reason: 'user_overridden', user_prompted: true, fallback_source: source || null, fallback_attempted: !!ia_reason })`
      - **[S] Show analysis**:
        - IF on fallback path: display fallback source file contents (or "No diagnostic info available")
        - ELSE: display full impact-analysis.md content
        - Return to menu (repeat step f)
   h. Write state.json
   i. If effective_intensity is 'light': update task list (mark skipped phase tasks as completed)
   j. Display applied sizing confirmation banner
   k. Proceed to 3e-refine

**3e-refine.** TASK REFINEMENT (conditional) — After the post-phase state update, check if task refinement should run:

**Trigger check**:
1. Read the phase key that was just completed from the state update in 3e
2. If `phase_key === '04-design'`:
   a. Check if `active_workflow.phases` includes `'06-implementation'`
   b. Check if `active_workflow.refinement_completed` is NOT `true`
   c. If BOTH true: execute refinement (below)
   d. If either false: skip to 3f

**Refinement execution**:
1. Read `active_workflow.artifact_folder` from state.json
2. Set `artifact_path` = `docs/requirements/{artifact_folder}`
3. Read design artifacts:
   - `{artifact_path}/module-design-*.md` (all module design files)
   - `{artifact_path}/interface-spec.yaml` or `{artifact_path}/interface-spec.md` (if exists)
   - `{artifact_path}/component-spec.md` (if exists)
4. Read `{artifact_path}/requirements-spec.md` for REQ/AC cross-reference
5. Read `docs/isdlc/tasks.md` (current plan)
6. Execute the refinement algorithm:
   a. Parse tasks.md: extract Phase 06 section tasks (preserve Phase 01-05, 07+ verbatim)
   b. Read design artifacts: build a map of { module -> files -> functions/exports }
   c. Read requirements-spec.md: build a map of { REQ-NNN -> [AC-NNx, ...] }
   d. For each Phase 06 high-level task:
      - Identify which design modules it maps to
      - Identify which files need CREATE or MODIFY
      - Identify which REQ/AC the files fulfill
      - Generate one task per logical unit of work (one file or tightly coupled file group)
      - Assign new TNNNN IDs (continuing from last ID in tasks.md)
      - Add `| traces:` annotations linking to REQ/AC
      - Add `files:` sub-lines with file paths and CREATE/MODIFY
   e. Compute dependencies:
      - If file B imports from file A, the task for B is `blocked_by` the task for A
      - If module X depends on module Y, tasks for X are `blocked_by` tasks for Y
      - Add `blocked_by:` and `blocks:` sub-lines
   f. Validate acyclicity: trace all dependency chains, confirm no task depends on itself transitively
   g. Compute critical path: find longest dependency chain
   h. Generate Dependency Graph section with critical path
   i. Re-compute Traceability Matrix with refined tasks
7. Write updated `docs/isdlc/tasks.md`
8. Write `{artifact_path}/task-refinement-log.md`
9. Set `active_workflow.refinement_completed = true` in state.json
10. Display refinement summary to user:

```
+----------------------------------------------------------+
|  TASK REFINEMENT COMPLETE                                 |
|                                                           |
|  Phase 06 tasks refined: {N} high-level -> {M} file-level|
|  Dependencies added: {D} edges                           |
|  Critical path length: {L} tasks                         |
|  Traceability: {T}% AC coverage                          |
|  Details: {artifact_path}/task-refinement-log.md          |
+----------------------------------------------------------+
```

**Fallback**: If no design artifacts are found, skip refinement silently. Phase 06 tasks remain high-level. The software-developer agent will self-decompose work as it does today.

**3e-compliance.** PROTOCOL COMPLIANCE CHECK (REQ-GH-116) -- After post-phase state update, check whether injected protocols were followed. Fail-open.

1. Read `src/claude/hooks/config/protocol-mapping.json`. If missing or parse fails: skip silently.
2. Filter protocols where `checkable: true` AND (`phases` includes current `phase_key` or `"all"`).
3. If no checkable protocols match: skip silently.
4. For each checkable protocol, run the check signal:

| Signal | Logic |
|--------|-------|
| `git_commit_detected` | Run `git log --after="{timing.started_at}" --before="{timing.completed_at}" --oneline`. Non-empty output = violation. Evidence = the git log output. |

5. Collect violations: `[{ protocol_header, check_signal, evidence }]`
6. If violations is empty: skip to 3f (no violations).
7. If violations is non-empty: dispatch to **3f-protocol-violation** handler (below).
8. Error handling: If any check signal fails (git command error, etc.), skip that protocol and continue. Never block on check failure.

**3f.** On return, check the result status:
- `"passed"` or successful completion → Mark task as `completed` **with strikethrough**: update both `status` to `completed` AND `subject` to `~~[N] {base subject}~~` (wrap the original `[N] subject` in `~~`).
   After marking phase task completed, also check `docs/isdlc/tasks.md`: if the completed phase has parent tasks, markTaskComplete() handles auto-completion of parents when all sub-tasks are done (REQ-GH-223 FR-004, AC-004-02).
   After marking the phase task completed with strikethrough, print the phase summary (FR-002, FR-003, AC-002-02, AC-003-01):
   1. Read `docs/isdlc/tasks.md` using `readTaskPlan()` from `src/core/tasks/task-reader.js`
   2. Call `formatPhaseSummary(plan, phase_key)` from `src/core/tasks/task-formatter.js`
   3. Output the returned string (the formatted phase summary table)
   Then clean up per-task TaskCreate entries for this phase:
   4. Call `TaskList` to retrieve all tasks
   5. For each task whose subject matches `/^(~~)?T\d+/` (per-task entries): call `TaskUpdate` with `status: "deleted"`
   6. Phase-level entries (subjects matching `/^(~~)?\[/`) are NOT deleted
   Continue to next phase.
- `"blocked_by_hook"` → Identify the block type from the message and dispatch:
  1. Contains `"BLAST RADIUS COVERAGE INCOMPLETE"` → Follow **3f-blast-radius** below (unchanged)
  2. Contains `"GATE BLOCKED"` → Follow **3f-gate-blocker** below
  3. Contains `"PHASE COMPLETION BLOCKED"` OR `"CONSTITUTIONAL VALIDATION INCOMPLETE"` → Follow **3f-constitutional** below
  4. Contains `"ITERATION CORRIDOR"` → Follow **3f-iteration-corridor** below
  5. Contains `"TEST ADEQUACY REQUIRED"` → Follow **3f-test-adequacy** below
  6. Contains `"PROTOCOL VIOLATION"` → Follow **3f-protocol-violation** below
  7. Contains `"TASKS INCOMPLETE"` → Follow **3f-task-completion** below
  8. Otherwise → Generic fallback: display blocker banner (same format as 3c), use `AskUserQuestion` for Retry/Skip/Cancel
- Any other error → Display error, use `AskUserQuestion` for Retry/Skip/Cancel

**3f-blast-radius.** BLAST RADIUS BLOCK HANDLING (Traces to: BUG-0019, FR-01 through FR-05)

When the `blocked_by_hook` status comes from `blast-radius-validator` (the block message contains `"BLAST RADIUS COVERAGE INCOMPLETE"`), follow this specialized handling instead of the generic Retry/Skip/Cancel:

1. **Parse unaddressed files from block message**: Extract the list of unaddressed file paths and their expected change types from the block message. The format is:
   ```
     - path/to/file (expected: CHANGE_TYPE)
   ```
   Use `parseBlockMessageFiles()` from `src/claude/hooks/lib/blast-radius-step3f-helpers.cjs` or parse inline using the pattern above.

2. **Check for valid deferrals in requirements-spec.md**: Read `docs/requirements/{artifact_folder}/requirements-spec.md` and look for a `## Deferred Files` section. Only files explicitly listed there with justification are valid deferrals. Use `isValidDeferral()` from the helpers. Remove valid deferrals from the unaddressed list. Auto-generated deferrals (added by agents to blast-radius-coverage.md without requirements-spec.md backing) are NOT valid.

3. **Cross-reference unaddressed files against tasks.md**: Read `docs/isdlc/tasks.md` and match each remaining unaddressed file against task entries. Use `matchFilesToTasks()` from the helpers. For each file, identify the corresponding task ID (TNNNN) and its status. Flag any discrepancy where a task is marked `[X]` (completed) but the file is still unaddressed in git diff.

4. **Check retry counter**: Read `blast_radius_retries` from `state.json`. If the counter has reached the maximum of 3 retries, escalate to the user with a summary of remaining unaddressed files and their matched tasks. Use `isBlastRadiusRetryExceeded()` from the helpers. Increment the counter using `incrementBlastRadiusRetry()` and log the retry using `logBlastRadiusRetry()`.

5. **Re-delegate to implementation agent (Phase 06)**: If retries remain, re-delegate to the `software-developer` agent with a prompt that includes:
   - The specific list of unaddressed file paths and their expected change types
   - The matched task IDs and descriptions from tasks.md
   - **CRITICAL PROHIBITIONS**: The re-delegation prompt MUST include these prohibitions:
     - "DO NOT modify impact-analysis.md — it is read-only after Phase 02"
     - "DO NOT add deferral entries to blast-radius-coverage.md"
     - "DO NOT modify state.json blast radius metadata to circumvent validation"
     - "MUST NOT auto-generate deferrals — only requirements-spec.md Deferred Files are valid"
   Use `formatRedelegationPrompt()` from the helpers to build the prompt, or include these elements inline.

6. **After re-implementation, retry the gate**: After the re-delegated implementation completes, loop back to STEP 3d to re-run the phase delegation (which will trigger blast-radius-validator again). This is the natural retry path — the phase-loop re-enters at the delegation step.

7. **Escalation on retry limit exceeded (max 3 retries)**: If 3 blast-radius re-implementation attempts have been made and files remain unaddressed, present an escalation menu to the user:
   ```
   BLAST RADIUS: Re-implementation retry limit (3) exceeded.
   Remaining unaddressed files: {count}
   {file list with change types}

   Options:
   [D] Defer with justification — Add files to requirements-spec.md Deferred Files section
   [S] Skip (override) — Continue without full blast radius coverage
   [C] Cancel workflow
   ```

**IMPORTANT**: The `impact-analysis.md` file is READ-ONLY after Phase 02. The phase-loop controller and all agents MUST NOT modify it to circumvent blast radius validation. The only valid way to exclude a file from blast radius enforcement is to list it in the `## Deferred Files` section of `requirements-spec.md` with justification.

**3f-retry-protocol.** HOOK BLOCK RETRY PROTOCOL (shared by 3f-gate-blocker, 3f-constitutional, 3f-iteration-corridor, 3f-test-adequacy)

This protocol manages retry counters for hook block re-delegations. Each handler below follows this pattern:

1. Read `hook_block_retries` object from `state.json` → `active_workflow` (create if missing, default `{}`)
2. Key format: `hook_block_retries["{hook-type}:{phase_key}"]` — value is an integer counter
3. Increment the counter on each re-delegation attempt
4. Check against the max retries for the handler (see table below)
5. On max exceeded: escalate to user with `AskUserQuestion`:
   ```
   HOOK BLOCK: Retry limit ({max}) exceeded for {hook-type} on phase {phase_key}.
   {paste last block message}

   Options:
   [R] Retry — Re-delegate one more time
   [S] Skip — Continue without resolving
   [C] Cancel workflow
   ```
6. After re-delegation returns: loop back to STEP 3d (re-run phase delegation, which re-triggers hooks on completion)

| Handler | Max retries | Rationale |
|---------|-------------|-----------|
| 3f-gate-blocker | 3 | Sub-checks have their own iteration limits internally |
| 3f-constitutional | 3 | CV max_iterations is 5 in config, but orchestrator-level retries should be fewer |
| 3f-iteration-corridor | 3 | Same rationale as constitutional |
| 3f-test-adequacy | 2 | Precondition block — if test gen fails twice, escalate |
| 3f-protocol-violation | 2 | Protocol violations are often one-shot (e.g., git commit already made) — escalate quickly |
| 3f-task-completion | 3 | Matches blast-radius pattern — 3 retries before user escalation |

**3f-gate-blocker.** GATE BLOCKER RE-DELEGATION

When the block message contains `"GATE BLOCKED"`:

1. Parse blocking requirements from the message. The gate-blocker emits lines in this format:
   ```
   Blocking requirements: req1, req2
   - req1: reason
   - req2: reason
   ```
2. Check retry counter (`gate-blocker:{phase_key}`) per **3f-retry-protocol**. If >= 3, escalate.
3. Re-delegate to the SAME phase agent (resolve from the PHASE→AGENT table in step 3d) with this prompt:

```
GATE REQUIREMENTS NOT MET — Retry {N} of 3

The gate-blocker hook blocked phase advancement:
{paste full block message}

You MUST resolve the blocking requirements before the phase can advance:
- If test_iteration is blocking: run the test suite, fix failures, iterate until all pass
- If constitutional_validation is blocking: read docs/isdlc/constitution.md, validate artifacts against required articles, update state.json constitutional_validation
- If interactive_elicitation is blocking: complete the required menu interactions
- If artifact_presence is blocking: create the missing artifact files listed above

After completing the required work, signal phase completion.
```

4. On return, loop back to STEP 3d per the retry protocol.

**3f-constitutional.** CONSTITUTIONAL VALIDATION RE-DELEGATION

When the block message contains `"PHASE COMPLETION BLOCKED: Constitutional validation required"` OR `"CONSTITUTIONAL VALIDATION INCOMPLETE"`:

1. Check retry counter (`constitutional:{phase_key}`) per **3f-retry-protocol**. If >= 3, escalate.
2. Re-delegate to the SAME phase agent with this prompt:

```
CONSTITUTIONAL VALIDATION REQUIRED — Retry {N} of 3

A constitutional validation hook blocked phase advancement:
{paste full block message}

You MUST complete constitutional validation:
1. Read the constitution at docs/isdlc/constitution.md
2. For each required article, check your phase artifacts for compliance
3. Fix any violations found in the artifacts
4. Update state.json phases["{phase_key}"].constitutional_validation:
   { "status": "compliant", "completed": true, "articles_checked": [...], "iterations_used": N }
5. Then signal phase completion

Required state: completed=true, iterations_used>=1, status=compliant|escalated, articles_checked non-empty.
```

3. On return, loop back to STEP 3d per the retry protocol.

**3f-iteration-corridor.** ITERATION CORRIDOR RE-DELEGATION

When the block message contains `"ITERATION CORRIDOR"`:

1. Detect corridor type from the message:
   - Contains `"Tests are failing"` → TEST corridor
   - Contains `"Constitutional validation"` → CONST corridor
2. Check retry counter (`iteration-corridor:{phase_key}`) per **3f-retry-protocol**. If >= 3, escalate.
3. Re-delegate to the SAME phase agent with the appropriate prompt:

For TEST corridor:
```
ITERATION CORRIDOR: TESTS FAILING — Retry {N} of 3

{paste full block message}

You MUST fix the failing tests before advancing:
1. Read the test failure output
2. Fix the code causing failures
3. Re-run the test suite
4. Iterate until all tests pass
```

For CONST corridor:
```
ITERATION CORRIDOR: CONSTITUTIONAL VALIDATION PENDING — Retry {N} of 3

{paste full block message}

You MUST complete constitutional validation before advancing.
Read docs/isdlc/constitution.md, validate artifacts, update state.json.
```

4. On return, loop back to STEP 3d per the retry protocol.

**3f-test-adequacy.** TEST ADEQUACY RE-DELEGATION

When the block message contains `"TEST ADEQUACY REQUIRED"`:

1. Check retry counter (`test-adequacy:{phase_key}`) per **3f-retry-protocol**. If >= 2, escalate.
2. Re-delegate to the SAME phase agent with this prompt:

```
TEST ADEQUACY REQUIRED — Retry {N} of 2

{paste full block message}

You MUST establish adequate test coverage before proceeding:
1. Write unit tests for the affected code
2. Achieve the minimum coverage threshold shown above
3. Run the test suite to verify coverage
```

3. On return, loop back to STEP 3d per the retry protocol.

**3f-protocol-violation.** PROTOCOL VIOLATION RE-DELEGATION (REQ-GH-116)

Triggered by `3e-compliance` when `checkProtocolCompliance()` returns non-empty violations, OR when a `blocked_by_hook` message contains `"PROTOCOL VIOLATION"`.

1. Check retry counter (`protocol-violation:{phase_key}`) per **3f-retry-protocol**. Max retries: 2.
2. Re-delegate to the SAME phase agent with this prompt:

```
PROTOCOL VIOLATION DETECTED — Retry {N} of 2

Violated protocols:
{for each violation:
  - {protocol_header}: {evidence}
}

Remediate these violations before the phase can advance.
- If Git Commit Prohibition violated: the commits have already been made and cannot be undone by this agent. Acknowledge the violation and ensure no further commits are made.
- For other violations: fix the non-compliant behavior and re-run the phase work.
```

3. After re-delegation, re-run `3e-compliance` check. If clean, proceed to 3f. If violations persist, retry or escalate.
4. After 2 retries: escalate to user with `AskUserQuestion`:
   ```
   PROTOCOL VIOLATION: Retry limit (2) exceeded for phase {phase_key}.
   Violations: {violation list}

   Options:
   [R] Retry — Re-delegate one more time
   [S] Skip — Continue without resolving
   [C] Cancel workflow
   ```

**3f-task-completion.** TASK COMPLETION RE-DELEGATION (REQ-GH-232)

Triggered when a `blocked_by_hook` message contains `"TASKS INCOMPLETE"`. The `task-completion-gate` hook emits this block when a phase is being marked `status: "completed"` but top-level tasks for that phase in `docs/isdlc/tasks.md` are still `[ ]` (not done).

1. **Parse the unfinished task list** from the block message. The hook emits lines matching:
   ```
     - [ ] T{id}: {description}
   ```
   Extract the phase key (from the message header `Phase {phase_key} has {N} unfinished top-level tasks`) and the list of `{ id, description }` pairs.

2. **Check retry counter** (`task-completion-gate:{phase_key}`) per **3f-retry-protocol**. Max retries: 3.

3. **If retries >= 3, present escalation menu** to the user with `AskUserQuestion`:
   ```
   I have asked the orchestrator to implement these tasks T{id1}, T{id2}, T{id3} but does not look like I am able to make progress.

   Options:
   [M] Manually prompt the orchestrator
   [S] Skip for now
   [C] Cancel workflow
   ```

4. **On [M] (manually prompt)**:
   - Prompt the user for free-form guidance text (`AskUserQuestion` or equivalent input prompt).
   - Reset `hook_block_retries["task-completion-gate:{phase_key}"]` to 0 in state.json.
   - Re-delegate to the SAME phase agent with the standard re-delegation prompt below, appending the user's guidance text as an additional section titled `USER GUIDANCE:`.

5. **On [S] (skip for now)**:
   - Append an entry to `active_workflow.skipped_tasks[]` in state.json with schema:
     ```json
     {
       "phase": "{phase_key}",
       "tasks": [{ "id": "T{id}", "description": "..." }, ...],
       "skipped_at": "{ISO-8601 timestamp}",
       "reason": "user_skip_after_retries"
     }
     ```
     Create the `skipped_tasks` array in `active_workflow` if it does not exist.
   - Clear `hook_block_retries["task-completion-gate:{phase_key}"]` from state.json.
   - Allow phase advancement: proceed as if the phase had returned `"passed"` (mark phase task completed, continue to next phase).

6. **On [C] (cancel workflow)**: Delegate to the existing 3f cancellation path (same as generic Cancel handling).

7. **If retries < 3, re-delegate** to the SAME phase agent (resolve from the PHASE→AGENT table in STEP 3d) with this prompt:

```
TASKS INCOMPLETE — Retry {N} of 3

The task-completion-gate hook blocked phase advancement. The following tasks in docs/isdlc/tasks.md are still [ ] (not done) for phase {phase_key}:

{for each unfinished task:
  - T{id}: {description}
}

You MUST complete these tasks and mark them [X] in tasks.md before signaling phase completion. Do not abandon them or mark them as skipped. Each task ID listed above corresponds to a concrete work item in the task plan — implement the required files and tests, then flip the `[ ]` marker to `[X]` in docs/isdlc/tasks.md.
```

8. On return, loop back to STEP 3d per the retry protocol.

#### STEP 3-dashboard: COMPLETION DASHBOARD (REQ-0022)

After the phase loop exits (all phases completed or skipped), before STEP 4 (orchestrator finalize):

24. **Collect timing data**: Read `phases[phase_key].timing` for every phase in `active_workflow.phases`.
    Build an array with `phase_key`, `wall_clock_minutes`, `debate_rounds_used`, `fan_out_chunks`, `debate_rounds_degraded_to`, `fan_out_degraded_to`.

25. **Read budget**: Read the performance budget for the effective intensity tier.
    Build budget info: `{ max_total_minutes, intensity, exceeded_at_phase }`.

26. **Preliminary regression check**:
    - Read `workflow_history[]` from state.json.
    - Compute total minutes from phase timings.
    - Compute rolling average from last 5 workflows of same intensity.
    - Detect regression (20% threshold).
    - If regressed, find slowest phase.

27. **Count degradation**: Count phases with `debate_rounds_degraded_to !== null` or `fan_out_degraded_to !== null`.

28. **Render and display dashboard** using the formatCompletionDashboard() specification:
    Show the multi-line timing summary with phase table, budget status, regression info, and degradation count.

29. **Error handling**: If dashboard rendering fails, log `DASHBOARD_ERROR: Could not render completion dashboard: <error>` and proceed. Never block finalization. (NFR-001)

#### STEP 4: FINALIZE — Complete the workflow (REQ-GH-219)

After all phases complete, run the **finalize checklist** — a config-driven, per-step sequence that replaces the previous orchestrator delegation. Each step is small, tracked, and retried independently (same pattern as #220 task-level dispatch).

**4a. Read the finalize checklist**: Read `.isdlc/config/finalize-steps.md` using `task-reader.js`. If missing, fall back to `src/core/finalize/finalize-steps.default.md` and copy it to `.isdlc/config/` for future runs. Parse using the standard tasks.md format (extended with `| critical: true, fail_open: true, max_retries: N, type: internal|shell|mcp|provider` metadata).

**4b. Execute steps sequentially** respecting `blocked_by` dependencies (tier-ordered). For each step:

1. Display step name to the user
2. Execute based on `type`:
   - `internal` — call the corresponding function from `src/core/finalize/finalize-utils.js`:
     - **F0001 Merge branch**: `mergeBranch(branch, projectRoot)` — git checkout main, merge --no-ff, delete branch
     - **F0002 Sync external status**: `syncExternalStatus(workflowInfo, projectRoot)` — GitHub close, BACKLOG.md mark [x]
     - **F0003 Move workflow to history**: `moveWorkflowToHistory(state)` + `clearTransientFields(state)` — moves `active_workflow` to `workflow_history`, nulls transients
   - `shell` — execute via `child_process.execSync`:
     - **F0005 Session cache**: `node bin/rebuild-cache.js`
     - **F0006 Contracts**: `node bin/generate-contracts.js` + `--output .isdlc/config/contracts`
     - **F0008 Memory embeddings**: rebuild user + project indexes
     - **F0009 Code embeddings**: refresh if pipeline configured
   - `mcp` — execute MCP tool calls (Claude Code only, skipped in other providers):
     - **F0007 Code index**: `mcp__code-index-mcp__refresh_index` + `mcp__code-index-mcp__build_deep_index`
   - `provider` — provider-specific steps (skipped when provider doesn't match):
     - **F0004 Task cleanup**: `TaskList` → delete all tasks
3. On failure: retry up to `max_retries` from step metadata
4. After retries exhausted:
   - If `critical: true` AND `fail_open: false` → halt finalization, escalate to user
   - If `fail_open: true` → log warning, continue to next step
5. Display per-step result (passed/failed/skipped)

**4c. Jira sync** (non-blocking, runs as part of F0002 or as a separate step if configured):
If `active_workflow.source === "jira"` and `active_workflow.external_id` exists, transition the Jira issue to Done via Atlassian MCP. Failure is non-blocking.

**4d. Task cleanup** (F0004, provider-specific):
1. Call `TaskList` to retrieve ALL tasks in the session
2. For EACH task: call `TaskUpdate` with `status: "deleted"`
3. This processes ALL tasks — workflow phase tasks AND sub-agent tasks. After finalize, every remaining task is stale by definition.
4. Do NOT exit the Phase-Loop Controller until this cleanup has completed.

**4e. Display finalize summary**: After all steps complete, display the per-step results table showing which steps passed, failed, were skipped, or were retried.

**Non-workflow index refresh**: The same index refresh steps (code index, session cache, contracts, memory embeddings, code embeddings) also run at the end of:
- `/isdlc analyze` — after step 9 (GitHub label sync), before returning
- `/discover` — after discovery finalization
- `/isdlc test generate` — after STEP 4 finalize (already covered above via Phase-Loop Controller)
- `/isdlc upgrade` — after STEP 4 finalize (already covered above via Phase-Loop Controller)

For non-workflow contexts, call the same steps inline using `finalize-utils.js` functions. Failures are non-blocking.

#### Flow Summary

```
/isdlc (no args)    → Task → orchestrator → Interactive Menu (Add/Analyze/Build/Tests/Upgrade)
/isdlc add ...      → Inline handler (no workflow, no state.json, no orchestrator)
/isdlc analyze ...  → Inline handler (phases 00-04, no workflow, no state.json)
/isdlc build ...    → Phase-Loop Controller (init → tasks → direct-agent-loop → finalize)
/isdlc test run     → Phase-Loop Controller (init → tasks → direct-agent-loop → finalize)
/isdlc test generate → Phase-Loop Controller (init → tasks → direct-agent-loop → finalize)
/isdlc upgrade ...  → Phase-Loop Controller (init → tasks → direct-agent-loop → finalize)
/isdlc cancel       → Task → orchestrator → Cancel active workflow
/isdlc status       → Task → orchestrator → Show status
/isdlc <action>     → Task → orchestrator → Execute Action
```
