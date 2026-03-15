# REQ-0066: Team Continuity Memory — Project-Level Knowledge Retention Across Work Gaps

**Source**: GitHub Issue #125
**Created**: 2026-03-15

## Description

Leverage the project-level vector index (from REQ-0064) to serve as institutional memory that surfaces relevant past context when a team resumes work after a gap. When a roundtable starts on a topic that was previously analyzed weeks or months ago, semantic search retrieves team-accumulated insights — past decisions, architectural reasoning, preference patterns, and rejected alternatives.

## Key Capabilities

1. **Gap-aware context retrieval** — when a roundtable topic matches past sessions from weeks/months ago, surface those insights with temporal context ("3 months ago, the team decided...")
2. **Decision trail** — past architecture decisions and their reasoning retrievable by semantic similarity to current work
3. **Team onboarding** — new members get accumulated project wisdom without reading every commit message
4. **Cross-session continuity** — work that spans multiple sessions maintains coherent context

## Hyperspace-Inspired Features

Adapted from Hyperspace AGI v3.0.10 (Varun Mathur, hyperspaceai/agi):

### Research DAG — Linked Knowledge Graph

Hyperspace builds a Research DAG where observations, experiments, and syntheses link across domains with lineage chains (depth 8+ levels). Adapt for iSDLC:

- **Session linking**: Each session record stores references to related past sessions it built upon or contradicted. When the roundtable retrieves a past decision, it also retrieves the chain of sessions that led to it.
- **Lineage tracking**: Track how decisions evolve: "REQ-0042 chose middleware → REQ-0048 reconsidered due to auth complexity → REQ-0052 settled on direct integration." Each node links to the previous, forming a decision evolution chain.
- **Cross-topic synthesis**: When architecture decisions in one area affect another (e.g., auth pattern choice impacting error handling design), the DAG links them. The roundtable can surface: "The error handling pattern was influenced by the auth integration decision from 2 months ago."

### Playbook Curator — Distilled Team Wisdom

Hyperspace uses an LLM to explain *why* winning mutations work, so new joiners bootstrap from accumulated wisdom. Adapt for iSDLC:

- **Decision rationale summaries**: After each roundtable, the handler generates a "playbook entry" — a concise NL summary of what was decided and why, written for a future reader who has no context. Richer than a commit message, more accessible than reading full artifacts.
- **Pattern extraction**: Periodically (or on compaction), an LLM pass over accumulated session records extracts recurring patterns: "This team consistently prefers explicit error handling over silent defaults", "Architecture discussions always go deep when auth is involved."
- **Bootstrap briefing**: When a new team member's first roundtable starts on this project, the memory layer surfaces a curated set of high-hit-rate playbook entries as onboarding context — the team's accumulated wisdom in 5-10 key insights.

### Cross-Domain Propagation — Insight Hypotheses

Hyperspace propagates insights across domains as hypotheses ("finance discovery → search hypothesis"). Adapt for iSDLC:

- **Cross-topic hypotheses**: When a decision in one analysis topic produced good results, surface it as a hypothesis when a related topic comes up later. Example: "When the team pruned weak validation rules in the auth module (REQ-0048), test coverage improved 15%. This pattern might apply to the input validation work you're starting now."
- **Observation → experiment → synthesis cycle**: Session records are tagged as observations (raw findings), experiments (decisions made), or syntheses (patterns extracted from multiple sessions). The search layer can filter by type — retrieving synthesized patterns first, then supporting experiments, then raw observations.

### Gossip-Style Knowledge Propagation

Hyperspace uses gossip protocol for knowledge sharing across agents. Adapt for iSDLC:

- **Git-as-gossip**: The project `.emb` index at `docs/.embeddings/` propagates via git push/pull — every team member who pulls gets the latest team memory. No separate sync mechanism needed.
- **Conflict-aware merge**: When two team members run roundtables on different branches that both update the project index, the merge strategy must handle vector index conflicts (rebuild from combined raw session records rather than binary merge).

## SmartMemory-Inspired Features

Adapted from davidball/smart-memory (Python cognitive architecture) and smartmemorymcp (MCP server for Claude Desktop):

### Episodic vs Semantic Memory Distinction

smart-memory implements 4 cognitive memory types (working, semantic, episodic, procedural) based on Baddeley's model. Adapt for iSDLC:

