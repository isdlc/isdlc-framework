# Non-Functional Requirements Matrix: BUG-0001

| NFR ID | Category | Requirement | Acceptance Threshold | Validation Method |
|--------|----------|-------------|---------------------|-------------------|
| NFR-01 | Reliability | Zero test regressions after rename | 0 failures | Run full test suite |
| NFR-02 | Compatibility | No runtime behavior changes | All hooks function identically | Integration tests |
| NFR-03 | Installer | Correct file copied to target projects | `isdlc.md` in `.claude/commands/` | Installer test |
| NFR-04 | Module Integrity | CJS + ESM files both updated | No mixed old/new refs | grep audit |
