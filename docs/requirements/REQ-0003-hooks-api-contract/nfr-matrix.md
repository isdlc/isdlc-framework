# Non-Functional Requirements Matrix: REQ-0003

| ID | Category | Requirement | Metric | Target |
|----|----------|-------------|--------|--------|
| NFR-01 | Dependencies | Zero external npm dependencies for schema validation | Package count | 0 |
| NFR-02 | Performance | Schema validation overhead per hook | Time (ms) | < 5ms |
| NFR-03 | Resilience | Fail-open on validation errors | Error handling | All hooks exit 0 on schema errors |
| NFR-04 | Constitution | Articles I, IV, VII, VIII, IX, X compliance | Gate validation | All pass |
| NFR-05 | Test Coverage | Schema validation path coverage | Line coverage | 100% |
| NFR-06 | Compatibility | Node.js version support | Runtime | Node 18+ (ESM CLI, CJS hooks) |
| NFR-07 | File Size | Schema files total size | Bytes | < 20KB total |
