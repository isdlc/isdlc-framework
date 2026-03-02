# Non-Functional Requirements Matrix: REQ-0014

| NFR ID | Category | Requirement | Metric | Measurement Method | Priority |
|--------|----------|-------------|--------|-------------------|----------|
| NFR-001 | Performance | 3-round debate completes within 15 min | Wall clock <= 15 min | Workflow metrics in state.json (started_at to completed_at for Phase 01) | Should Have |
| NFR-002 | Compatibility | Existing Phase 01 behavior preserved when debate OFF | 0 regressions in existing test suite | CI pipeline, `npm test` | Must Have |
| NFR-003 | Compatibility | `-light` workflows identical to current behavior | 0 behavioral differences | Artifact diff between debate-off and production baseline | Must Have |
| NFR-004 | Reliability | Debate loop always terminates | Max 3 rounds hard limit enforced | Unit tests for convergence logic + round counter | Must Have |
| NFR-005 | Maintainability | Debate pattern extensible to Phases 03/04/06 | Agent roles injected, not hardcoded | Architecture review: can Phase 03 reuse debate infra with different agents? | Should Have |
