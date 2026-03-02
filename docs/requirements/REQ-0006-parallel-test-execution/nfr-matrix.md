# Non-Functional Requirements Matrix: REQ-0006

| NFR ID | Category | Requirement | Metric | Target | Validation Method |
|--------|----------|-------------|--------|--------|-------------------|
| NFR-01 | Performance | Parallel test speedup | Execution time ratio (parallel/sequential) | >= 2x for 50+ test files | Measure before/after execution time |
| NFR-02 | Compatibility | Framework support | Frameworks supported | 7 (Jest, Vitest, pytest, Go, node:test, Cargo, JUnit) | Verify lookup table in agent prompts |
| NFR-03 | Reliability | No false positives | Tests that pass sequential but fail parallel reported as flaky, not failures | 0 false positive failures | Sequential fallback retry |
| NFR-04 | Simplicity | Implementation scope | Files changed | Prompt-only (.md files), no new CJS modules, no new deps | Code review |
| NFR-05 | Fail-safe | Default behavior | Behavior when detection fails | Sequential execution (no change from current) | Test with unrecognized framework |
| NFR-06 | Observability | Parallel metadata | State tracking | parallel_execution field in test_results | Verify state.json after test phase |

## Constitutional Alignment

| NFR ID | Constitutional Article | Compliance |
|--------|----------------------|------------|
| NFR-01 | N/A (new capability) | N/A |
| NFR-02 | Art IV (Explicit over Implicit) | Lookup table is explicit, no guessing |
| NFR-03 | Art IX (Quality Gate Integrity) | Gates not weakened by parallelism |
| NFR-04 | Art V (Simplicity First), Art XII (Dual Module System) | No new deps, no new CJS modules |
| NFR-05 | Art X (Fail-Safe Defaults) | Sequential is the safe default |
| NFR-06 | Art IV (Explicit over Implicit) | State changes logged |
