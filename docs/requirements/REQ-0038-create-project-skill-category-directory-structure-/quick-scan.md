# Quick Scan: Create Project Skill Category Directory Structure and Manifest Registration

**Generated**: 2026-02-24T00:00:00Z
**Feature**: Add project skill category directory structure and manifest registration (GH-89)
**Phase**: 00-quick-scan

---

## Scope Estimate

**Estimated Scope**: Medium
**File Count Estimate**: ~11 files affected
**Confidence**: High

---

## Feature Overview

This feature updates the external skills manifest schema and registration logic to support project skills alongside user-added and skills.sh skills in a unified system.

**Key Requirements**:
- Add `source` field to manifest skill entries ("discover", "skills.sh", "user")
- Idempotent update logic per source type
- Backward compatibility for entries without source field
- Cache rebuild after manifest modifications

---

## Keyword Matches

### Domain Keywords

| Keyword | File Count | Files |
|---------|-----------|-------|
| manifest | 11 | common.cjs, isdlc.md, skill-validator.cjs, log-skill-usage.cjs, skill-manager.md, discover.md, discover-orchestrator.md, skills-researcher.md, + tests |
| external skill | 11 | (same as above) |
| source | 14 | Multiple references to source field in manifest entries |
| category | 1 | SKILL_KEYWORD_MAP in common.cjs |
| skill registration | 9 | isdlc.md, skill-validator.cjs, common.cjs, discover.md, skill-manager.md |

### Technical Keywords

| Keyword | File Count | Files |
|---------|-----------|-------|
| cache rebuild | 3 | rebuild-cache.js, common.cjs, isdlc.md |
| JSON manifest | 4 | common.cjs, skill-validator.cjs, log-skill-usage.cjs, test files |
| writeExternalManifest | 5 | common.cjs (definition), isdlc.md, skill-validator.cjs, skill-manager.md |
| loadExternalManifest | 5 | common.cjs (definition), isdlc.md, skill-validator.cjs, skill-manager.md |

---

## Directly Affected Files

Based on issue description and keyword search:

### Primary Impact (Must Update)

1. **src/claude/hooks/lib/common.cjs** (4260 lines)
   - `loadExternalManifest()` — add source field handling
   - `writeExternalManifest()` — validate source field structure
   - `formatSkillInjectionBlock()` — may use source for routing
   - Lines: ~703, ~961, ~999, ~1013+

2. **src/claude/commands/isdlc.md** (2347 lines)
   - `skill add` handler (FR-001 through FR-009) — set source: "user"
   - `skill remove` handler (FR-007) — handle per-source removal
   - Lines: ~1513, ~1527, ~1541

3. **src/claude/agents/discover-orchestrator.md**
   - Set source: "discover" for project skills from discovery phase

4. **src/claude/agents/discover/skills-researcher.md**
   - Set source: "skills.sh" for external skills from skills.sh

### Secondary Impact (Likely Updates)

5. **src/claude/hooks/skill-validator.cjs**
   - Validate source field presence/values
   - Idempotent update logic per source

6. **src/claude/hooks/log-skill-usage.cjs**
   - Log source information for skill usage tracing

7. **src/claude/agents/skill-manager.md**
   - Manage skills by source type
   - Coordinate manifest updates

8. **src/claude/commands/discover.md**
   - Trigger skill source assignment during discovery

9. **bin/rebuild-cache.js**
   - Cache invalidation after manifest changes

### Test Files (New/Updated)

10. **src/claude/hooks/tests/skill-injection.test.cjs**
11. **src/claude/hooks/tests/test-req-0033-skill-injection-wiring.test.cjs**

### Schema/Config

12. **.isdlc/external-skills-manifest.json** (if exists)
    - Currently referenced as docs/isdlc/external-skills-manifest.json in issue
    - Will need schema update for source field

---

## Relevant Modules & Architecture

From codebase analysis:

- **Skill Manifest System**: `external-skills-manifest.json` → loaded by common.cjs hooks
- **Manifest Path Resolution**: `resolveExternalManifestPath()` in common.cjs (monorepo-aware)
- **Skill Injection**: `inject-session-cache.cjs` consumes manifest for agent context injection
- **Skill Cache**: `rebuild-cache.js` rebuilds session cache after manifest modifications
- **Command Handlers**: `isdlc.md` routes skill add/remove to manifest updates

---

## Dependency Chain

**Depends On**: #86 (Clean up unused manifest entries — `path_lookup` and `skill_paths`)

**Blocking**: None yet (part of initial GH-89 epic)

**Assumption**: GH-86 (manifest cleanup) completes or runs in parallel. This feature should handle backward compatibility for entries without `source` field (defensive coding).

---

## Questions for Requirements Phase

1. **Source Field Default Behavior**: How should legacy manifest entries (pre-source field) be handled on first load? Auto-populate source based on file path/origin detection, or require user confirmation?

2. **Idempotency Scope**: Should "idempotent per source type" mean:
   - Same skill name can exist once per source? (e.g., a "user" version and a "discover" version of same skill)
   - Or only one entry per skill name, with source tag indicating last-writer?

3. **Cache Invalidation**: Should cache rebuild happen:
   - Synchronously in skill add/remove handlers?
   - Asynchronously with warning if it fails?
   - Or deferred until next session start?

4. **Project Skill Discovery**: Does "project skills" (source: "discover") come from:
   - Auto-discovery scan of `src/claude/skills/` directory?
   - Manual registration in discovery phase?
   - Both?

5. **Backward Compatibility Path**: Should the system:
   - Read entries without `source` field and infer source?
   - Reject/warn on entries without `source` field?
   - Auto-upgrade manifest on first write?

---

## Tech Stack Context

From discovery report:

- **Language**: JavaScript (Node.js 18+)
- **Module System**: ESM CLI + CJS hooks (dual-module boundary)
- **Package Format**: npm package CLI
- **Manifest Format**: JSON (currently, possibility of schema expansion)

---

## Quick Scan Metadata

```json
{
  "scan_completed_at": "2026-02-24T00:00:00Z",
  "search_duration_ms": 2500,
  "keywords_searched": 8,
  "files_matched": 11,
  "scope_estimate": "medium",
  "confidence": "high",
  "files_with_direct_impact": 4,
  "files_with_secondary_impact": 5,
  "files_with_test_impact": 2
}
```

---

## Summary

**Scope**: Medium complexity (11 files, cross-module coordination)
**Main Work**: Add `source` field to manifest schema, implement idempotent registration per source, update three agent/command entry points to set source field correctly.
**Risk**: Backward compatibility with existing manifest entries; cache invalidation race conditions.
**Confidence**: High — feature is well-scoped and touches known hot paths (common.cjs manifest functions, isdlc.md handlers).

