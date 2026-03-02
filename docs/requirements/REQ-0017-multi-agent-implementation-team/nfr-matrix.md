# Non-Functional Requirements Matrix: REQ-0017

| NFR ID | Category | Requirement | Measurement | Target | Priority |
|--------|----------|-------------|-------------|--------|----------|
| NFR-001 | Performance | Per-file review overhead | Time per file (review + fix cycle) | <= 30 seconds additional per file | P1 |
| NFR-001 | Performance | Total workflow time delta | Phase 06+16+08 combined time | Net neutral or improvement vs current | P1 |
| NFR-002 | Compatibility | Backward compat (no-debate) | Existing test suite passes | 100% existing tests pass | P0 |
| NFR-002 | Compatibility | Behavioral regression | Phase 06/16/08 output when debate off | Identical to current behavior | P0 |
| NFR-003 | Consistency | Agent file naming | File naming pattern compliance | 05-{role}.md for all new agents | P0 |
| NFR-003 | Consistency | Test file naming | Test naming pattern compliance | implementation-debate-{role}.test.cjs | P0 |
| NFR-003 | Consistency | Debate mode resolution | Same function as Phases 01/03/04 | resolveDebateMode() reused | P0 |
| NFR-004 | Observability | Per-file review logging | state.json entries per file review | Every cycle logged with path, verdict, findings count | P0 |
| NFR-004 | Observability | Loop state readability | implementation_loop_state queryable | Progress reportable at any time | P1 |