- **Semantic memory**: Facts and patterns about the project — "this team prefers explicit error handling", "the auth module uses a custom token format". These are the compacted, distilled insights from REQ-0064's playbook curator. They answer "what does the team know?"
- **Episodic memory**: Specific events and decisions — "3 months ago in REQ-0042, the team chose middleware but reversed it in REQ-0048 because of auth complexity". These carry temporal context and causal reasoning. They answer "what happened and when?"
- Memory entries in the project index should be tagged with `memory_type: "semantic" | "episodic"` so the search layer can weight or filter by type. Episodic memories are more relevant when resuming after a gap ("what happened last time?"); semantic memories are more relevant for ongoing work ("what does the team prefer?").

### Memory Evolution and Consolidation

smart-memory's 7-stage pipeline includes an "evolution" stage where transformation rules consolidate short-term memories into long-term storage. Adapt for iSDLC:

- **Periodic consolidation**: On `isdlc memory compact`, an LLM pass reads the last N episodic memories and extracts recurring patterns into new semantic memories. Example: 5 separate sessions where the team went deep on auth → consolidated into a semantic memory: "This team consistently goes deep on auth-related architecture."
- **Evolver rules**: Configurable rules that trigger consolidation — e.g., "when 3+ episodic memories share similarity > 0.7, propose a semantic consolidation." The LLM generates the consolidated memory, user reviews before it's committed.
- **Promotion**: High-importance episodic memories can be promoted to semantic memories by the playbook curator: "This decision was significant enough to become a standing team pattern."

### Graph-Based Memory Linking

smart-memory uses FalkorDB to maintain "mentions", "related-to", "contradicts" relationships between memories. Adapt for iSDLC without adding a graph database:

- **Lightweight linking via metadata**: Each memory entry can carry a `links` array of `{ target_chunk_id, relation_type }` objects. Relation types: `builds_on`, `contradicts`, `supersedes`, `related_to`.
- **Link creation**: The playbook curator identifies links when generating session records — "this decision builds on the auth architecture from REQ-0042" → creates a `builds_on` link. Tiered deduplication merges also create `supersedes` links automatically.
- **Link traversal at search time**: When a memory is retrieved, its linked memories are also fetched (1-hop). This gives the roundtable the decision chain, not just the final state.
- **No graph database**: Links are stored as metadata in the existing SQLite/`.emb` stores. Traversal is a secondary query, not a graph operation. This keeps the architecture simple — a graph DB can be added later if link density justifies it.

### Memory Curation at Team Level

smartmemorymcp provides pin/archive/tag at the individual level. Extend for team use:

- **Team pinning**: Any team member can pin a project memory. Pinned project memories are always surfaced in the bootstrap briefing for new members.
- **Team archiving**: Outdated team decisions can be archived conversationally ("that auth approach is no longer relevant"). Archived memories are excluded from search but retained for audit/history.
- **Team tagging**: Domain tags (`auth`, `error-handling`, `deployment`) allow the roundtable to filter relevant memories by the current analysis topic.

## Supermemory-Inspired Features

