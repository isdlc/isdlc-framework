# Non-Functional Requirements Matrix: REQ-0001

**Feature**: Simplify /discover command menu
**Created**: 2026-02-08

---

## NFR Matrix

| ID | Category | Requirement | Measurement | Target | Priority |
|----|----------|-------------|-------------|--------|----------|
| NFR-1 | Performance | Menu display time including auto-detect | Wall clock time from /discover invocation to menu render | <1 second | P1 |
| NFR-2 | Data Integrity | Chat/Explore must not modify persistent state | Diff of state.json before and after Chat session | Zero changes to state.json, constitution, or any generated artifacts | P0 |
| NFR-3 | Maintainability | All changes are markdown-only | File extension audit of changed files | No .js, .cjs, .json config changes (except test files) | P1 |
| NFR-4 | Backward Compatibility | --new and --existing CLI flags work identically to before | Manual test: /discover --new, /discover --existing | Same behavior as current implementation | P0 |
| NFR-5 | Usability | Menu options are self-explanatory | User can select correct option without reading docs | Each option has a clear title + 1-line description | P0 |
| NFR-6 | Consistency | Menu format matches other iSDLC menus | Visual comparison with /sdlc menu | Same box-drawing characters, spacing, and interaction pattern | P1 |
| NFR-7 | Constitutional Compliance | Article I (Specification Primacy) | Requirements spec exists and is source of truth | requirements-spec.md complete before implementation | P0 |
| NFR-8 | Constitutional Compliance | Article IV (Explicit Over Implicit) | No assumptions about project type | Auto-detect informs recommendation only, user always chooses | P0 |
| NFR-9 | Constitutional Compliance | Article V (Simplicity First) | Menu option count | 3 options (down from 4), no nested follow-up questions | P0 |

---

## Traceability

| NFR | Related FR | Constitutional Article |
|-----|-----------|----------------------|
| NFR-1 | FR-2 (auto-detect badge) | -- |
| NFR-2 | FR-3 (Chat/Explore) | Article III (Security by Design) |
| NFR-3 | FR-1, FR-4, FR-5, FR-6 | Article V (Simplicity First) |
| NFR-4 | FR-4 (CLI cleanup) | Article IV (Explicit Over Implicit) |
| NFR-5 | FR-1 (menu replacement) | Article IV (Explicit Over Implicit) |
| NFR-6 | FR-1 (menu replacement) | Article VIII (Living Documentation) |
| NFR-7 | All FRs | Article I (Specification Primacy) |
| NFR-8 | FR-2 (recommended badge) | Article IV (Explicit Over Implicit) |
| NFR-9 | FR-1 (menu replacement) | Article V (Simplicity First) |
