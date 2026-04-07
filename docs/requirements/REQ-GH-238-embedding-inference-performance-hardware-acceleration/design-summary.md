# Design Summary: REQ-GH-238

## Overview

Three new modules (worker-pool, embedding-worker, device-detector) plus adapter refactor to add multi-core parallelism and cross-platform hardware acceleration to embedding generation. Target: 55 min → ≤10 min on M4.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Parallelism model | Worker threads at adapter level | Transparent to callers, built-in, standard |
| Device routing | Transformers.js passthrough | API already supports device + session_options |
| Dtype strategy | Auto (fp16 on GPU, q8 on CPU) | Matches hardware-native precision |
| Config model | Auto-detect + explicit override | Sensible defaults, power users tune |
| Fallback | Two-tier (requested EP → CPU) | Article X fail-safe |

## Cross-Check Results

- FRs ↔ Modules: all 6 FRs map to specific modules
- Interface contracts: worker message protocol defined, pool API specified
- Architecture ↔ Design: ADR-001/002/003 directly implemented
- Error paths: 9 error codes, all with recovery strategies

## Open Questions

None — all design decisions resolved. Batched inference support (A11) will be verified during implementation with sequential fallback.

## Implementation Readiness

**Ready**. Worker-pool and device-detector are standalone modules testable in isolation. Adapter integration follows after both are built.
