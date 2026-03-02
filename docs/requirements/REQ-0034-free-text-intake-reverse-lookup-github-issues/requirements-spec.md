# Requirements Specification: REQ-0034 Free-Text Intake Reverse-Lookup GitHub Issues

## 1. Business Context

**Problem Statement**: When users provide free-text descriptions to `/isdlc add` or `/isdlc analyze`, the framework creates entries with `source: "manual"` and `source_id: null`. This produces backlog items with no external tracking link, making them invisible to GitHub issue tracking, project boards, and team-level tooling.

**Stakeholders**:
- **iSDLC framework users (developers)**: Primary beneficiaries who use free-text input and need GitHub traceability
- **Team leads / project managers**: Need visibility into all work items via GitHub project boards
- **iSDLC framework maintainers**: Need the feature to be consistent with existing source detection patterns

**Success Metrics**:
- Every free-text backlog item either links to an existing GitHub issue or offers to create one
- Zero regression in the existing `#N` (GitHub) and `PROJECT-N` (Jira) detection paths
- Add handler remains under 5-second performance target (existing NFR-004)

**Driving Factors**:
- Free-text is the most natural input mode, but produces the least-connected output
- The existing `detectSource()` function has a clean three-way branch (`github`, `jira`, `manual`) that can be extended
- The `gh` CLI is already referenced in 7+ files across the codebase, establishing precedent

## 2. Stakeholders and Personas

### Developer (Primary User)
- **Role**: Software developer using iSDLC framework for day-to-day work
- **Goals**: Add work items quickly using natural language, have them tracked in GitHub automatically
- **Pain Points**: Has to manually create GitHub issues then re-add with `#N` syntax, or accept that free-text items lack external tracking
- **Technical Proficiency**: High (CLI user, familiar with `gh` CLI)
- **Key Tasks**: `/isdlc add "feature description"`, `/isdlc analyze "feature description"`

### Team Lead (Secondary Stakeholder)
- **Role**: Oversees project via GitHub project boards and issue labels
- **Goals**: All work items visible in GitHub, regardless of how they were created
- **Pain Points**: Manual-source items are invisible to GitHub-based project management
- **Impact**: Indirect -- benefits from improved traceability without changing their workflow

## 3. User Journeys

### Journey 1: Free-Text Add with Existing GitHub Issue Match (Happy Path)

1. User types: `/isdlc add "Add payment processing"`
2. Framework detects free-text input (not `#N` or `PROJECT-N`)
3. Framework searches GitHub: `gh issue list --search "Add payment processing" --json number,title,state --limit 5`
4. Framework finds matching issue(s) and presents them:
   ```
   Found matching GitHub issues:
   [1] #42 - Add payment processing module (open)
   [2] #38 - Payment processing integration (closed)
   [3] None of these -- create a new issue
   [4] Skip -- proceed without linking
   ```
5. User selects [1]
6. Framework sets `source = "github"`, `source_id = "GH-42"`
7. Framework fetches issue title for slug generation: uses "#42" title, not the free-text input
8. Normal add flow continues (slug generation, meta.json creation, BACKLOG.md append)
9. Confirmation: "Added 'Add payment processing module' to the backlog (linked to GitHub #42)."

### Journey 2: Free-Text Add with No Match -- Create New Issue

1. User types: `/isdlc add "Implement rate limiting for API endpoints"`
2. Framework searches GitHub: no matching issues found
3. Framework presents:
   ```
   No matching GitHub issues found.
   [1] Create a new GitHub issue and link it
   [2] Skip -- proceed without linking
   ```
4. User selects [1]
5. Framework creates issue: `gh issue create --title "Implement rate limiting for API endpoints" --body "Created via iSDLC framework"`
6. Framework extracts the new issue number from the response
7. Framework sets `source = "github"`, `source_id = "GH-{new_number}"`
8. Normal add flow continues
9. Confirmation: "Added 'Implement rate limiting for API endpoints' to the backlog (created and linked GitHub #73)."

### Journey 3: Free-Text Add -- User Skips Linking

1. User types: `/isdlc add "Quick prototype for demo"`
2. Framework searches GitHub: finds 0 or N matches
3. User selects "Skip -- proceed without linking"
4. Framework falls back to existing behavior: `source = "manual"`, `source_id = null`
5. Normal add flow continues as today

### Journey 4: Free-Text Add -- gh CLI Not Available

