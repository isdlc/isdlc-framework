---
Status: Complete
Confidence: High
Last Updated: 2026-03-07
---

# Quick Scan: REQ-0047 Contributing Personas

## Codebase Scan

- **`getPersonaPaths()`** (`analyze-item.cjs:255-261`): Hardcoded 3-file array. Needs `.isdlc/personas/` scanning + override-by-copy.
- **ROUNDTABLE_CONTEXT builder** (`common.cjs:4272-4283`): Hardcoded 3-file list. Needs same extension + config reading.
- **`roundtable-analyst.md`**: Persona loading instructions reference 3 built-ins. Needs dynamic loading, roster proposal, verbosity modes, late-join.
- **`ANTIGRAVITY.md.template`** (lines 122-127): Hardcodes "Read all three persona files". Needs dynamic reference.
- **Topic files** (`analysis-topics/**/*.md`): Already have `contributing_personas` arrays -- schema ready, values need populating with new persona IDs.
- **Agent frontmatter pattern**: `owned_skills` field used by all 48 agents. Contributing personas follow same pattern.
- **No existing `.isdlc/personas/` directory**: Feature is net-new user surface.
- **No existing `.isdlc/roundtable.yaml`**: Config file is net-new.

## Keyword Hits

| Keyword | File Count | Key Locations |
|---------|-----------|---------------|
| `persona` | 42 | agents/, common.cjs, analyze-item.cjs |
| `contributing_personas` | 6 | topic files (all 6 topics) |
| `owned_skills` | 48 | every agent frontmatter |
| `getPersonaPaths` | 2 | analyze-item.cjs (definition + call) |
| `ROUNDTABLE_CONTEXT` | 2 | common.cjs, ANTIGRAVITY.md.template |
| `roundtable.yaml` | 0 | does not exist yet |
| `.isdlc/personas` | 3 | BACKLOG.md, draft.md, hackability-roadmap.md (all references, no implementation) |
