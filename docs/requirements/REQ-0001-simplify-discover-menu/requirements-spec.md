# Requirements Specification: Simplify /discover Command Menu

**ID**: REQ-0001
**Feature**: Simplify /discover command menu
**Status**: Draft
**Created**: 2026-02-08
**Author**: Requirements Analyst (Agent 01)
**Workflow**: feature

---

## 1. Problem Statement

The `/discover` command's interactive menu presents 4 options where the distinction between Option 1 ("Discover auto-detect") and Option 3 ("Existing Project Analysis") is unclear to users. Option 4 ("Scoped Analysis") is poorly understood. This causes confusion at the framework's first interaction point.

The menu was designed around implementation mechanics (auto-detect vs forced mode vs scoped) rather than user intent. Users need intent-based options that map to what they actually want to do.

## 2. Stakeholders

| Stakeholder | Role | Interest |
|-------------|------|----------|
| Framework users (developers) | Primary | Clear, intuitive menu with no decision paralysis |
| Framework maintainers | Secondary | Simpler code paths, less branching logic |

## 3. Functional Requirements

### FR-1: Replace 4-option menu with 3-option menu

**Current menu (to be replaced):**
```
[1] Discover (auto-detect) (Recommended)
[2] New Project Setup
[3] Existing Project Analysis
[4] Scoped Analysis
```

**New menu:**
```
[1] New Project Setup
    Define your project, select tech stack, and create constitution

[2] Existing Project Analysis (Recommended)
    Full codebase analysis with behavior extraction

[3] Chat / Explore
    Explore the project, discuss functionality, review backlog, ask questions
```

**Acceptance Criteria:**
- AC-1.1: The menu displays exactly 3 options when `/discover` is invoked with no flags
- AC-1.2: Option numbering is sequential [1], [2], [3]
- AC-1.3: Each option has a title line and a description line
- AC-1.4: The old 4-option menu no longer appears anywhere in the codebase

### FR-2: Dynamic "Recommended" badge

Auto-detect logic runs behind the scenes before displaying the menu. The "(Recommended)" suffix appears on the most appropriate option.

**Acceptance Criteria:**
- AC-2.1: When existing code is detected (src/, lib/, app/, package.json, etc.), Option [2] shows "(Recommended)"
- AC-2.2: When no existing code is detected (new project), Option [1] shows "(Recommended)"
- AC-2.3: Auto-detect runs silently -- no output to user before menu display
- AC-2.4: Only one option shows "(Recommended)" at a time

### FR-3: Chat / Explore mode

A new conversational mode that allows users to explore the project without committing to a full discovery workflow.

**Acceptance Criteria:**
- AC-3.1: Selecting Option [3] enters a conversational mode (does not start discovery workflow)
- AC-3.2: Chat mode is read-only -- does not modify state.json, does not generate constitution, does not install skills
- AC-3.3: Chat mode can read and summarize existing discovery artifacts (discovery report, constitution, state) if they exist
- AC-3.4: Chat mode can read and discuss codebase files on demand
- AC-3.5: Chat mode can discuss project backlog (CLAUDE.md unchecked items, workflow history)
- AC-3.6: Chat mode provides a way to exit back to the menu or start a full discovery flow

### FR-4: CLI option cleanup

Remove CLI flags that correspond to removed menu options.

**Acceptance Criteria:**
- AC-4.1: `--scope` flag is removed from the command definition
- AC-4.2: `--target` flag is removed from the command definition
- AC-4.3: `--priority` flag is removed from the command definition
- AC-4.4: `--new`, `--existing`, `--project`, `--skip-tests`, `--skip-skills`, `--atdd-ready` flags are preserved
- AC-4.5: `--existing` bypasses menu and goes directly to Existing Project Analysis flow
- AC-4.6: `--new` bypasses menu and goes directly to New Project Setup flow

### FR-5: Selection mapping update

Map each menu option to the correct workflow flow.

**Acceptance Criteria:**
- AC-5.1: Option [1] routes to NEW PROJECT FLOW (same as `--new`)
- AC-5.2: Option [2] routes to EXISTING PROJECT FLOW (same as `--existing`)
- AC-5.3: Option [3] routes to CHAT / EXPLORE mode (new flow)
- AC-5.4: The Option [4] follow-up questions (scope type, target name) are removed

### FR-6: Sub-agent scope parameter cleanup

Remove `--scope`/`--target` parameter handling from sub-agents.

**Acceptance Criteria:**
- AC-6.1: feature-mapper no longer references `--scope` or `--target` parameters for filtering
- AC-6.2: characterization-test-generator no longer references `--scope` or `--target` parameters
- AC-6.3: artifact-integration no longer references `--scope` or `--target` parameters
- AC-6.4: atdd-bridge no longer references `--scope` or `--target` parameters
- AC-6.5: The workflows.json reverse-engineer workflow scope/target/priority options remain unchanged (separate workflow)

## 4. Non-Functional Requirements

See nfr-matrix.md for detailed NFR specifications.

| NFR | Requirement |
|-----|-------------|
| NFR-1 | Menu must display in <1 second (auto-detect is fast) |
| NFR-2 | Chat/Explore must not modify any persistent state |
| NFR-3 | All changes are markdown-only (no JS/CJS runtime changes) |
| NFR-4 | Backward compatibility: --new and --existing flags work identically |

## 5. Out of Scope

- Changes to the actual discovery analysis workflow (D1-D8 sub-agents' internal logic)
- Changes to the new project flow or existing project flow internals
- Runtime hook or CLI JavaScript changes
- Monorepo-specific menu changes
- Changes to workflows.json reverse-engineer workflow

## 6. Affected Files

### Primary (must change)
| File | Change |
|------|--------|
| `src/claude/commands/discover.md` | Replace 4-option menu with 3-option menu, remove --scope/--target/--priority flags, update examples |
| `src/claude/agents/discover-orchestrator.md` | Replace menu presentation, selection mapping, remove Option [4] follow-up, add Chat/Explore flow |

### Secondary (may need updates)
| File | Change |
|------|--------|
| `src/claude/agents/discover/feature-mapper.md` | Remove --scope/--target parameter references |
| `src/claude/agents/discover/characterization-test-generator.md` | Remove --scope parameter references |
| `src/claude/agents/discover/artifact-integration.md` | Remove --scope parameter references |
| `src/claude/agents/discover/atdd-bridge.md` | Remove --scope parameter references |

### Verified unaffected
| File | Reason |
|------|--------|
| `src/claude/agents/00-sdlc-orchestrator.md` | References /discover generically, not menu structure |
| `lib/cli.js`, `lib/installer.js` | Runtime JS, not menu-aware |
| All D1-D8 sub-agents (except D6) | Not menu-aware |
| `.isdlc/config/workflows.json` | reverse-engineer workflow unchanged |

## 7. Dependencies

- Quick scan completed: `docs/requirements/REQ-0001-simplify-discover-menu/quick-scan.md`
- Constitution valid: 16 articles (docs/isdlc/constitution.md)
- Discovery context available (<1h old)

## 8. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Chat/Explore scope creep (becomes too feature-rich) | Medium | Low | Define as read-only from the start, defer write capabilities |
| Sub-agents still reference --scope internally | Low | Low | Grep verification during implementation |
| Users miss scoped analysis capability | Low | Low | Scoped analysis was poorly understood; no user demand observed |
