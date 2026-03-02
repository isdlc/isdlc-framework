# Module Design: REQ-0035 Transparent Confirmation at Analysis Boundaries

**Status**: Complete
**Confidence**: High
**Last Updated**: 2026-02-22
**Coverage**: 100%

## Module Overview

This feature introduces one new logical module within the existing roundtable analyst agent: the **Confirmation Sequence Controller**. It does not create new agent files or new hooks -- it extends the roundtable analyst's internal behavior.

## Module 1: Confirmation Sequence Controller

**Responsibility**: Manages the sequential presentation of summaries to the user, handles Accept/Amend responses, tracks confirmation state, and coordinates amendment re-entry into the roundtable conversation.

**Location**: New section within `src/claude/agents/roundtable-analyst.md` (replaces Section 2.5 and extends Section 5)

**Boundary**: Invoked when the existing coverage tracker signals completion. Returns control to the main conversation loop during amendments. Emits `ROUNDTABLE_COMPLETE` only after full acceptance.

### Public Interface

#### `enterConfirmationSequence()`

Triggered when completion detection criteria are met (all topics covered, all artifacts written).

**Inputs**:
- `artifactFolder` (string): Path to `docs/requirements/{slug}/`
- `tierInfo` (object): `{ effective_intensity: "trivial" | "light" | "standard" | "epic" }`
- `producedArtifacts` (string[]): List of artifact filenames that were actually written

**Behavior**:
1. Determine which summaries to present based on `tierInfo` and `producedArtifacts`
2. For trivial: generate brief change mention, present without Accept/Amend, proceed to finalization
3. For light/standard/epic: enter the sequential confirmation loop

**Output**: Confirmation state object or `ROUNDTABLE_COMPLETE` signal

#### `generateSummary(domain)`

Generates a summary for the specified domain by reading the corresponding detailed artifacts.

**Inputs**:
- `domain` (string): `"requirements"` | `"architecture"` | `"design"`

**Behavior**:
1. Read the relevant detailed artifacts from disk
2. Extract key content per domain:
   - Requirements: FRs with IDs, titles, priorities; core problem; user types; key ACs
   - Architecture: significant decisions with chosen option and rationale; integration points
   - Design: module responsibilities; data flow; sequence of operations
3. Compose a conversational summary (paragraph-level, not document-level)
4. Append artifact references ("Full details in ...")
5. Cache the generated summary

**Output**: Summary text (string)

#### `presentSummary(domain, summaryText)`

Presents a summary to the user via the RETURN-FOR-INPUT pattern.

**Inputs**:
- `domain` (string): The domain being presented
- `summaryText` (string): The generated summary

**Behavior**:
1. Format the summary with the appropriate persona voice:
   - Requirements: Maya presents
   - Architecture: Alex presents
   - Design: Jordan presents
2. Append Accept/Amend options
3. RETURN and wait for user input

**Output**: RETURN-FOR-INPUT (stops execution, waits for resume)

#### `handleConfirmationResponse(domain, userResponse)`

Processes the user's response to a summary presentation.

**Inputs**:
- `domain` (string): The domain that was presented
- `userResponse` (string): The user's text response

**Behavior**:
1. Parse intent: Accept or Amend (natural language parsing, not strict keyword match)
2. If Accept: record acceptance for this domain, advance to next domain or finalize
3. If Amend: transition to amendment conversation mode

**Output**: Next state (`"next_domain"` | `"amend"` | `"finalize"`)

#### `enterAmendmentConversation(triggerDomain)`

Re-opens the roundtable conversation for amendment.

**Inputs**:
- `triggerDomain` (string): Which domain triggered the amendment

**Behavior**:
1. All three personas engage (Maya, Alex, Jordan) regardless of trigger domain
2. Conversation follows existing roundtable flow rules (Section 2.2)
3. Artifacts are updated progressively as in the main conversation
4. When the user signals amendment is complete (natural language), re-enter confirmation sequence from requirements

**Output**: Transitions back to `enterConfirmationSequence()` with reset confirmation state

#### `persistSummaries(summaryCache)`

Writes cached summaries to disk as standalone artifacts.

**Inputs**:
- `summaryCache` (object): `{ requirements?: string, architecture?: string, design?: string }`

**Behavior**:
1. For each cached summary, write to `docs/requirements/{slug}/{domain}-summary.md`
2. Each file is a complete replacement (not append)
3. Include metadata header (Status, Confidence, Last Updated)

**Output**: List of files written

#### `recordAcceptance(acceptedDomains)`

Updates meta.json with acceptance state.

**Inputs**:
- `acceptedDomains` (string[]): List of domains that were accepted (e.g., `["requirements", "architecture", "design"]`)

**Behavior**:
1. Read current meta.json
2. Add `acceptance` field: `{ accepted_at: ISO timestamp, domains: acceptedDomains }`
3. Write meta.json (preserving all existing fields)

**Output**: Updated meta.json

### Internal State

The confirmation sequence tracks the following state internally (not persisted until finalization):

```
confirmationState = {
  currentDomain: "requirements" | "architecture" | "design" | null,
  acceptedDomains: [],           // Domains the user has accepted in this cycle
  summaryCache: {},              // Domain -> generated summary text
  amendmentCount: 0,            // Number of amendment cycles (for observability)
  applicableDomains: [],         // Domains to present based on tier and produced artifacts
  tierInfo: {}                   // Sizing/tier information from dispatch
}
```

### Dependencies

| Dependency | Direction | Interface |
|-----------|-----------|-----------|
| Coverage Tracker (Section 3) | Inbound | Triggers confirmation when coverage is complete |
| Artifact files on disk | Inbound | Read to generate summaries |
| RETURN-FOR-INPUT pattern (Section 2.7) | Outbound | Used to present summaries and collect responses |
| Roundtable conversation (Section 2.2) | Bidirectional | Amendment re-enters conversation mode |
| Meta.json writer (Section 8) | Outbound | Records acceptance state |
| Cross-Check Protocol (Section 5.3) | Inbound | Runs during amendment cycles to maintain consistency |

### Estimated Size

- Confirmation sequence specification: ~100-150 lines of agent instruction in `roundtable-analyst.md`
- No new files beyond the runtime-generated summary artifacts
- No new hooks or config entries

## Domain-to-Artifact Mapping

The summary generator reads from these artifacts per domain:

| Domain | Source Artifacts | Summary Content |
|--------|-----------------|-----------------|
| Requirements | `requirements-spec.md`, `user-stories.json` | FRs with IDs/titles/priorities, core problem, user types, key ACs |
| Architecture | `architecture-overview.md` | Significant decisions (option chosen, rationale), integration points, key tradeoffs |
| Design | `module-design.md`, `interface-spec.md`, `data-flow.md` | Module responsibilities, data flow (inline), sequence of operations (inline) |

## Domain-to-Persona Mapping

Each summary is presented by the persona who owns that domain:

| Domain | Presenting Persona | Voice |
|--------|--------------------|-------|
| Requirements | Maya Chen | "Here's what we've captured as your requirements..." |
| Architecture | Alex Rivera | "Here's the architecture approach we've landed on..." |
| Design | Jordan Park | "Here's how the design breaks down..." |

## Tier-to-Domain Mapping

| Tier | Domains Presented | Accept/Amend |
|------|-------------------|--------------|
| Standard / Epic | Requirements, Architecture, Design | Yes |
| Light | Requirements, Design | Yes |
| Trivial | Brief change mention (no formal domain) | No |
