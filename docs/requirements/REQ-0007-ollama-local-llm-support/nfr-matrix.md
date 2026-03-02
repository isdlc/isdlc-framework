# Non-Functional Requirements Matrix: REQ-0007

| NFR ID | Category | Requirement | Metric | Measurement Method | Priority |
|--------|----------|-------------|--------|-------------------|----------|
| NFR-001 | Usability | Zero-config UX after install | Zero manual env var steps in Ollama happy path | Manual verification: install with Ollama, launch claude, verify auto-detection | Must Have |
| NFR-002 | Compatibility | Backward compatibility | All existing tests pass without modification | Run full test suite (`npm test`) | Must Have |
| NFR-003 | Reliability | Graceful degradation | No unhandled exceptions from provider detection | Test with Ollama not running, no API key set | Must Have |
