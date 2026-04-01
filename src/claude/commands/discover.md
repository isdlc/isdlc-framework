## Discover Command
Set up a new project or analyze an existing codebase to create a tailored project constitution.

### Usage
```
/discover [options]
```

### Description
The `/discover` command is the universal entry point for setting up a project with the iSDLC framework. It intelligently adapts its behavior based on whether this is a new or existing project.

**For new projects:** Guides you through defining your project, selecting a tech stack, and creating a constitution.

**For existing projects:** Produces a comprehensive discovery report (tech stack, architecture, data model, functional features, test coverage), then generates a tailored constitution.

### No-Argument Behavior (Interactive Menu)

When `/discover` is invoked without any flags or options, the menu adapts based on whether discovery has been completed before.

#### First-Time Menu (discovery_completed is false or absent)

```
╔══════════════════════════════════════════════════════════════╗
║  iSDLC Framework - Discovery Mode Selection                  ║
╚══════════════════════════════════════════════════════════════╝

Select a discovery mode:

[1] New Project Setup
    Define your project, select tech stack, and create constitution

[2] Existing Project Analysis (Recommended)
    Full codebase analysis with behavior extraction

[3] Chat / Explore
    Explore the project, discuss functionality, review backlog, ask questions

Enter selection (1-3):
```

Note: "(Recommended)" is shown on [2] by default. The orchestrator dynamically moves it to [1] when no existing code is detected.

| Selection | Equivalent | Action |
|-----------|------------|--------|
| [1] | `/discover --new` | Go directly to NEW PROJECT FLOW |
| [2] | `/discover --existing` | Go directly to EXISTING PROJECT FLOW |
| [3] | (no CLI equivalent) | Enter Chat / Explore conversational mode |

#### Returning Project Menu (discovery_completed is true)

When the project has already been discovered, the menu shows re-discovery options:

```
╔══════════════════════════════════════════════════════════════╗
║  iSDLC Framework - Discovery                                 ║
╚══════════════════════════════════════════════════════════════╝

This project has already been discovered.
  {project summary: name, tech stack, date, AC count, test count}

[1] Re-discover (full)
    Run complete discovery from scratch, overwrite all reports

[2] Re-discover (incremental)
    Re-run analysis only, keep constitution and skills

[3] Chat / Explore
    Explore the project, discuss functionality, review backlog

Enter selection (1-3):
```

| Selection | Equivalent | Action |
|-----------|------------|--------|
| [1] | `/discover --existing` | Full EXISTING PROJECT FLOW (overwrites reports) |
| [2] | (no CLI equivalent) | INCREMENTAL DISCOVERY FLOW (analysis + report only) |
| [3] | (no CLI equivalent) | Enter Chat / Explore conversational mode |

**If any flags/options ARE provided** (`--new`, `--existing`, `--project`, etc.), skip this menu entirely and proceed directly to the appropriate flow.

### Options
| Option | Description |
|--------|-------------|
| `--new` | Force new project flow (skip detection) |
| `--existing` | Force existing project flow (skip detection) |
| `--deep [standard\|full]` | Set discovery depth level. Default: standard. Standard = 6-8 agents + 3 debate rounds. Full = 8-10 agents + 5 debate rounds + cross-review. |
| `--verbose` | Show full debate transcripts during execution (default: synthesis-only) |
| `--project {id}` | Target a specific project in monorepo mode |
| `--skip-tests` | Skip test infrastructure evaluation |
| `--skip-skills` | Skip skills.sh integration |
| `--atdd-ready` | Prepare AC for ATDD workflow integration |
| `--help` | Show this help message |

### Deprecated Flags

The following flags have been removed and will produce errors if used:

- `--party`: Error: "The --party flag has been replaced by --deep. Use /discover --deep [standard|full]"
- `--classic`: Error: "The --classic flag has been removed. /discover now uses deep discovery by default."

### Examples

| Command | Description |
|---------|-------------|
| `/discover` | Run discovery (presents interactive menu) |
| `/discover --new` | Force new project setup with deep discovery |
| `/discover --existing` | Analyze existing project (standard depth, default) |
| `/discover --deep full` | Full-depth analysis with all agents + 5 debate rounds |
| `/discover --deep standard --verbose` | Standard depth with full transcript output |
| `/discover --existing --skip-tests` | Analyze existing project, skip test evaluation |
| `/discover --project api-service` | Discover a specific project in a monorepo |
| `/discover --atdd-ready` | Prepare for ATDD workflow |

