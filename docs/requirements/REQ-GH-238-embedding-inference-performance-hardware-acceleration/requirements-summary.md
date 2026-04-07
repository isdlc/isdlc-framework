# Requirements Summary: REQ-GH-238

6 functional requirements (4 Must Have, 2 Should Have). Core: worker thread pool for multi-core parallelism (FR-001), batched inference within workers (FR-002), cross-platform hardware acceleration with auto-detect and CPU fallback (FR-003 — CoreML, CUDA, DirectML, ROCm), config-driven with auto dtype fp16/q8 (FR-004). Enhancements: worker-aware progress reporting (FR-005), CLI flag overrides (FR-006). 26 acceptance criteria total. NFR target: ~20K chunks in ≤10 min on M4.
