# Architecture Overview: Concurrent Phase Execution in Roundtable Analyze

**Source**: GH-63
**Date**: 2026-02-21
**Status**: Complete

---

## 1. Architecture Options

### Option A: Monolithic Lead with Inline Persona Sections

| Aspect | Detail |
|--------|--------|
| **Summary** | Single refactored `roundtable-lead.md` containing orchestration logic, all three persona definitions, topic coverage tracking, and artifact production rules |
| **Pros** | Simplest to implement. Single file = full context always available. Easy to debug. |
| **Cons** | Violates FR-008 (persona split). Cannot serve as agent teams spawn prompts. File would be 800+ lines. Editing one persona risks breaking another. Not testable in isolation. |
| **Existing patterns** | Closest to current `roundtable-analyst.md` (monolithic) |
| **Verdict** | **Eliminated** -- blocks agent teams (FR-006/FR-007) entirely |

### Option B: Lead Orchestrator + Separate Persona Files (Read-All Model)

| Aspect | Detail |
|--------|--------|
| **Summary** | Split into 4 files per FR-008. In single-agent mode, lead reads all 3 persona files at startup. In agent teams mode, each persona file is the spawn prompt for a teammate. |
| **Pros** | Satisfies FR-008 and FR-006/FR-007. Persona files independently editable and testable. Lead focused on orchestration. Each file works as both supplement (single-agent) and standalone prompt (agent teams). Clean separation of concerns. |
| **Cons** | Reading 4 files consumes context window budget. Lead must coordinate without direct access to persona internals. Agent must synthesize instructions from multiple files. |
| **Existing patterns** | Some precedent (`isdlc.md` reads config from multiple sources) but no existing agent uses multi-file composition |
| **Verdict** | **Selected** -- see Section 2 |

### Option C: Lead Orchestrator + Dynamic Persona Loading (Read-On-Demand)

| Aspect | Detail |
|--------|--------|
| **Summary** | Same 4-file split, but lead only reads persona files when that persona needs to contribute. Maya loaded first, Alex when codebase findings ready, Jordan when design specificity reached. |
| **Pros** | Minimizes context window usage at any point. Could allow deeper persona instructions. More scalable. |
| **Cons** | Introduces statefulness in file loading. Risk of losing persona voice mid-conversation. More complex orchestration. Dynamic loading mid-conversation is unusual for Claude Code agents. Agent teams mode doesn't benefit. |
| **Existing patterns** | No precedent in the codebase |
| **Verdict** | **Eliminated** -- adds complexity for a benefit (context savings) that is not a binding constraint |

## 2. Selected Architecture

### ADR-001: Lead Orchestrator + Separate Persona Files (Read-All Model)

**Status**: Accepted
**Context**: The concurrent conversation model requires splitting the monolithic `roundtable-analyst.md` into components that can serve both as single-agent supplements and agent teams spawn prompts (FR-008, FR-006, FR-007).

**Decision**: Adopt Option B -- a lead orchestrator file plus three separate persona files, with the lead reading all persona files at startup in single-agent mode.

**Rationale**:
1. Directly satisfies FR-008 (persona split) and FR-006/FR-007 (dual execution modes) without compromise
2. Context window concern is manageable -- current monolithic file is ~559 lines; the split redistributes rather than adds content. Four files at ~150-200 lines each is comparable total context.
3. Read-all-at-startup matches how Claude Code agents work in practice
4. Option C's dynamic loading adds complexity for a non-binding constraint
5. Option A blocks agent teams entirely

**Consequences**:
- Voice blending risk in single-agent mode (R2) -- mitigated by strong persona voice integrity rules and anti-blending rule in each persona file
- Multi-file composition is a new pattern for iSDLC agents -- sets precedent for future agent designs
- Each persona file must be self-contained enough to work as a standalone agent teams spawn prompt

### ADR-002: Agent Teams as Preferred Execution Mode

