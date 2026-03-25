# Gate-blocker does not verify test-to-requirement traceability — relies on agent self-report

**Source**: GitHub Issue #209
**Author**: vihang-hub

## Problem

The gate-blocker hooks across Phases 05, 06, and 07 do not verify traceability between requirements, test designs, and test implementations. Additionally, constitutional compliance is self-attested by the agent rather than independently verified, and coverage enforcement is fail-open when test runners don't output coverage data.

## 6 Gaps Identified

1. **Phase 05**: Requirements → Test Designs — not enforced (file existence only)
2. **Phase 06**: Test Designs → Test Implementations — not enforced (pass/fail only)
3. **Phase 07**: Test Completeness — not enforced (coverage % only)
4. **Coverage enforcement**: Fail-open when no coverage output from test runner
5. **Constitutional compliance**: Self-attested by producing agent
6. **Threshold mismatch**: Standard tier enforces 80%/70%, not 95%

## Acceptance Criteria

- AC-01: Phase 05 gate parses requirements-spec.md and test-strategy.md; every AC has at least one test case; orphan ACs block
- AC-02: Phase 06 gate parses test-strategy.md and scans test files; every designed test case has an implementation
- AC-03: Phase 07 gate verifies executed tests match the full designed set
- AC-04: Coverage check warns or blocks when no coverage data is available
- AC-05: Constitutional compliance has independent verification
- AC-06: Existing ATDD validation preserved (no regression)
- AC-07: All hooks fail-open on parse errors (Article X)
- AC-08: All checks covered by automated tests
