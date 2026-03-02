# ADR-0002: BACKLOG.md as Primary Data Store

## Status
Accepted

## Context
The backlog management feature needs a data store for the curated backlog. Options include extending the existing BACKLOG.md file, creating a structured JSON/YAML file, or using a lightweight database. The store must support both local-only and Jira-backed items, be human-readable, and integrate with git version control.

## Decision
Use **BACKLOG.md** (the existing Markdown file) as the sole data store for backlog items. Extend the format with optional metadata sub-bullets for Jira-backed items.

## Rationale
- **Already exists:** BACKLOG.md is the framework's established curated backlog
- **Human-readable:** Developers can read and edit it directly in any editor
- **Git-friendly:** Markdown diffs are meaningful and easy to review
- **Local-first (CON-004):** Works without any external dependencies
- **Backward compatible (NFR-002):** Existing entries work unchanged; metadata is additive
- **Simple (Article V):** No database engine, no schema migration, no query language

## Format

```markdown
- 7.7 [ ] Title -- Description
  - **Jira:** PROJ-1234
  - **Priority:** High
  - **Confluence:** https://wiki.example.com/pages/123
```

## Consequences

**Positive:**
- Zero infrastructure requirements
- Human and machine readable
- Full git history and audit trail
- No migration needed for existing users
- Familiar format for developers

**Negative:**
- Not queryable (no SQL, no indexing)
- Concurrent edits could cause merge conflicts (low risk for single-developer tool)
- Parsing requires regex (not schema-validated)
- Limited to ~100 items before readability degrades

## Alternatives Considered

### .isdlc/backlog.json
- Machine-readable but not human-friendly
- Would require a viewer/editor command
- Breaks the "readable backlog" design goal
- Rejected: Article V (simpler to use Markdown)

### .isdlc/backlog.yaml
- Better than JSON for readability
- But BACKLOG.md already exists and is used
- Migrating would be a breaking change
- Rejected: unnecessary migration

### SQLite database
- Massively over-engineered for 10-50 items
- Requires new dependency or built-in module
- Not human-readable without tooling
- Rejected: Article V (YAGNI)

## Traces To
FR-001, FR-002, FR-003, FR-004, NFR-002, CON-004