1. User types: `/isdlc add "New feature"`
2. Framework attempts GitHub search but `gh` CLI is not installed or not authenticated
3. Framework gracefully degrades: "GitHub CLI not available. Proceeding without issue linking. Install `gh` and run `gh auth login` to enable issue linking."
4. Falls back to existing behavior: `source = "manual"`, `source_id = null`

### Journey 5: Free-Text Analyze with Linking

1. User types: `/isdlc analyze "Add payment processing"`
2. Framework resolves item via `resolveItem()` -- no existing match
3. Framework prompts: "No matching item found. Would you like to add it to the backlog first?"
4. User confirms -- triggers the add flow (Journeys 1-4 above)
5. Analysis continues with the now-linked item

## 4. Technical Context

### Runtime & Module System
- **Language**: Node.js (CommonJS modules)
- **Key Module**: `src/claude/hooks/lib/three-verb-utils.cjs`
- **CLI Command Definitions**: `src/claude/commands/isdlc.md` (markdown-based command handler)

### Existing Patterns
- `detectSource(input)` is the decision point: `#N` -> github, `PROJECT-N` -> jira, else -> manual
- The add handler in `isdlc.md` (step 3) calls `detectSource()` and branches on the result
- `gh` CLI is used elsewhere in the codebase (security auditor, orchestrator, skill files)
- GitHub issue fetching is done in the add handler step 3a for `#N` input: `gh issue view N --json title,labels,state`

### Hard Constraints
- **No state.json writes**: Add and analyze handlers are inline (no workflow)
- **No branch creation**: Runs on current branch
- **Performance**: Add handler must complete under 5 seconds (NFR-004)
- **Backward compatibility**: Existing `#N` and `PROJECT-N` detection must not regress
- **Graceful degradation**: Must work when `gh` CLI is not available (fall back to manual)

### Integration Points
- `detectSource()` in `three-verb-utils.cjs` -- modify or extend
- Add handler step 3c in `isdlc.md` -- insert reverse-lookup logic
- `meta.json` schema -- no changes needed (already has `source` and `source_id` fields)
- `BACKLOG.md` -- no changes needed (append logic is source-agnostic)
- Test files: `test-three-verb-utils.test.cjs`, `test-three-verb-utils-steps.test.cjs`

## 5. Quality Attributes & Risks

### Prioritized Quality Attributes

| Attribute | Priority | Threshold |
|-----------|----------|-----------|
| **Usability** | High | Match presentation must be clear; user can select/skip in under 5 seconds |
| **Reliability** | High | Graceful degradation when gh CLI unavailable; never block the add flow |
| **Performance** | High | Total add handler time under 5 seconds including GitHub search |
| **Maintainability** | Medium | New logic follows existing `detectSource` patterns |
| **Testability** | Medium | New functions must be unit-testable with mocked gh CLI |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| `gh` CLI not installed or not authenticated | Medium | Medium | Graceful degradation to manual; clear user message with setup instructions |
| GitHub API rate limiting | Low | Low | Search uses `gh issue list` which has generous rate limits; no mitigation needed for typical usage |
| Search returns too many results | Medium | Low | Limit results to 5; provide "create new" and "skip" options |
| Search returns irrelevant results | Medium | Low | User reviews matches and can always skip or create new |
| Network failure during search | Low | Medium | Timeout at 5 seconds; fall back to manual with warning |
| Regression in existing `#N`/`PROJECT-N` paths | Low | High | Existing paths execute BEFORE the new reverse-lookup; comprehensive test coverage |
| Performance degradation from network call | Medium | Medium | `gh` search adds 1-3 seconds; acceptable within 5-second budget |

## 6. Functional Requirements

### FR-001: GitHub Issue Search on Free-Text Input
When a user provides free-text input (not matching `#N` or `PROJECT-N` patterns) to `/isdlc add` or `/isdlc analyze`, the framework SHALL search GitHub for matching issues using `gh issue list --search "{input}" --json number,title,state --limit 5`.

**Acceptance Criteria**:
- AC-001-01: Free-text input triggers a GitHub issue search before defaulting to `source: "manual"`
- AC-001-02: The search query uses the user's exact free-text input
- AC-001-03: Results are limited to 5 issues maximum
- AC-001-04: Both open and closed issues are included in search results
- AC-001-05: The existing `#N` and `PROJECT-N` detection paths are NOT affected (they execute first)

