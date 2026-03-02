# Non-Functional Requirements Matrix: REQ-0005

| NFR ID | Category | Requirement | Target | Verification |
|--------|----------|-------------|--------|-------------|
| NFR-01 | Reliability | Fail-open behavior | All hooks exit 0 on error, no stdout | Unit tests with corrupted inputs |
| NFR-02a | Performance | PreToolUse hook latency | < 10s (timeout) | Test with large state.json |
| NFR-02b | Performance | PostToolUse hook latency | < 5s (timeout) | Test with large output |
| NFR-02c | Performance | logHookEvent latency | < 50ms | Benchmark test |
| NFR-03a | Compatibility | CJS module format | .cjs extension, require/module.exports | File extension check |
| NFR-03b | Compatibility | Node.js version | 18, 20, 22, 24 | CI matrix |
| NFR-03c | Compatibility | OS support | macOS, Linux, Windows | CI matrix |
| NFR-03d | Compatibility | No npm deps | Built-in modules only | Import audit |
| NFR-03e | Compatibility | Hook protocol | JSON stdin/stdout per Article XIII | Protocol tests |
| NFR-04a | Testability | Test file per hook | *.test.cjs co-located | File existence check |
| NFR-04b | Testability | Min test count | >= 10 per hook | Test count audit |
| NFR-04c | Testability | Test framework | node:test | Import check |
| NFR-05a | Regression | Existing tests | 164 CJS tests pass | Full suite run |
| NFR-05b | Regression | Existing hooks | 18 hooks unmodified (except logging) | Diff audit |
| NFR-05c | Regression | Hook ordering | Preserved for existing hooks | settings.json diff |
| NFR-06a | Logging | Non-interference | Logging failure never affects block/allow | Error injection test |
| NFR-06b | Logging | Performance | Log writes < 50ms | Benchmark |
| NFR-06c | Logging | Disk safety | Log rotation at 1MB | Large file test |