Adapted from supermemory.ai (AI memory and context engine, ranked #1 on LongMemEval, LoCoMo, ConvoMem benchmarks):

### 3-Type Memory Model with Differentiated Lifecycles

Supermemory distinguishes Facts (persist until updated), Preferences (strengthen through repetition), and Episodes (decay unless significant). Adapt for iSDLC:

- **Facts**: Team architectural decisions, technology choices, constraint documentation. Persist until explicitly updated or contradicted. Example: "This project uses direct integration for auth, not middleware."
- **Preferences**: Team analysis patterns that strengthen each time they're reinforced. Example: "This team prefers brief on security" — after 5 sessions confirming this, the preference weight is high. Maps to REQ-0064's `appeared_count` self-ranking, but elevated to an explicit memory type.
- **Episodes**: Specific session events with temporal context. Example: "In REQ-0042 (January), the team spent 3 exchanges debating retry semantics." Episodes decay unless they contributed to a Fact or Preference — in which case they're preserved as supporting evidence.
- Memory type assignment is automatic via the playbook curator. The consolidation engine (below) promotes high-value episodes to facts or preferences.

### Derives Relationship — System-Inferred Connections

Supermemory's graph has 3 relationship types: Updates, Extends, and Derives. Updates and Extends are adopted in REQ-0064 FR-013. Derives is the novel one for REQ-0066:

- **Derives**: The system infers new connections from patterns in accumulated memories that no one explicitly stated. Example: the team always goes deep on architecture when auth is involved (derived from 4 episodes) → system creates a new Preference memory: "Auth topics trigger deep architecture analysis."
- Derives runs during the consolidation pass (compaction or periodic), not at write time. The LLM reads across accumulated memories and generates derived insights.
- Derived memories are tagged `derived: true` and link back to their source memories for traceability.

### Auto-Generated Team Profile (Static + Dynamic)

Supermemory's dual-aspect user profile (static long-term facts + dynamic recent context, auto-refreshed) adapts for team use:

- **Static profile**: Distilled team wisdom — top 5-10 high-confidence Facts and Preferences. Auto-generated from the memory index on each compaction pass. This is the "bootstrap briefing" for new team members.
- **Dynamic profile**: Recent episodic context — last 3-5 session summaries, currently active topics, in-progress decisions. Auto-refreshed after each session.
- **Profile delivery**: At roundtable startup, the handler receives both profiles as part of memory context. Static profile is always included (constant-size, like Supermemory's 50ms retrieval). Dynamic profile is appended if the current topic is related.

### "Memory is Not RAG" Design Principle

Supermemory's core philosophy: memory extracts user-specific evolving facts, RAG retrieves stateless document chunks. Combined in unified queries.

- iSDLC already has both: codebase embeddings (REQ-0045) = RAG, roundtable memory (REQ-0063/0064) = memory. REQ-0066 should formalize the hybrid query: when a roundtable starts, search both the memory index (team patterns) AND the codebase index (code context) in a unified query, ranking results across both sources.
- This enables: "The auth module (from code search) was last discussed 2 months ago (from memory) when the team decided to use direct integration (from memory) because the token format required raw request access (from code search)."

## REQ-0064 → REQ-0066 Boundary

REQ-0064 establishes the infrastructure primitives. REQ-0066 builds higher-level team capabilities on top.

| Concept | REQ-0064 establishes | REQ-0066 extends |
|---------|---------------------|------------------|
| **Memory types** | Informal heuristic: `appeared_count > 3` = preference, decays slower (FR-016 AC-016-06) | Formal `memory_type: "fact" \| "preference" \| "episode"` tagging, promotion rules, consolidation engine |
| **Linking** | Update/Extend relationships via `updates_ref` and `merge_history` (FR-013) | Additional types: `builds_on`, `contradicts`, `related_to`, `Derives`. Multi-hop traversal at search time. |
| **Tagging** | User `tags[]` for personal labels (FR-015). `container` for domain scoping (FR-017) | Team-level tagging: team pinning, team archiving, team domain tags via project store curation |
| **Playbook curator** | Per-session: generates `summary`, `context_notes`, `playbook_entry`, `importance` at session end (FR-001) | Cross-session: periodic LLM pass extracts recurring patterns into new synthesized memories. Bootstrap briefing for new members. |
| **Curation** | `pin`, `archive`, `tag` on both stores via MemoryStore interface (FR-015) | Team-level curation policies: any team member can pin project memories, team archiving via conversational commands |
| **Store capabilities** | Both SQLite and .emb support `pin()`, `archive()`, `tag()` via metadata sidecar | REQ-0066 uses these primitives for team-level features — no additional store changes needed |

## Dependencies

- **REQ-0064** (vector DB migration) — requires: project-level vector index at `docs/.embeddings/`, playbook curator (FR-001), tiered deduplication with Update/Extend links (FR-013), importance scoring (FR-014), memory curation primitives on both stores (FR-015), auto-pruning with temporal decay (FR-016), container tags (FR-017)
- **REQ-0063** (roundtable memory layer) — same infrastructure, richer team-facing use case

## Out of Scope

- Cross-project memory (different repos) — separate ticket if needed
- Real-time collaboration (multiple users in same roundtable session)
- Distributed agent swarms (Hyperspace's Autoswarm concept) — not applicable to single-machine CLI
- Warps / declarative agent transformation — covered by hackability roadmap, separate tickets
- Graph database (FalkorDB, Neo4j) — lightweight metadata linking only; graph DB deferred unless link density justifies it