### FR-002: Match Presentation and Selection
When GitHub search returns results, the framework SHALL present matching issues to the user and allow selection.

**Acceptance Criteria**:
- AC-002-01: Each result shows: issue number, title, and state (open/closed)
- AC-002-02: A "None of these -- create a new issue" option is always available
- AC-002-03: A "Skip -- proceed without linking" option is always available
- AC-002-04: User selects by entering the option number
- AC-002-05: If only one strong match is found, it may be pre-highlighted but never auto-selected

### FR-003: Issue Linking on Match Selection
When a user selects a matching issue, the framework SHALL set `source = "github"` and `source_id = "GH-{N}"` for the backlog item.

**Acceptance Criteria**:
- AC-003-01: `meta.json` is written with `source: "github"` and `source_id: "GH-{N}"`
- AC-003-02: The issue title (not the free-text input) is used for slug generation via `generateSlug()`
- AC-003-03: Issue labels are checked for bug detection (consistent with existing `#N` behavior)

### FR-004: Issue Creation on No Match
When no matching issues are found (or user selects "create new"), the framework SHALL offer to create a new GitHub issue.

**Acceptance Criteria**:
- AC-004-01: The user is prompted: "No matching GitHub issues found. Create a new issue?"
- AC-004-02: If confirmed, a new issue is created via `gh issue create --title "{input}"`
- AC-004-03: The new issue number is extracted from the creation response
- AC-004-04: The backlog item is linked to the new issue (`source: "github"`, `source_id: "GH-{N}"`)
- AC-004-05: The issue body includes a reference to the iSDLC framework

### FR-005: Skip Option (Manual Fallback)
The user SHALL always be able to skip GitHub linking and proceed with `source: "manual"`.

**Acceptance Criteria**:
- AC-005-01: A "Skip" option is available at every prompt (match selection and no-match prompt)
- AC-005-02: Selecting skip produces identical behavior to the current manual flow
- AC-005-03: No warning or negative messaging when user chooses to skip

### FR-006: Graceful Degradation
When the `gh` CLI is not available, not authenticated, or encounters a network error, the framework SHALL fall back to manual source detection without blocking the add flow.

**Acceptance Criteria**:
- AC-006-01: The framework checks for `gh` CLI availability before attempting search
- AC-006-02: If `gh` is not available: display informational message, proceed with manual
- AC-006-03: If `gh` is available but not authenticated: display auth instructions, proceed with manual
- AC-006-04: If search times out (>3 seconds): proceed with manual, display warning
- AC-006-05: No error is thrown that would prevent the add/analyze flow from completing

### FR-007: Analyze Handler Integration
The `/isdlc analyze` handler SHALL leverage the same reverse-lookup when resolving free-text input that doesn't match an existing backlog item.

**Acceptance Criteria**:
- AC-007-01: When analyze triggers an add (no existing item found), the add flow includes reverse-lookup
- AC-007-02: When analyze is invoked with free-text that matches an existing item, no reverse-lookup is performed
- AC-007-03: The reverse-lookup does not affect the analyze phase execution flow

## 7. Out of Scope

- **Jira reverse-lookup**: Only GitHub is supported in this release. Jira integration may follow later.
- **Automatic issue linking without user confirmation**: All linking requires user selection/confirmation.
- **Batch reverse-lookup**: Retroactively linking existing manual items to GitHub issues.
- **GitHub issue label management**: Creating or assigning labels during issue creation.
- **GitHub project board assignment**: Adding issues to specific project boards.
- **Two-way sync**: Updating the GitHub issue when the backlog item changes (or vice versa).
- **GitHub Enterprise support**: Only github.com (default `gh` remote) is supported initially.

## 8. MoSCoW Prioritization

| FR | Title | Priority | Rationale |
|----|-------|----------|-----------|
| FR-001 | GitHub Issue Search | Must Have | Core feature -- without search, the feature doesn't exist |
| FR-002 | Match Presentation | Must Have | Users need to see and select matches |
| FR-003 | Issue Linking | Must Have | The primary value delivery -- linking items to issues |
| FR-005 | Skip Option | Must Have | Users must always be able to opt out |
| FR-006 | Graceful Degradation | Must Have | Cannot break existing flow when gh is unavailable |
| FR-004 | Issue Creation | Should Have | Valuable but users can manually create issues and use `#N` |
| FR-007 | Analyze Integration | Should Have | Consistency, but analyze already chains to add when needed |
