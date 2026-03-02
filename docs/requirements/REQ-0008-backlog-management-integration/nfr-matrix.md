# Non-Functional Requirements Matrix: REQ-0008 Backlog Management Integration

| ID | Category | Requirement | Metric | Priority | Validation Method |
|----|----------|-------------|--------|----------|-------------------|
| NFR-001 | Usability | All backlog operations via natural language -- no slash commands | Zero new slash commands introduced | Must Have | Audit CLAUDE.md template for instruction-based design |
| NFR-002 | Compatibility | Existing BACKLOG.md format works unchanged | All existing entries valid; backlog picker tests pass | Must Have | Run existing backlog picker tests with old-format BACKLOG.md |
| NFR-003 | Reliability | Full local operation without external integrations | Zero functionality loss for non-Jira users | Must Have | Test all local operations with MCP unconfigured |
| NFR-004 | Architecture | No new runtime dependencies | package.json dependency count unchanged | Must Have | Diff package.json before/after |
| NFR-005 | Reliability | Handle MCP auth failures gracefully | Auth failure produces actionable error, never crashes | Should Have | Simulate auth failure scenario |