**Status**: Accepted
**Context**: The requirements defined agent teams as "opt-in" (FR-006 AC-006-02) and "Could Have" priority. The question is whether to design the architecture with single-agent as primary and agent teams as an afterthought, or with agent teams as a first-class execution mode.

**Decision**: Design agent teams as the preferred execution mode. Single-agent mode is the fallback when agent teams is unavailable or disabled.

**Rationale**:
- Total token budget is **redistributed, not increased**. The same analytical work currently done sequentially (consuming tokens in one long context) is distributed across parallel contexts. Each persona gets a full context window for its domain instead of sharing one window.
- The concurrent conversation model is a natural fit for agent teams -- each persona genuinely runs concurrently rather than being simulated by a single agent context-switching.
- Designing for agent teams first ensures persona files are truly self-contained. If they work as standalone spawn prompts, they'll also work as supplements in single-agent mode.

**Consequences**:
- Persona files must include everything a teammate needs: identity, principles, artifact responsibilities, artifact folder path, meta.json protocol
- Lead orchestrator must include agent teams coordination logic (task assignment, message handling, artifact merge)
- Single-agent mode inherits the clean persona separation designed for agent teams, which is a net positive

### ADR-003: File Discovery Abstraction (Dual-Mode Topic Resolution)

**Status**: Accepted
**Context**: FR-009 requires restructuring 24 phase-based step files into topic-based reference files. The impact analysis recommended a PoC strategy where the lead initially reads existing step files before restructuring. The user wants to retain visibility of step files throughout development and not lose them in a big-bang restructuring.

**Decision**: Design a file discovery abstraction in the lead orchestrator that resolves topic content from either of two sources:

- **Mode 1 (interim)**: Read from `src/claude/skills/analysis-steps/{phase_key}/*.md` -- the current phase-based structure. The lead treats step file content as topic guidance, ignoring phase sequencing metadata (step_id, depends_on).
- **Mode 2 (final)**: Read from new topic-based directories (e.g., `src/claude/skills/analysis-topics/{topic_name}.md`). Same content, reorganized with `coverage_criteria` frontmatter.

The switchover is a single path change in the lead's file discovery instructions. Step files remain in place until Mode 2 is validated and confirmed working.

**Rationale**:
1. Risk reduction: don't change the orchestration model AND the file structure simultaneously
2. Preserves step file visibility -- developers can reference and compare during development
3. Clean migration path: validate Mode 2 against Mode 1 content, confirm coverage parity, then remove Mode 1
4. The abstraction is lightweight -- a path pattern and a content interpretation rule, not a code layer

**Consequences**:
- Lead orchestrator instructions must describe both modes and how to switch between them
- Topic files (Mode 2) must contain a superset of the analytical knowledge in step files (Mode 1)
- The switchover point is a documented decision, not an automatic detection

### File Structure

```
src/claude/agents/
  roundtable-lead.md          (NEW -- orchestration, coverage tracking, thresholds, coordination)
  persona-business-analyst.md  (NEW -- Maya: identity, principles, voice rules, artifact responsibilities)
  persona-solutions-architect.md (NEW -- Alex: identity, principles, voice rules, artifact responsibilities)
  persona-system-designer.md   (NEW -- Jordan: identity, principles, voice rules, artifact responsibilities)
  roundtable-analyst.md        (DELETE -- replaced by the above 4 files)

src/claude/skills/analysis-steps/   (PRESERVED in Mode 1, removed after Mode 2 validated)
  00-quick-scan/*.md
  01-requirements/*.md
  02-impact-analysis/*.md
  03-architecture/*.md
  04-design/*.md

src/claude/skills/analysis-topics/  (NEW in Mode 2)
  problem-discovery/
  technical-analysis/
  architecture/
  specification/
  security/                         (NEW topic, FR-009 AC-009-04)
```

### Architectural Risks

