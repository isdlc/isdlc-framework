---
Status: Draft
Confidence: High
Last Updated: 2026-03-07
Coverage: technical-analysis 85%
Source: REQ-0047 / GH-108a
---

# Impact Analysis: Contributing Personas -- Roundtable Extension

## 1. Codebase Scan Summary

- **Keywords searched**: persona, contributing, roundtable, roster, verbosity, getPersonaPaths, ROUNDTABLE_CONTEXT, owned_skills, triggers
- **Files scanned**: 130+ across src/claude/agents, src/antigravity, src/claude/hooks
- **Primary change surface**: 6 files (4 existing, 2 new)

## 2. Directly Modified Files (Tier 1)

| File | Change | Effort |
|------|--------|--------|
| `src/antigravity/analyze-item.cjs` (lines 255-261) | Extend `getPersonaPaths()` to scan `.isdlc/personas/` and implement override-by-copy logic | ~15 lines |
| `src/claude/hooks/lib/common.cjs` (lines 4272-4283) | Extend ROUNDTABLE_CONTEXT builder to scan `.isdlc/personas/`, read `.isdlc/roundtable.yaml`, inject verbosity/roster config | ~30 lines |
| `src/claude/agents/roundtable-analyst.md` | Add roster proposal protocol, verbosity rendering rules, late-join protocol, contributing persona conversation rules | ~50 lines prose |
| `src/antigravity/ANTIGRAVITY.md.template` (lines 122-127) | Update Step A3 to reference dynamic persona loading instead of hardcoded 3 | ~5 lines |

## 3. New Files (Tier 1)

| File | Purpose | Effort |
|------|---------|--------|
| `src/claude/agents/persona-security-reviewer.md` | Built-in security contributing persona | ~35 lines |
| `src/claude/agents/persona-qa-tester.md` | Built-in QA/test contributing persona | ~35 lines |
| `src/claude/agents/persona-ux-reviewer.md` | Built-in UX/accessibility contributing persona | ~35 lines |
| `src/claude/agents/persona-devops-reviewer.md` | Built-in DevOps/SRE contributing persona | ~35 lines |
| `src/claude/agents/persona-domain-expert.md` | Blank template for user customization | ~15 lines |

## 4. Transitively Affected Files (Tier 2)

| File | Impact | Reason |
|------|--------|--------|
| `src/claude/skills/analysis-topics/**/*.md` | `contributing_personas` arrays need updating to reference new persona IDs | Schema exists, values need population |
| `src/claude/hooks/config/skills-manifest.json` | May need entries for contributing persona skill bindings | Depends on how skill wiring is formalized |
| `CLAUDE.md` | Needs reference to `.isdlc/roundtable.yaml` config | Small addition to project instructions |
| `src/claude/hooks/tests/concurrent-analyze-structure.test.cjs` | New test cases for dynamic persona loading | ~40 lines |

## 5. Side Effects (Tier 3)

| Area | Risk | Mitigation |
|------|------|------------|
| Session cache size | More persona files = larger ROUNDTABLE_CONTEXT section | Only activated personas loaded; bullet format keeps files small |
| Existing test suites | Tests that assert exactly 3 persona paths may fail | Update assertions to allow >= 3 |
| Dispatch prompt size | Roster proposal + verbosity config add to prompt | Minimal -- ~10 lines of config context |

## 6. Entry Points

**Recommended implementation order**:

1. **Config file and verbosity** (FR-004, FR-005): Create `.isdlc/roundtable.yaml` schema, wire reading into `common.cjs`, update `roundtable-analyst.md` with verbosity rendering rules
2. **Persona discovery** (FR-001, FR-009): Extend `getPersonaPaths()` and `common.cjs` ROUNDTABLE_CONTEXT builder to scan `.isdlc/personas/` with override-by-copy
3. **Built-in contributing personas** (FR-002, FR-007): Create 5 new persona files with skill wiring
4. **Roster proposal** (FR-003): Add roster inference logic to `roundtable-analyst.md` (keyword matching against `triggers`)
5. **Mid-conversation invitation** (FR-006): Add late-join protocol to `roundtable-analyst.md`
6. **Output integration** (FR-008): Update artifact write instructions for contributing persona observation folding
7. **Tests**: Update `concurrent-analyze-structure.test.cjs`

## 7. Risk Assessment

| Risk Zone | Likelihood | Impact | Mitigation |
|-----------|-----------|--------|------------|
| `getPersonaPaths()` change breaks existing flow | Low | High | Additive change only; existing 3 paths always returned first |
| `common.cjs` ROUNDTABLE_CONTEXT size growth | Medium | Medium | Only load activated personas; contributing format is ~35 lines |
| Override-by-copy name collision | Low | Low | Exact filename match is deterministic; document clearly |
| Roster inference false positives | Medium | Low | User confirms/amends before analysis starts |

## 8. Blast Radius Summary

- **Direct changes**: 4 existing files + 5 new files
- **Transitive impact**: 4 files (topic arrays, test file, CLAUDE.md, manifest)
- **Side effects**: 3 areas (cache size, test assertions, prompt size)
- **Overall risk**: LOW -- additive changes to well-understood surfaces, fail-open design, no schema breaking changes
