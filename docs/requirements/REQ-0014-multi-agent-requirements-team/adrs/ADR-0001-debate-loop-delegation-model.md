# ADR-0001: Orchestrator-Managed Sequential Delegation for Debate Loop

## Status

Accepted

## Context

The multi-agent requirements debate loop (Creator -> Critic -> Refiner) needs a coordination mechanism. Three approaches were considered:

1. **Orchestrator-managed sequential delegation** -- The existing sdlc-orchestrator delegates to each agent sequentially, reads outputs, decides next step.
2. **Sub-orchestrator agent** -- A new `01-debate-orchestrator.md` agent manages the loop, invoked by the sdlc-orchestrator.
3. **Parallel multi-agent team** -- Use the TeamCreate/SendMessage pattern from the Inception Party (discover-orchestrator.md Phase 1/2) to run agents in parallel.

### Requirements Driving This Decision

- FR-004: Debate loop orchestration with max 3 rounds and convergence detection
- FR-008: Orchestrator delegation updates for debate mode
- NFR-004: Loop must always terminate (max 3 rounds)
- NFR-005: Pattern must be extensible to other phases
- CON-001: No new runtime dependencies
- Article V (Simplicity First): Simplest architecture that satisfies requirements

### Inception Party Precedent

The Inception Party deep discovery (discover-orchestrator.md) uses the parallel team pattern (TeamCreate + SendMessage + broadcast) for its Vision Council and Stack Debate phases. This works well there because:
- 3 agents need to see each other's positions simultaneously
- Agents debate with each other directly
- User responses are broadcast to all agents

The requirements debate loop is fundamentally different:
- Agents operate sequentially (Creator produces, then Critic reviews, then Refiner improves)
- Agents do not need to see each other's real-time messages
- Output of one agent is the input of the next
- The orchestrator makes the convergence decision, not the agents

## Decision

Use **orchestrator-managed sequential delegation** (option 1). The sdlc-orchestrator adds a new section to its Phase 01 delegation logic that:

1. Delegates to Creator (01-requirements-analyst.md) with DEBATE_CONTEXT
2. Reads Creator's artifacts
3. Delegates to Critic (01-requirements-critic.md) with artifacts
4. Reads Critic's findings, counts BLOCKING findings
5. If blocking > 0 and round < max: delegates to Refiner (01-requirements-refiner.md)
6. Loops back to step 3

The orchestrator tracks round number, convergence status, and findings history in `active_workflow.debate_state`.

## Consequences

**Positive:**
- Simplest implementation: no new coordination primitives needed (Article V)
- Orchestrator already manages Phase 01 delegation -- extending it is natural
- Sequential delegation means no concurrency concerns
- State tracking in active_workflow follows existing patterns
- Easy to debug: each delegation is a distinct Task tool call with clear inputs/outputs
- Extensible: adding debate to Phase 03 means adding a similar section with different agent references (NFR-005)

**Negative:**
- Orchestrator prompt grows larger (mitigated by self-contained debate section)
- If future phases need more complex debate patterns (parallel critique, multiple critics), this model would need enhancement
- No real-time agent-to-agent communication (agents cannot ask each other clarifying questions)

**Risks:**
- Orchestrator prompt may become too large over time. Mitigation: the debate section can be extracted to a sub-orchestrator agent if/when the orchestrator exceeds reasonable size. This is explicitly deferred per Article V (YAGNI).

## Alternatives Rejected

### Option 2: Sub-Orchestrator Agent
A `01-debate-orchestrator.md` agent would manage the Creator->Critic->Refiner loop, invoked as a single delegation from the sdlc-orchestrator.

**Why rejected:** Adds an unnecessary layer of indirection. The sub-orchestrator would need to delegate via Task tool to other agents, but it would also need to track state and interact with state.json. The sdlc-orchestrator already does all of this. Adding a sub-orchestrator increases cognitive complexity without functional benefit.

### Option 3: Parallel Multi-Agent Team
Use TeamCreate/SendMessage (Inception Party pattern) to run Creator, Critic, and Refiner as a team that communicates via messages.

**Why rejected:** The requirements debate is inherently sequential (Creator must finish before Critic can review, Critic must finish before Refiner can improve). Parallel coordination adds complexity for a fundamentally sequential workflow. The Inception Party pattern works for parallel exploration (3 agents with different perspectives examining the same question simultaneously), not for sequential pipeline processing.