| Risk | Mitigation |
|------|------------|
| Voice blending in single-agent mode (R2) | Strong voice integrity rules per persona file. Anti-blending rule: persona stays silent rather than echoes. |
| Coverage tracker miscalibration (R3) | Topic files define explicit coverage_criteria. Conservative lower thresholds for initial implementation. |
| Information threshold miscalibration (R4) | Conservative higher thresholds -- write later rather than earlier. Confidence indicators flag low-confidence sections. |
| Agent teams race conditions on shared artifacts (R5) | Artifact ownership partitioning: Maya owns requirements-spec.md, Alex owns impact-analysis.md and architecture-overview.md, Jordan owns design files. Only lead writes meta.json. |
| Monolithic lead prompt too large (R9) | Orchestration logic replaces step engine logic (comparable size). Persona details moved to separate files, reducing lead size. |

## 3. Technology Decisions

| Technology | Version | Rationale | Alternatives Considered |
|------------|---------|-----------|------------------------|
| Agent prompt files (Markdown) | N/A | iSDLC convention. All agents are markdown files. No new technology. | None -- framework constraint |
| Agent Teams (Claude Code Experimental) | Feature-flagged (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`) | Native Claude Code capability for genuine parallelism. Preferred execution mode per ADR-002. Token budget is redistributed across parallel contexts, not increased. | None viable -- no alternative exists within Claude Code for genuine concurrency |
| YAML frontmatter (topic files) | Standard YAML | Consistent with existing step file format. Extends current schema with `coverage_criteria` field. | JSON sidecar files (rejected -- adds file count, breaks single-file-per-topic simplicity). Inline markdown markers (rejected -- harder to parse reliably). |
| meta.json progress model | Existing schema | Zero changes to downstream consumers (`deriveAnalysisStatus()`, build verb, BACKLOG.md markers). `phases_completed` 5-phase array preserved. `steps_completed` evolves to `topics_covered` in Mode 2. | Replacing `steps_completed` with `topics_covered` immediately (rejected -- breaks interim Mode 1 compatibility). |

### New Dependencies

**None.** This feature introduces zero new npm packages, libraries, or external tools. The entire implementation is prompt engineering (markdown files) and existing Claude Code capabilities (agent teams, file I/O, tool use).

### ADR-004: No New Dependencies

**Status**: Accepted
**Context**: The feature could potentially introduce orchestration libraries, schema validators, or coordination tooling.
**Decision**: Introduce no new dependencies. All orchestration logic is expressed in agent prompt files. All coordination uses native Claude Code capabilities.
**Rationale**: The novelty is in the orchestration design, not in the technology stack. Keeping the technology deliberately conservative matches the moderate risk appetite and reduces the blast radius to prompt files only.
**Consequences**: All complexity lives in prompt engineering. No build steps, no runtime dependencies, no version compatibility concerns beyond Claude Code itself.

## 4. Integration Architecture

### Integration Points

| # | Source | Target | Interface | Data Format | Error Handling |
|---|--------|--------|-----------|-------------|----------------|
| IP-1 | `isdlc.md` (analyze section) | `roundtable-lead.md` | Task delegation (single dispatch) | Delegation prompt: slug, artifact folder path, meta.json content, draft.md content, sizing/tier info | Dispatch failure: report error, user re-invokes analyze. No retry. |
| IP-2 | `roundtable-lead.md` | 3 persona files | File read (Read tool) at startup | Markdown with structured sections (identity, principles, voice rules, artifact responsibilities) | Missing persona file: log warning, continue with remaining personas. Degraded mode, not hard failure. |
| IP-3 | `roundtable-lead.md` | 3 persona files | Agent teams spawn (Task tool) | Spawn prompt = persona file content + context (artifact folder, slug, draft, codebase scan results) | Teammate spawn failure: fall back to single-agent mode for that persona's work (R6 mitigation). |
| IP-4 | `roundtable-lead.md` | Step files (Mode 1) or topic files (Mode 2) | File read (Glob + Read tools) | Markdown with YAML frontmatter. Mode 1 ignores step_id/depends_on. Mode 2 reads coverage_criteria. | Missing/unreadable files: proceed with built-in knowledge. Files are guidance, not hard dependencies. |
| IP-5 | Lead or teammates | Artifact files in `docs/requirements/{slug}/` | File write (Write tool) | Markdown per existing artifact schemas | Each write is a complete file (not append). Write failure: previous version preserved. |
| IP-6 | `roundtable-lead.md` | `docs/requirements/{slug}/meta.json` | File read + write (Read/Write tools) | JSON per existing schema | Read failure: treat as fresh analysis. Write failure: retry once, then warn user. |

### ADR-005: Draft Content in Dispatch Prompt

**Status**: Accepted
**Context**: The lead orchestrator needs access to the draft.md content (from prior intake). It can either receive the content inline in the dispatch prompt from `isdlc.md`, or read the file itself from the artifact folder.
**Decision**: Include draft.md content in the dispatch prompt.
**Rationale**: The draft is already in `isdlc.md`'s memory from the intake check. Passing it in the prompt avoids a tool call round-trip. The draft is typically small (a few hundred lines). The context window tradeoff is worth the latency savings.
**Consequences**: The dispatch prompt from `isdlc.md` is larger (includes draft content), but the lead starts working immediately without a file read.

### ADR-006: Teammate Failure Recovery from Written Artifacts

**Status**: Accepted
**Context**: In agent teams mode, a teammate (e.g., Alex) may fail mid-analysis. The lead needs a recovery strategy.
**Decision**: On teammate failure, the lead reads whatever artifacts the failed teammate has already written to the artifact folder and continues from there -- either by picking up the work in single-agent mode or by re-spawning the teammate with the existing artifact as context.
**Rationale**: Progressive artifact writes mean each write produces a complete, coherent document. The lead can assess what's been covered by reading the artifact content. No work is wasted.
**Consequences**: Artifact files must be self-describing -- the lead (or a replacement persona) must be able to determine what has been covered and what remains by reading the artifact alone. This reinforces the progressive write model: each write is a complete document, not a fragment.

### Artifact Ownership Partitioning

| Owner | Artifacts | Rationale |
|-------|-----------|-----------|
| Maya (Business Analyst) | `requirements-spec.md`, `user-stories.json`, `traceability-matrix.csv` | Requirements domain |
| Alex (Solutions Architect) | `impact-analysis.md`, `architecture-overview.md` | Technical analysis domain |
| Jordan (System Designer) | Module design files, `interface-spec.md` | Design/specification domain |
| Lead only | `meta.json`, `quick-scan.md` | Orchestration metadata and initial scan |

In agent teams mode, only the lead writes `meta.json`. Teammates report progress to the lead via agent teams messaging, and the lead updates `meta.json`. No shared writes -- this eliminates race conditions (R5).

If two personas need to contribute to the same artifact, the lead merges their contributions. This is a coordination concern handled in the lead's orchestration logic, not a file system concern.

### Data Flow

```
User invokes analyze
       |
       v
isdlc.md (reads draft.md, meta.json, sizing info)
       |
       | Single dispatch (IP-1)
       | Prompt includes: slug, artifact folder, meta.json, draft.md content, sizing/tier
       v
roundtable-lead.md
       |
       +-- Reads persona files (IP-2, single-agent) OR spawns teammates (IP-3, agent teams)
       |
       +-- Reads step/topic files for coverage guidance (IP-4)
       |
       +-- Opens conversation (Maya leads, Alex/Jordan contribute)
       |
       +-- Progressive artifact writes (IP-5) as information thresholds met
       |       Maya -> requirements-spec.md, user-stories.json, traceability-matrix.csv
       |       Alex -> impact-analysis.md, architecture-overview.md
       |       Jordan -> design files, interface-spec.md
       |       Lead -> meta.json (IP-6), quick-scan.md
       |
       +-- Cross-check (all personas verify consistency)
       |
       +-- Finalization (user confirms, lead writes final meta.json)
       |
       v
isdlc.md (receives control back)
       |
       +-- Sizing trigger (reads impact-analysis.md, computes recommendation)
       +-- Tier computation
       +-- Done
```

### Synchronization Model

**Single-agent mode**: No concurrency concerns. One agent reads and writes all files sequentially. Persona "switching" is simulated by the single agent adopting different voices per its prompt instructions.

**Agent teams mode**: Three concurrent Claude Code instances plus the lead.
- **Write conflicts eliminated** by artifact ownership partitioning (table above)
- **Metadata conflicts eliminated** by single-writer rule (only lead writes meta.json)
- **Conversation coherence** maintained by the lead weaving teammate findings into the user conversation at natural breaks. This is a prompt engineering concern, not a file I/O concern.
- **Teammate failure recovery**: Lead reads existing artifacts written by the failed teammate and continues in single-agent mode for that persona's remaining work (ADR-006)

### Migration Path

The transition from the current system to the new one is a clean cut on a feature branch:

1. Create 4 new agent files (lead + 3 personas)
2. Update `isdlc.md` dispatch logic (single dispatch replaces phase loop)
3. Delete `roundtable-analyst.md`
4. Step files remain in place (Mode 1) until topic files are validated (Mode 2)

No period where both systems coexist. The feature branch provides the safety net for rollback.

## 5. Architecture Summary

### Executive Summary

The concurrent phase execution feature replaces the sequential 5-phase analyze pipeline with a unified conversation model orchestrated by a lead agent that coordinates three persona agents. The architecture uses Option B (Lead Orchestrator + Separate Persona Files, Read-All Model), with agent teams as the preferred execution mode and single-agent as the fallback.

### Key Decisions

| # | Decision | ADR |
|---|----------|-----|
| 1 | Lead + 3 separate persona files (read-all at startup) | ADR-001 |
| 2 | Agent teams preferred, single-agent as fallback | ADR-002 |
| 3 | Dual-mode file discovery (step files interim, topic files final) | ADR-003 |
| 4 | Zero new dependencies -- all prompt engineering | ADR-004 |
| 5 | Draft content passed in dispatch prompt for latency | ADR-005 |
| 6 | Teammate failure recovery from written artifacts | ADR-006 |

### Trade-offs Acknowledged

- **Multi-file composition is a new pattern** for iSDLC agents. Adds precedent but also complexity. Accepted because agent teams requires it.
- **Agent teams is experimental**. Accepted because single-agent fallback delivers the full UX. Token budget is redistributed, not increased.
- **Conservative thresholds** for coverage tracker and information thresholds. May result in over-questioning or late artifact writes initially. Accepted as a tuning-in-production strategy -- safer than the alternative.
- **No logging beyond meta.json**. Accepted for initial implementation. Observability improvements are a follow-on if needed.

### Go-Forward Plan

1. **Implementation follows the impact analysis order** (Steps 1-5) with the architecture decisions above applied
2. **Mode 1 (interim)**: Lead reads existing step files. Validates the conversation model without restructuring files.
3. **Mode 2 (final)**: Topic files created, validated against Mode 1 coverage, step files removed.
4. **Feature branch**: Clean cut, no coexistence period. Rollback = revert the branch.

### Handoff to Design

Jordan Park (System Designer) will take this architecture and produce:
- Concrete file structures and section layouts for each of the 4 agent files
- YAML frontmatter schema for topic files (including `coverage_criteria`)
- Dispatch prompt format specification (isdlc.md -> roundtable-lead.md)
- Agent teams spawn prompt format specification
- Artifact write protocol (progressive update format, self-describing document structure)
- meta.json schema evolution (steps_completed -> topics_covered transition)
