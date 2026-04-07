# Architecture Summary: REQ-GH-238

Adapter-level worker pool (Option A — transparent to callers). ADR-001: worker_threads at adapter level, crash recovery, clean shutdown. ADR-002: provider-agnostic device passthrough via Transformers.js pipeline() API — supports CoreML, CUDA, DirectML, ROCm, Metal, CPU. ADR-003: config-driven with auto-detection defaults, auto dtype (fp16 on GPU, q8 on CPU). Zero new dependencies — worker_threads built-in, device/session_options pass through existing API.