### What It Does

#### For New Projects (is_new_project: true)
1. **Project Vision** (D7) — Interactive elicitation: problem, users, features, constraints → Project Brief
2. **Research** (D3) — 4 parallel research agents: best practices, compliance, performance, testing
3. **Tech Stack Selection** — Recommend cohesive stack, user confirms
4. **Product Requirements** (D7) — Generate PRD from brief + research → functional/NFR/MVP scope
5. **Architecture Blueprint** (D8) — Design components, data model, API structure, directory layout
6. **Constitution** (D3) — Generate from all prior artifacts, interactive article review
7. **Project Structure** (D4) — Scaffold src/ from blueprint, install skills, set up tests
8. **Finalize** — Update state, display summary

#### For Existing Projects (is_new_project: false)
1. **Project Analysis** (4 agents in parallel)
   - **Architecture & Tech Stack** (D1) — Structure, frameworks, dependencies, deployment topology, integrations
   - **Data Model** (D5) — Database schemas, entities, relationships, migrations
   - **Functional Features + Behavior Extraction** (D6) — API endpoints, UI pages, background jobs, business domains, Given/When/Then AC
   - **Test Coverage** (D2) — Coverage by type, critical untested paths, test quality
1b. **Characterization Tests** — Generate test.skip() scaffolds from extracted AC
1c. **Artifact Integration** — Link AC to features, generate traceability matrix and report
1d. **ATDD Bridge** (only if `--atdd-ready`) — Create ATDD checklists, tag AC
2. **Discovery Report** — Assemble unified report including RE artifacts
3. **Generate constitution** — Informed by discovery findings
4. **Install skills** — From skills.sh for your tech stack
5. **Fill testing gaps** — Add missing test infrastructure
6. **Configure cloud** — Optional deployment setup
7. **Interactive Walkthrough** — Constitution review (mandatory), architecture review, permission audit, test gap review, iteration configuration, smart next steps

### Output
After completion, you'll have:

**Existing projects:**
- `docs/project-discovery-report.md` - Unified discovery report (tech stack, architecture, data model, features, test coverage, RE summary)
- `docs/architecture/architecture-overview.md` - Detailed architecture documentation
- `docs/isdlc/test-evaluation-report.md` - Test analysis with per-type coverage and quality assessment
- `docs/isdlc/constitution.md` - Tailored project constitution
- `docs/isdlc/skill-customization-report.md` - Installed skills report
- `docs/requirements/reverse-engineered/` - Acceptance criteria by domain
- `tests/characterization/` - Characterization test scaffolds
- `docs/isdlc/ac-traceability.csv` - Code → AC → Test mapping
- `docs/isdlc/reverse-engineer-report.md` - RE execution summary

**New projects:**
- `docs/project-brief.md` - Problem statement, users, features, constraints
- `docs/requirements/prd.md` - Product Requirements Document with MVP scope
- `docs/architecture/architecture-overview.md` - Architecture blueprint with data model and API design
- `docs/architecture/data-model.md` - Detailed data model (if >5 entities)
- `docs/architecture/test-strategy-outline.md` - Test strategy outline (deep discovery only)
- `docs/isdlc/constitution.md` - Tailored project constitution
- `src/` - Project structure scaffolded from architecture blueprint
- `tests/` - Test infrastructure (unit, integration, e2e)

**Monorepo mode** (when `--project {id}` is used, CWD matches a registered project, or monorepo detected):
- All `docs/` outputs go to the resolved docs path (`docs/{project-id}/` when `docs_location` is `"root"` or absent, `{project-path}/docs/` when `docs_location` is `"project"` — configured in monorepo.json)
- Discovery scopes analysis to the project's path (not entire monorepo root)
- Constitution goes to `docs/isdlc/projects/{project-id}/constitution.md` (project override)
- State updates go to `.isdlc/projects/{project-id}/state.json`
- External skills install to `.isdlc/projects/{project-id}/skills/external/` (not shared `.claude/skills/external/`)
- External skills manifest at `docs/isdlc/projects/{project-id}/external-skills-manifest.json`
- Skill report at `docs/isdlc/projects/{project-id}/skill-customization-report.md`

