# Create project skill category directory structure and manifest registration

**Source:** GitHub Issue #89
**Labels:** enhancement, Skills management

## Summary

Update the external skills manifest schema and registration logic to support project skills alongside user-added and skills.sh skills in a unified system.

## Updated Design

Project skills live in `.claude/skills/external/` alongside all other external skills. No new directory category needed. Skills are distinguished by a `source` field in the manifest.

### Source Field Addition

Add `source` field to manifest skill entries:

```json
{
  "skills": [
    {
      "name": "react-hooks-guide",
      "source": "skills.sh",
      "file": "react-hooks-guide.md",
      ...
    },
    {
      "name": "project-architecture",
      "source": "discover",
      "file": "project-architecture.md",
      ...
    },
    {
      "name": "my-custom-patterns",
      "source": "user",
      "file": "my-custom-patterns.md",
      ...
    }
  ]
}
```

| Source | Set By | Overwritten By |
|--------|---------|----------------|
| `"discover"` | Discover distillation step | Next discover run (idempotent) |
| `"skills.sh"` | skills-researcher (D4) | Next discover run |
| `"user"` | `/isdlc skill add` | Only by user (`skill remove` + `skill add`) |

### Idempotent Update Logic

When discover writes skills with `source: "discover"`:
1. Filter existing manifest entries: remove all entries with `source: "discover"`
2. Add new discover-sourced entries
3. Preserve entries with `source: "user"` and `source: "skills.sh"` untouched

When skills-researcher writes skills with `source: "skills.sh"`:
1. Filter existing manifest entries: remove all entries with `source: "skills.sh"`
2. Add new skills.sh entries
3. Preserve `"user"` and `"discover"` entries

### Backward Compatibility

Existing manifest entries without a `source` field are treated as `"user"` (safe default — never overwritten by discover).

### Cache Rebuild

After any manifest modification (add, remove, wire, discover), call `rebuildSkillCache()` to regenerate `.isdlc/skill-cache.md` for SessionStart injection (#91).

## Depends On

- #86 (manifest cleanup — clean state before adding source field)

## Files

- `src/claude/hooks/lib/common.cjs` (`writeExternalManifest`, `loadExternalManifest` — handle source field)
- `docs/isdlc/external-skills-manifest.json` (schema update)
- `src/claude/commands/isdlc.md` (skill add/remove handlers — set source: "user")
- `src/claude/agents/discover-orchestrator.md` (set source: "discover")
- `src/claude/agents/discover/skills-researcher.md` (set source: "skills.sh")

## Acceptance Criteria

- [ ] Manifest entries include `source` field ("discover", "skills.sh", "user")
- [ ] Discover overwrites only `source: "discover"` entries on re-run
- [ ] skills-researcher overwrites only `source: "skills.sh"` entries on re-run
- [ ] User-added skills are never overwritten by discover
- [ ] Entries without `source` field default to `"user"` (backward compat)
- [ ] `rebuildSkillCache()` called after every manifest modification
- [ ] Tests cover source-based filtering and idempotent updates
