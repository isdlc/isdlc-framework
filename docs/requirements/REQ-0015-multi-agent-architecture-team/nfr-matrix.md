# Non-Functional Requirements Matrix

**REQ ID:** REQ-0015
**Feature:** Multi-agent Architecture Team

| NFR ID | Category | Requirement | Metric | Target | Measurement Method |
|--------|----------|-------------|--------|--------|-------------------|
| NFR-001 | Performance | Debate round time | Wall clock time per Critic/Refiner pass | <= 5 minutes each | Timestamp delta in state.json debate_state |
| NFR-002 | Consistency | Pattern alignment with REQ-0014 | Structural similarity score | 100% structural match (file layout, report format, convergence logic) | Manual comparison of agent file structure, critique format, change log format |
| NFR-003 | Compatibility | Backward compatibility | Regression test pass rate | 100% existing tests pass, zero behavior change when debate_mode=false | Run full test suite with --no-debate flag |
| NFR-004 | Compliance | Constitutional validation | Articles checked by Critic/Refiner | Articles III, IV, V, VII, IX, X validated per round | Critique report includes constitutional compliance section |

## NFR Traceability

| NFR | Related FRs | Constitutional Articles |
|-----|------------|----------------------|
| NFR-001 | FR-001, FR-002, FR-003 | IX (Gate Integrity) |
| NFR-002 | FR-001, FR-002, FR-005, FR-006 | VII (Artifact Traceability) |
| NFR-003 | FR-003, FR-004 | X (Fail-Safe Defaults) |
| NFR-004 | FR-001, FR-002 | III, IV, V, VII, IX, X |
