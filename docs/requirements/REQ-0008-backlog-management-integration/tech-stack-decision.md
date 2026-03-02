# Technology Stack Decision: Backlog Management Integration

**Feature:** REQ-0008-backlog-management-integration
**Phase:** 03-architecture
**Created:** 2026-02-14

---

## Stack Summary

This feature requires **no new technology selections**. It extends the existing stack exclusively. The key constraint is NFR-004: "No new runtime dependencies -- package.json dependency count unchanged."

---

## Existing Stack (Retained)

### Prompt/Instruction Layer
**Choice:** Markdown agent prompts + CLAUDE.md.template
**Rationale:**
- This is the core execution model of iSDLC -- LLM reads instructions and executes them
- ~85% of this feature is markdown/prompt changes
- No code alternative would be simpler (Article V)

### Hook Runtime
**Choice:** Node.js CJS (.cjs files) for hooks
**Rationale:**
- Article XII mandates CJS for hook code
- Only 1 hook file has minor changes (menu-halt-enforcer.cjs regex update)
- Existing pattern; no reason to change

### External Integration
**Choice:** Atlassian MCP Server (Model Context Protocol)
**Rationale:**
- MCP is Claude Code's native mechanism for external service integration
- Atlassian provides an official MCP server for Jira + Confluence
- No npm packages needed -- MCP calls are made by Claude Code, not by framework code
- Follows Article V (simplicity) and NFR-004 (no new dependencies)

**Alternatives Considered:**
- Jira REST API via `fetch()`: Would require auth token management, endpoint knowledge, and error handling in CJS hooks. Violates Article V (unnecessary complexity) and NFR-004 (would need `node-fetch` or similar).
- Jira npm packages (`jira-client`, `@atlassian/jira-api`): Directly violates NFR-004. Also introduces version pinning and security audit burden.

### Data Storage
**Choice:** BACKLOG.md (Markdown file with structured metadata sub-bullets)
**Rationale:**
- BACKLOG.md already exists as the framework's curated backlog
- Human-readable, git-friendly, diff-friendly
- No database needed -- file I/O is sufficient for single-user backlog management
- Extends existing format (backward compatible per NFR-002)

**Alternatives Considered:**
- JSON file (`.isdlc/backlog.json`): Machine-readable but not human-friendly. Breaks the "readable backlog" design goal. Would require a viewer/editor.
- YAML file: Better than JSON for readability, but BACKLOG.md is already established and used. Migrating would be a breaking change.
- SQLite: Massively over-engineered for a curated list of 10-50 items. Violates Article V.

### State Extension
**Choice:** `active_workflow` fields in `.isdlc/state.json`
**Rationale:**
- `active_workflow` already carries feature description, branch name, phases, etc.
- Adding `jira_ticket_id` (string) and `confluence_urls` (string[]) follows the existing ad-hoc field pattern
- No schema migration needed -- new fields are simply present or absent

---

## Technology Evaluation Matrix

| Criteria | Atlassian MCP | Jira REST API | Jira npm Pkg |
|----------|--------------|---------------|-------------|
| No new dependencies (NFR-004) | PASS | FAIL | FAIL |
| Framework code changes | Minimal (prompts only) | Significant (CJS code) | Significant |
| Auth management | MCP handles it | Framework must manage tokens | Package manages it |
| Maintenance burden | Zero (Atlassian maintains MCP) | Moderate (API changes) | Moderate (version updates) |
| Error handling | MCP provides errors | Must code all error paths | Must code error paths |
| Confluence support | Same MCP server | Separate API | Separate package |
| Article V compliance | PASS | FAIL | FAIL |
| Total Score | 7/7 | 3/7 | 2/7 |

---

## Conclusion

The technology stack for this feature is **unchanged from the existing iSDLC framework stack**. The architectural insight is that the LLM + MCP combination provides a zero-code integration pattern that satisfies all requirements without adding technical debt, dependencies, or maintenance burden. This is the simplest architecture that meets all requirements (Article V).