**Context Handover:**
- `discovery_context` envelope written to `.isdlc/state.json` (audit-only metadata) -- records when discovery was last run and what was found, for provenance tracking. Project knowledge is delivered to subsequent workflows via AVAILABLE SKILLS and the SessionStart cache, not by reading this envelope.

**CWD-based project resolution** (when `--project` not provided):
- If CWD is inside a registered project path, that project is auto-selected
- Resolution order: `--project` flag > CWD detection > `default_project` > interactive prompt

### Implementation

When this command is invoked:

**If NO flags/options provided (`/discover` alone):**
1. Use the Task tool to launch the `discover-orchestrator` agent
2. Pass explicit instruction: "No options specified. Present the interactive discovery mode selection menu before proceeding."
3. The orchestrator presents the 3-option menu and waits for user selection before taking further action

**If flags/options ARE provided (`/discover --new`, `/discover --existing`, etc.):**
1. **Launch discover-orchestrator agent** via the Task tool:
   ```
   Task tool → discover-orchestrator agent
   ```

2. **Pass arguments** to the orchestrator:
   ```json
   {
     "subagent_type": "discover-orchestrator",
     "prompt": "Execute /discover command [--new|--existing] [--project {id}] [--skip-tests] [--skip-skills]",
     "description": "Run project discovery workflow"
   }
   ```
   If `--project {id}` is provided, include it in the prompt so the orchestrator scopes discovery to that project's path and writes outputs to project-scoped locations.

3. **The orchestrator coordinates** the workflow by launching sub-agents:
   - `architecture-analyzer` (D1) - Tech stack, architecture, dependencies, deployment, integrations
   - `test-evaluator` (D2) - Test coverage by type, critical paths, quality assessment
   - `constitution-generator` (D3) - Creates tailored constitution with research
   - `skills-researcher` (D4) - Finds and installs relevant skills
   - `data-model-analyzer` (D5) - Database schemas, entities, relationships, migrations
   - `feature-mapper` (D6) - API endpoints, UI pages, background jobs, domains + behavior extraction
   - `product-analyst` (D7) - Vision elicitation, brainstorming, PRD generation (new projects)
   - `architecture-designer` (D8) - Architecture blueprint from PRD and tech stack (new projects)
   - `characterization-test-generator` - Generate test.skip() scaffolds from AC (Phase 1b)
   - `artifact-integration` - Link AC to features, traceability matrix (Phase 1c)
   - `atdd-bridge` - ATDD checklists and AC tagging (Phase 1d, --atdd-ready only)

   For existing projects, D1, D2, D5, and D6 run **in parallel** during Phase 1.
   Phases 1b, 1c, 1d run **sequentially** after Phase 1.
   For new projects, D7 handles vision + PRD, D8 handles architecture blueprint.

4. **After the discover-orchestrator returns successfully** — run INDEX REFRESH (all steps fail-open):
   a. **Code index refresh**: Call `mcp__code-index-mcp__refresh_index` then `mcp__code-index-mcp__build_deep_index`. If either fails, log warning and continue.
   b. **Session cache rebuild**: Run `node bin/rebuild-cache.js` (REQ-0001 FR-007). If it fails, log warning and continue.
   c. **Contract regeneration**: Run `node bin/generate-contracts.js` and `node bin/generate-contracts.js --output .isdlc/config/contracts`. If either fails, log warning and continue.
   d. **Memory embeddings rebuild**: Rebuild roundtable memory vector indexes if sessions exist. If it fails, log warning and continue.
   e. **Code embeddings refresh**: If embedding pipeline is configured (`docs/.embeddings/` exists), trigger re-index of source files. If not configured or fails, skip silently.

### Related Commands
- `/isdlc feature` - Build a new feature after discover completes
- `/isdlc fix` - Fix a bug after discover completes
- `/isdlc test run` - Run existing tests
- `/isdlc status` - Check current project status

### Prerequisites
- iSDLC framework must be installed (`.isdlc/` and `.claude/` folders exist)
- `state.json` must exist with `project.is_new_project` flag
- **Monorepo sub-projects:** `.isdlc/` and `.claude/` may be in a parent directory. The orchestrator walks up parent directories to find the project root. You do not need these folders inside each sub-project.

### See Also
- `docs/isdlc/constitution.md` - Project constitution
- `.isdlc/state.json` - Project state
