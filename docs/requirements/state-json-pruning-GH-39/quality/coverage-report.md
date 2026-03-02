# Coverage Report: State.json Pruning (GH-39)

**Date**: 2026-02-21
**Tool**: Manual analysis (no coverage tooling configured)

---

## New Code Coverage

| File | Functions Added/Modified | Tests | Estimated Line Coverage |
|------|--------------------------|-------|------------------------|
| common.cjs | clearTransientFields | 11 (CTF-01 to CTF-11) | >95% |
| common.cjs | resolveArchivePath | 3 (RAP-01, RAP-04, RAP-05) | >90% |
| common.cjs | appendToArchive | 12 (ATA-01 to ATA-13) | >95% |
| common.cjs | seedArchiveFromHistory | 11 (SAH-01 to SAH-11) | >90% |
| common.cjs | _deriveOutcome (internal) | 3 (SAH-08, SAH-09, INT-01) | 100% |
| common.cjs | _compactPhaseSnapshots (internal) | 2 (SAH-10, INT-01) | 100% |
| common.cjs | Default updates (pruneSkillUsageLog, pruneHistory) | 6 (PF-04, PF-06, PF-12, PF-15) | 100% |
| workflow-completion-enforcer.cjs | Archive integration | 10 (ENF-01 to ENF-10) | >90% |

## Integration Coverage

| Scenario | Test IDs | Coverage |
|----------|----------|----------|
| Full prune + clear sequence | INT-01, INT-02, INT-03 | All prune functions + clearTransientFields in sequence |
| Archive-first ordering | INT-05, INT-06 | Verify archive captures pre-prune data |
| Idempotency | INT-02, INT-07 | Double-call produces same result |
| Error isolation | INT-04, INT-08 | Prune error does not block clear; archive error does not block prune |
| Performance (NFR) | INT-09, INT-11 | p95 prune < 50ms, p95 archive append < 100ms |
| Size budget (NFR) | INT-10 | Pruned state < 50 KB |
| Monorepo isolation | INT-12 | Archives in separate dirs do not cross-contaminate |

## Subprocess Coverage

| Scenario | Test IDs | Coverage |
|----------|----------|----------|
| Transient field clearing | ENF-01 | Full enforcer subprocess clears transient fields |
| Retention limits | ENF-02 | skill_usage_log capped at 50 |
| Archive creation (merged) | ENF-03 | Creates archive with outcome=merged |
| Archive creation (cancelled) | ENF-04 | Creates archive with outcome=cancelled |
| Archive null reason | ENF-05 | Completed workflow has null reason |
| Error resilience | ENF-06 | State pruned even when archive unwritable |
| Guard: already has snapshots | ENF-07 | Skips remediation when entry complete |
| Guard: stale entry | ENF-08 | Skips entries > 2 min old |
| Multi-key index | ENF-09 | Archive index has source_id and slug keys |
| Full flow | ENF-10 | Self-heal + prune + clear + archive + write |

## Estimated Overall Coverage of New Code: >90%
