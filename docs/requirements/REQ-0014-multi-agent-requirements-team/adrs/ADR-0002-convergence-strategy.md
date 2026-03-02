# ADR-0002: Blocking-Findings-Zero Convergence with Max-3-Rounds Hard Limit

## Status

Accepted

## Context

The debate loop needs a termination condition. Without one, the Critic could continue finding issues indefinitely, creating an infinite loop. The convergence strategy must balance quality improvement (more rounds = more refinement) with practical execution time (NFR-001: 15 minutes max) and reliability (NFR-004: always terminates).

### Options Considered

1. **Blocking-findings-zero + max rounds** -- Converge when Critic finds 0 BLOCKING findings. Hard limit at N rounds.
2. **Diminishing returns** -- Converge when the number of BLOCKING findings decreases by less than 50% from the previous round.
3. **Score threshold** -- Critic assigns a quality score (1-10). Converge when score >= 8.
4. **Fixed rounds** -- Always run exactly 2 rounds (Creator -> Critic -> Refiner -> Critic).

### Requirements Driving This Decision

- FR-004: Max 3 rounds, convergence on 0 BLOCKING findings
- NFR-001: 3-round debate within 15 minutes
- NFR-004: Loop always terminates
- Article X (Fail-Safe Defaults): System must fail safely, never hang

## Decision

Use **option 1: blocking-findings-zero convergence with max-3-rounds hard limit**.

**Convergence condition:** Critic produces 0 BLOCKING findings (WARNING findings are allowed and do not block convergence).

**Hard limit:** 3 rounds maximum. If the loop has not converged after round 3 (i.e., Critic still has BLOCKING findings after the third review), the loop terminates and saves the latest artifacts with an explicit unconverged warning.

**Round definition:**
- Round 1: Creator produces draft -> Critic reviews
- Round 2: Refiner improves -> Critic reviews (only if round 1 had BLOCKING findings)
- Round 3: Refiner improves -> Critic reviews (only if round 2 had BLOCKING findings)

**Edge case -- Convergence on Round 1:** If the Critic finds 0 BLOCKING findings on the first review (Creator produced excellent artifacts), the loop converges immediately without invoking the Refiner. This is the expected behavior for experienced users with clear feature descriptions.

**Unconverged handling:**
- Save the latest artifacts (best effort -- they have been improved even if not fully converged)
- Generate debate-summary.md with UNCONVERGED status
- Append a warning to requirements-spec.md noting remaining BLOCKING findings
- Log warning in state.json history
- Allow Phase 01 to complete (do not block the gate). Downstream phases are aware of unconverged status.

## Consequences

**Positive:**
- Simple binary condition (blocking count == 0) is easy to implement and verify
- Hard limit guarantees termination (NFR-004)
- WARNING findings do not cause unnecessary rounds (pragmatic -- some warnings are opinion-based)
- Early convergence (round 1) saves time for high-quality initial drafts
- Unconverged path still produces improved artifacts (better than no debate)

**Negative:**
- BLOCKING/WARNING classification is subjective -- depends on Critic prompt quality
- 3-round max may be insufficient for very complex requirements (mitigated: this is for Phase 01 only, which produces 5-15 requirements typically)
- Unconverged artifacts may contain known defects that propagate to later phases

**Risks:**
- Critic always finds BLOCKING findings (over-calibrated). Mitigation: Critic prompt includes explicit criteria for BLOCKING vs WARNING severity, with examples.
- Critic never finds BLOCKING findings (under-calibrated). Mitigation: Critic has mandatory BLOCKING checks (Given/When/Then format, quantified NFRs) that cannot be classified as WARNING.

## Alternatives Rejected

### Option 2: Diminishing Returns
Converge when improvement rate < 50%. Rejected because it requires comparing finding counts across rounds, adding complexity without clear benefit. A simple zero check is more predictable.

### Option 3: Score Threshold
Rejected because quality scores are inherently subjective and non-deterministic. A binary "blocking issues exist or they do not" is more reliable than "quality score >= 8".

### Option 4: Fixed Rounds
Always run exactly 2 rounds. Rejected because it wastes time when the Creator produces excellent artifacts on round 1 (no need for Refiner if Critic finds 0 issues). Also, it caps at 2 rounds which may not be enough for complex features.
