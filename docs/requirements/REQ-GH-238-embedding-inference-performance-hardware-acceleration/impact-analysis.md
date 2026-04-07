# Impact Analysis: REQ-GH-238

Embedding inference performance: hardware acceleration + parallelism

## 1. Blast Radius

### Tier 1: Direct Changes

| File | Module | Change Type | Traces |
|------|--------|------------|--------|
| `lib/embedding/engine/worker-pool.js` | engine | NEW | FR-001, FR-005 |
| `lib/embedding/engine/embedding-worker.js` | engine | NEW | FR-001, FR-002 |
| `lib/embedding/engine/device-detector.js` | engine | NEW | FR-003, FR-004 |
| `lib/embedding/engine/jina-code-adapter.js` | engine | MODIFY | FR-001, FR-003, FR-004 |
| `lib/embedding/engine/index.js` | engine | MODIFY | FR-004 |
| `bin/isdlc-embedding.js` | cli | MODIFY | FR-006 |

### Tier 2: Transitive Impact

| File | Module | Impact | Change Needed |
|------|--------|--------|---------------|
| `lib/embedding/engine/worker-pool.test.js` | engine | NEW test file | NEW |
| `lib/embedding/engine/embedding-worker.test.js` | engine | NEW test file | NEW |
| `lib/embedding/engine/device-detector.test.js` | engine | NEW test file | NEW |
| `lib/embedding/engine/jina-code-adapter.test.js` | engine | Update for new config params | MODIFY |
| `lib/embedding/engine/index.test.js` | engine | Update for config passthrough | MODIFY |

### Tier 3: Side Effects

| Area | Potential Impact | Risk Level |
|------|-----------------|------------|
| `.isdlc/config.json` | New embeddings.* fields | Low |
| Memory usage | N workers x model size | Medium |
| Process cleanup | Orphan workers on crash | Medium |

## 2. Entry Points

**Recommended start**: FR-003 (device-detector, standalone) + FR-001 (worker-pool, standalone) → FR-002 (batched inference in worker) → FR-004 (config wiring) → adapter integration → FR-006 (CLI) → FR-005 (progress)

## 3. Implementation Order

| Order | FRs | Description | Risk | Parallel | Depends On |
|-------|-----|-------------|------|----------|------------|
| 1 | FR-003 | Create device-detector.js | Low | Yes | — |
| 1 | FR-001 | Create worker-pool.js | Medium | Yes | — |
| 2 | FR-002 | Create embedding-worker.js with batched inference | Medium | No | FR-001 |
| 3 | FR-001,003 | Update adapter for pool + device passthrough | Medium | No | FR-001, FR-003 |
| 4 | FR-004 | Config schema + engine config reading | Low | Yes | FR-003 |
| 5 | FR-006 | CLI flag parsing | Low | No | FR-004 |
| 6 | FR-005 | Progress reporting | Low | No | FR-001 |

## 4. Risk Zones

| ID | Risk | Area | Likelihood | Impact | Mitigation |
|----|------|------|-----------|--------|------------|
| R1 | Transformers.js EP routing untested | device-detector | Medium | High | Test each EP, two-tier fallback |
| R2 | Worker memory exceeds budget | worker-pool | Medium | Medium | Auto-size based on available memory |
| R3 | Batched inference not supported | embedding-worker | Medium | Low | Sequential fallback within worker |
| R4 | Worker orphans on Ctrl+C | worker-pool | Low | Medium | SIGINT/SIGTERM handlers, force kill timeout |

## 5. Summary

| Metric | Count |
|--------|-------|
| Direct modifications | 3 |
| New files | 3 |
| Transitive modifications | 2 |
| New test files | 3 |
| **Total affected** | **~11** |

**Overall risk**: Medium. Worker threads are well-understood but hardware EP detection needs platform-specific testing.
**Go/No-go**: Go.
