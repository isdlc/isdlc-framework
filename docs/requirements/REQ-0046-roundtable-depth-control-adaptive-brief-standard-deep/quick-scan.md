# Quick Scan — REQ-0046 Roundtable Depth Control

**Status**: Complete
**Confidence**: High
**Last Updated**: 2026-03-07
**Coverage**: 100%

## 1. Scope

**Classification**: Medium
**Rationale**: Changes are concentrated in prompt/instruction files (roundtable-analyst.md, ANTIGRAVITY.md, 6 topic files) with no new scripts or runtime code. However, the deprecation of `--light` flag touches orchestrator wiring in isdlc.md, three-verb-utils.cjs, and workflow-init paths.

## 2. Keyword Hits

| Keyword | Files Found | Key Locations |
|---------|-------------|---------------|
| `depth_guidance` | 7 | roundtable-analyst.md, 6 topic files |
| `analysis_depth` | 0 | Does not exist yet |
| `--light` / `light_flag` | 5 | isdlc.md, ANTIGRAVITY.md, three-verb-utils.cjs, workflow-completion-enforcer.cjs, common.cjs |
| `effective_intensity` | 10 | isdlc.md, common.cjs, three-verb-utils.cjs, hooks |
| `sizing_decision` | 10 | isdlc.md, common.cjs, roundtable-analyst.md, hooks |
| `confidence` | 3 | roundtable-analyst.md, persona files |
| `confirmation` | 1 | roundtable-analyst.md (Section 2.5) |

## 3. File Count Breakdown

| Category | Count | Notes |
|----------|-------|-------|
| Prompt/instruction files (primary changes) | 8 | roundtable-analyst.md, ANTIGRAVITY.md, 6 topic files |
| Orchestrator wiring (--light deprecation) | 3 | isdlc.md, three-verb-utils.cjs, common.cjs |
| Supporting hooks/tests | 4 | sizing-related test files, performance-budget |
| Total estimated | ~15 | |

## 4. Modules Affected

- **Roundtable analyst agent** (primary): depth sensing, assumption tracking, confirmation flow
- **Topic files** (6 files): depth_guidance restructuring from prescriptive to calibration
- **Orchestrator** (isdlc.md): --light flag deprecation, scope recommendation consumption
- **Three-verb utilities**: sizing decision flow changes
- **ANTIGRAVITY template**: analyze protocol depth detection removal
