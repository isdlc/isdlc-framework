# Fix Strategy — GH-248 (+ GH-249)

**Slug**: REQ-GH-248-calibrator-accuracy-parallelism
**Root cause**: root-cause-analysis.md
**Recommended approach**: A (single coherent PR, commit-ordered)

---

## 1. Approaches Evaluated

### Approach A — Single coherent PR (RECOMMENDED)

All seven changes land as one branch, one PR, seven commits ordered for bisect friendliness.

**Commit order:**

| # | Commit | Rationale for position |
|---|---|---|
| 1 | Add cosine-similarity parity test (pinned fixture corpus, ~100 chunks) against `graphOptimizationLevel: "disabled"` baseline | Safety net — must exist and pass before any default flip |
| 2 | Flip `graphOptimizationLevel` default `"disabled"` → `"all"` in `config-defaults.js` and `embeddings-prompt.js` | Parity test from commit 1 now guards every downstream change |
| 3 | Propagate `session_options` into `calibrationConfig` at `bin/isdlc-embedding.js:542-551`; expand `computeFingerprint()` to hash `session_options` keys | Calibrator now measures the same session production runs (surprise #1 fix) |
| 4 | Rework calibrator: real chunks via `lib/embedding/chunker` sampling (~100 chunks), 200 ms cadence, 20-30 s window, 300 s timeout | Now measures real steady-state cost against real session |
| 5 | Fix `jina-code-adapter.js:151` to pass calibrated value through to pool construction (surprise #2 fix) | Calibrated value flows end-to-end; hardcoded constant is fallback only |
| 6 | Extract `computeEffectiveParallelism({memoryCap, cpuCap, hardCap, workloadFloor})` helper; call from both `autoParallelism()` and `resolvePoolSize()`; dedup constants | One source of truth; eliminates divergence between device-detector and worker-pool paths |
| 7 | Add workload threading: `bin/isdlc-embedding.js` passes `workloadSize: texts.length` down through `engine/index.js` → adapter → `resolveConfig()` | Workload floor `ceil(chunks / batch_size / 2)` applies to auto-parallelism |

**Pros:**
- No intermediate broken state. Every commit leaves the tree in a correct-or-better state.
- Surprise #2 (adapter re-clamp) and the calibrator rework are mutually load-bearing; splitting them would make the intermediate state **worse** than the current state (the adapter would stop capping at 6 GB and use the uncorrected 1.1 GB calibration → more workers → more OOM).
- Coherent review context — reviewer sees the whole fix together.
- Single revert if needed.

**Cons:**
- Review surface is ~7 files + tests. Medium, not huge. Manageable given the commit-ordered bisect.

**Files touched:**
- `lib/embedding/engine/memory-calibrator.js`
- `lib/embedding/engine/device-detector.js`
- `lib/embedding/engine/worker-pool.js`
- `lib/embedding/engine/jina-code-adapter.js`
- `lib/embedding/engine/index.js`
- `bin/isdlc-embedding.js`
- `src/core/config/config-defaults.js`
- `lib/install/embeddings-prompt.js`
- `docs/isdlc/config-reference.md`
- Test files (see §4)
- NEW: `lib/embedding/engine/graph-optimization-parity.test.js` + `lib/embedding/engine/fixtures/parity-corpus/`

### Approach B — Three sequential PRs (REJECTED)

- PR1: parity test + graphOpt flip
- PR2: session_options propagation + fingerprint + adapter re-clamp
- PR3: calibrator rework + workload-aware parallelism + dedup

**Why rejected:** the intermediate states between PRs are strictly worse than today's broken state.

- After PR1, graphOpt is `"all"` but the cached calibration (from the old `"disabled"` fingerprint) is stale; auto-parallelism still uses the wrong number.
- After PR2, adapter stops using the hardcoded 6 GB ceiling and uses the calibrated 1.1 GB instead → **more workers spawn, not fewer** → worse OOM behavior until PR3 lands.
- Any gap between PR2 and PR3 shipping leaves users in a state worse than the current broken state.
- Smaller review surfaces and cleaner bisect do not outweigh the regression risk introduced between PRs.

---

## 2. Recommended Approach: A

Single coherent PR, commit-ordered per the table above. Rationale: internal coupling makes staged landing dangerous; commit-level bisect already provides the granularity benefit that Approach B was trying to buy.

---

## 3. Regression Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **R1**: Graph optimizer produces silently corrupted embeddings after re-enable | Medium | High — every semantic search degrades quietly | Cosine-parity test (commit 1) gates commit 2; cos sim ≥ 0.9999 per vector on pinned corpus. `"disabled"` remains a user escape hatch. |
| **R2**: Workload floor unexpectedly caps explicit `parallelism: N` users | Low | Medium — user asks for 8, gets 2 | Apply workload floor ONLY to `parallelism: "auto"`. Explicit integer values log a warning but are respected. |
| **R3**: 300 s timeout masks genuinely stuck calibration | Low | Low | Hard ceiling retained (just raised); log on hit; fallback to hardcoded `WORKER_MEMORY_ESTIMATE_GB` still works as before. |
| **R4**: Fingerprint change invalidates existing caches on upgrade | Certain | Low | Users pay one 20-30 s recalibration on first post-upgrade full generation. Log: `"[calibrate] fingerprint changed, recalibrating"`. |
| **R5**: Sampling 100 chunks from tiny projects with fewer chunks available | Medium | Low | Fall back to all available chunks (min 20); below 20 fall back to synthetic with warning. |
| **R6**: Calibration cache pollution from CoreML compiled-model cache | Low | Low | Calibration cache prevents repeat runs across full-gen invocations within a project lifecycle. |
| **R7**: Existing users with explicit `graphOptimizationLevel: "disabled"` in `.isdlc/config.json` don't benefit from the fix | Certain | Low | Release notes explain how to benefit (remove the explicit override). Escape hatch is intentional — users who set it explicitly chose that behavior. |
| **R8**: Upstream `SimplifiedLayerNormFusion` bug still present in pinned ONNX Runtime version | Low | High — parity test fails | If parity test fails on upgrade: revert commit 2 (keep `"disabled"` default); still ship commits 3-7 (calibrator + workload-aware fixes net-positive even without the default flip). |

---

## 4. Test Gaps and New Tests

### Gaps in current test coverage

Current tests mock the worker pool entirely, so they cannot catch any of the root-cause symptoms:
- No test exercises `session_options` propagation through calibration
- No test covers workload-aware pool sizing (feature doesn't exist yet)
- No guard against silent embedding corruption from graph optimizer changes
- No integration test runs calibrate → auto-parallelism → pool construction → real inference end-to-end
- No test catches the "calibration cache absent → fallback is safer than calibration" anomaly
- No test catches the "adapter silently re-clamps with hardcoded value" bug (surprise #2)

### New tests to add

| Test file | Scope |
|---|---|
| `lib/embedding/engine/graph-optimization-parity.test.js` (NEW) | Cosine similarity ≥ 0.9999 per vector between `"disabled"` and `"all"` on pinned fixture corpus (~100 real chunks) |
| `lib/embedding/engine/fixtures/parity-corpus/` (NEW) | Checked-in corpus: ~100 real multi-language chunks (JS/TS/Py/Go/Rust/MD, length distribution 200-2000 chars) |
| `memory-calibrator.test.js` additions | session_options propagation; fingerprint expansion; 200 ms sampling cadence; steady-state window; sample provider injection; real-chunk fallback to synthetic on <20 chunks |
| `device-detector.test.js` additions | Workload-aware `autoParallelism()`: small workload clamps below memory ceiling; large workload hits ceiling; `"auto"` vs explicit integer behavior divergence |
| `worker-pool.test.js` additions | Workload-aware `resolvePoolSize()`; helper extraction regression; constants dedup |
| `jina-code-adapter.test.js` additions | Given known calibrated value, pool is built with that value (not hardcoded); fallback to hardcoded only when calibration returns null |
| NEW end-to-end integration test | Calibrate (with injected session_options) → check fingerprint → read calibration → autoParallelism → pool construction → embed. Mocks ONNX session for hermeticity. |

---

## 5. Out of Scope

- Differential refresh cache invalidation — deferred by user decision (calibrator doesn't run on diffs).
- Per-project calibration persistence — not needed when calibration runs fresh on every full generation.
- Non-Jina v2 models — generic calibrator changes apply, but `graphOptimizationLevel` default flip is scoped to Jina v2 fp16 specifically.
- Upstream ONNX Runtime source validation — parity test is the correctness gate, not source-level review.
- Server-mode calibration — server doesn't call calibrator today; no changes.

---

## 6. Success Criteria

The fix delivers when:

1. Running `parallelism: "auto"` on the canonical 24 GB Apple Silicon + Jina v2 Base Code fp16 CoreML target produces a pool size of 2-3 workers (not 1, not 14+).
2. Full embedding generation throughput at `parallelism: "auto"` is **≥ 3× the `parallelism: 1` baseline** (NFR-002 from REQ-GH-239).
3. The cosine-similarity parity test passes on the pinned corpus (≥ 0.9999 per vector).
4. Small workloads (2 files / 8 chunks) cap at `parallelism: 1` under `"auto"` even when the memory ceiling is higher.
5. All new and existing tests pass.
6. Explicit user `parallelism: N` values are respected (with warning if above workload floor).
7. Constitutional review (Articles I, II, V, X, XII) passes.
