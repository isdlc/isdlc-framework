# ADR-0003: Convergence Strategy Reuse

## Status

Accepted

## Context

Phase 01's debate loop uses a convergence strategy defined in REQ-0014: the loop exits when the Critic finds zero BLOCKING findings, with a hard limit of 3 rounds. REQ-0015 must decide whether Phase 03 uses the same convergence criteria or defines phase-specific criteria.

**Requirements driving this decision:**
- FR-003 (AC-003-03): Convergence condition must be zero BLOCKING findings (same as Phase 01)
- FR-003 (AC-003-04): Maximum rounds must be 3 (same as Phase 01)
- NFR-002: Pattern consistency with REQ-0014

## Decision

**Reuse the identical convergence strategy for Phase 03.** Zero BLOCKING findings = converged. Maximum 3 rounds. No phase-specific convergence criteria.

The convergence check is part of the generalized debate loop (ADR-0001), not parameterized per phase:

```
IF blocking_count == 0:        converged = true
IF round >= max_rounds:        converged = false (best-effort exit)
```

`max_rounds` is fixed at 3 for all phases. If a future phase needs a different limit, the routing table can include a per-phase `max_rounds` override (not implemented now per Article V).

## Consequences

**Positive:**
- Consistent behavior across phases -- developers know what to expect
- Simpler implementation -- no per-phase convergence logic branching
- Existing 90 tests validate the convergence logic; reuse means those tests cover Phase 03 path too (transitively)
- Follows NFR-002 (pattern consistency) explicitly

**Negative:**
- If Phase 03 architecture debates genuinely need more rounds (e.g., complex systems with many NFRs), 3 rounds may not be sufficient. Mitigation: the unconverged path preserves best-effort artifacts and documents remaining BLOCKING findings.
- Architecture critique may be inherently more subjective than requirements critique. The Critic's 8 check categories are designed to be objective and measurable to avoid false BLOCKING inflation.

## Alternatives Considered

### Alternative: Phase-Specific Convergence Criteria

Allow each phase to define its own convergence threshold (e.g., Phase 03 allows 1 BLOCKING remaining if it is a cost-only finding).

**Rejected because:**
- Adds complexity to the convergence check without demonstrated need (Article V: YAGNI)
- Makes the debate loop behavior harder to reason about
- The Critic's severity classification (BLOCKING vs WARNING) already provides the right level of granularity
- Can be reconsidered if real-world usage shows 3 rounds is consistently insufficient for architecture debates
