# Embedding inference performance: hardware acceleration + parallelism on Apple Silicon

**Source**: GitHub Issue #238
**Type**: Enhancement
**Parent**: #237 (Jina v2 adapter)

## Problem

Embedding generation on Apple Silicon (M4) takes ~55 minutes for ~20K chunks. The Jina v2 adapter (via Transformers.js) runs on ONNX Runtime's CPU backend by default — the M4's Neural Engine (16-core ANE), Metal GPU, and multi-core CPU are all sitting idle.

## Current State

- **Model**: jinaai/jina-embeddings-v2-base-code (q8, 162MB)
- **Runtime**: @huggingface/transformers v4 -> onnxruntime-node (CPU backend)
- **Performance**: ~170ms/chunk, single-threaded, ~55 min for 19,792 chunks
- **Hardware**: M4 chip with 10-12 CPU cores, 16-core ANE, Metal GPU — none utilized

## Proposed Improvements

### 1. Worker Thread Parallelism (quickest win)
- Spawn N worker threads (e.g., 4-6 on M4), each with its own ONNX session
- Partition chunk batches across workers
- Expected: 4-6x speedup -> ~10-14 min
- No model quality change, no new dependencies

### 2. Batch Size Tuning
- Current batch size is 32 but texts are processed sequentially within the batch
- Investigate true batched inference (padding + single forward pass for multiple texts)
- Expected: 2-3x speedup on top of parallelism

### 3. CoreML Execution Provider (Apple Neural Engine)
- Use onnxruntime-node directly with executionProviders: ['coreml']
- Routes inference through Apple's ANE/GPU hardware
- Requires bypassing Transformers.js pipeline() API or contributing the option upstream
- Expected: 5-10x speedup for int8/fp16 inference
- Tradeoff: more code, Apple-only codepath

### 4. Metal GPU Backend
- Alternative to CoreML — use Metal directly via ONNX Runtime
- Similar performance characteristics to CoreML on Apple Silicon
- May be easier to configure than CoreML for some model architectures

## Acceptance Criteria

- AC-001: Given Apple Silicon (M4), when embeddings are generated for a ~4000 file project, then generation completes within 10 minutes
- AC-002: Given worker thread parallelism is enabled, when generation runs, then CPU utilization exceeds 200% (multi-core)
- AC-003: Given CoreML/Metal is available, when the adapter initializes, then it uses hardware acceleration with CPU as fallback
- AC-004: Given a non-Apple platform, when the adapter initializes, then it falls back to CPU gracefully (Article X)

## Complexity

Medium-Large. Worker threads are straightforward; CoreML/Metal integration requires research into onnxruntime-node provider configuration.
