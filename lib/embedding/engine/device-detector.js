/**
 * Device Detector -- auto-detect platform and available hardware acceleration.
 *
 * Selects the optimal ONNX Runtime execution provider based on the current
 * platform, GPU availability, and user configuration. Detection is synchronous
 * where possible (< 100ms) and uses only built-in Node.js modules.
 *
 * REQ-GH-238 / FR-003 (AC-003-01..AC-003-09), FR-004 (AC-004-07)
 * Article III: Security by Design — no shell execution, only file existence checks
 * Article V: Simplicity First — minimal detection logic, clear fallback chain
 * Article X: Fail-Safe Defaults — always falls back to CPU on any detection error
 *
 * @module lib/embedding/engine/device-detector
 */

import { existsSync } from 'node:fs';
import { cpus, totalmem } from 'node:os';
import { readCachedCalibration, computeFingerprint } from './memory-calibrator.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Valid device strings accepted by the module. */
export const VALID_DEVICES = ['auto', 'cpu', 'coreml', 'cuda', 'directml', 'rocm'];

/** Valid dtype strings accepted by the module. */
export const VALID_DTYPES = ['auto', 'fp16', 'fp32', 'q8'];

/** Default configuration values. */
export const DEFAULTS = Object.freeze({
  device: 'auto',
  dtype: 'auto',
  parallelism: 'auto',
  batch_size: 32,
  session_options: {},
  max_memory_gb: null,
});

/**
 * Estimated memory footprint per worker thread (GB) by device type.
 * Based on real-world measurements of Jina v2 with ONNX Runtime.
 * CoreML is highest due to model conversion + Neural Engine buffers.
 */
export const WORKER_MEMORY_ESTIMATE_GB = Object.freeze({
  coreml: 6,
  cuda: 4,
  rocm: 4,
  directml: 4,
  cpu: 2,
});

/** Hard cap on auto-resolved parallelism — diminishing returns beyond this. */
export const PARALLELISM_HARD_CAP = 4;

/** Minimum memory (GB) reserved for OS, main process, and other applications. */
export const SYSTEM_RESERVED_GB = 8;

/** Minimum number of batches that must exist per worker for workload-based
 *  parallelism to justify spawning that worker. REQ-GH-248 FR-006 / AC-006-04.
 *
 *  A value of 2 means: spawning N workers only pays back when there are at
 *  least 2×N batches to process. This is the "workload floor" — it caps
 *  auto-parallelism on small workloads so the pool does not spawn more
 *  workers than there is work to do.
 */
export const MIN_BATCHES_PER_WORKER = 2;

/**
 * REQ-GH-248 FR-006 / AC-006-04: compute the workload floor.
 * Floor = ceil(chunkCount / batchSize / MIN_BATCHES_PER_WORKER).
 *
 * Returns 0 for a zero workload (no work → no workers needed). Returns at
 * least 1 for any positive workload. The result monotonically increases
 * as the workload grows.
 *
 * @param {number} workloadSize - number of texts to embed
 * @param {number} batchSize - texts per inference batch
 * @returns {number} workload floor (>= 0)
 */
export function computeWorkloadFloor(workloadSize, batchSize) {
  if (!Number.isFinite(workloadSize) || workloadSize <= 0) return 0;
  const batches = Math.ceil(workloadSize / batchSize);
  return Math.max(1, Math.ceil(batches / MIN_BATCHES_PER_WORKER));
}

/**
 * REQ-GH-248 FR-008 / AC-008-01: single source of truth for the
 * parallelism-math decision used by BOTH `autoParallelism()` in this
 * module AND `resolvePoolSize()` in worker-pool.js.
 *
 * Computes `min(memoryCap, cpuCap, hardCap [, workloadFloor])` — the
 * smallest cap wins. If `workloadFloor` is > 0 and `auto` is true, it is
 * an additional upper bound; otherwise it is ignored. The minimum
 * possible return value is 1 (pool never has zero workers in the "auto"
 * path — degenerate zero-workload callers are expected to skip pool
 * construction entirely).
 *
 * @param {Object} params
 * @param {number} params.memoryCap - max parallelism the memory budget allows
 * @param {number} params.cpuCap - max parallelism the CPU count allows
 * @param {number} [params.hardCap=PARALLELISM_HARD_CAP] - hard ceiling
 * @param {number} [params.workloadFloor=0] - workload-based cap (0 = ignore)
 * @returns {number} effective parallelism (>= 1)
 */
export function computeEffectiveParallelism({
  memoryCap,
  cpuCap,
  hardCap = PARALLELISM_HARD_CAP,
  workloadFloor = 0,
}) {
  const caps = [memoryCap, cpuCap, hardCap];
  if (workloadFloor > 0) caps.push(workloadFloor);
  const effective = Math.min(...caps);
  return Math.max(1, Math.floor(effective));
}

// ---------------------------------------------------------------------------
// Platform inspection helpers (injectable for testing)
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} PlatformInfo
 * @property {string} platform - process.platform equivalent
 * @property {string} arch - process.arch equivalent
 * @property {function(string): boolean} pathExists - fs.existsSync equivalent
 * @property {number} [totalMem] - os.totalmem() equivalent (bytes), for memory-aware parallelism
 * @property {number} [cpuCount] - os.cpus().length equivalent, for parallelism calculation
 */

/**
 * Build a PlatformInfo from the current runtime environment.
 * @returns {PlatformInfo}
 */
function currentPlatform() {
  return {
    platform: process.platform,
    arch: process.arch,
    pathExists: existsSync,
    totalMem: totalmem(),
    cpuCount: cpus().length,
  };
}

// ---------------------------------------------------------------------------
// detectDevice()
// ---------------------------------------------------------------------------

/**
 * Auto-detect the best execution provider for the current hardware.
 *
 * Detection order:
 *   1. macOS ARM (M-series) -> 'coreml'  (AC-003-01)
 *   2. Linux NVIDIA GPU     -> 'cuda'    (AC-003-02)
 *   3. Linux AMD GPU (ROCm) -> 'rocm'    (AC-003-08)
 *   4. Windows              -> 'directml' (AC-003-03)
 *   5. Fallback             -> 'cpu'      (AC-003-04)
 *
 * @param {PlatformInfo} [env] - Override platform info for testing
 * @returns {{ device: string, reason: string }}
 */
export function detectDevice(env) {
  const { platform, arch, pathExists } = env || currentPlatform();

  // macOS ARM (M-series) -> CoreML (AC-003-01)
  if (platform === 'darwin' && arch === 'arm64') {
    return { device: 'coreml', reason: 'macOS ARM detected' };
  }

  // macOS x86 (Intel) -> CPU only (AC-003-04)
  if (platform === 'darwin') {
    return { device: 'cpu', reason: 'macOS x86 — CoreML requires ARM' };
  }

  // Linux: check for GPUs
  if (platform === 'linux') {
    try {
      // NVIDIA GPU (AC-003-02)
      if (pathExists('/proc/driver/nvidia/version')) {
        return { device: 'cuda', reason: 'NVIDIA GPU detected' };
      }
    } catch {
      // ERR-DEV-002: GPU detection failed, continue to next check
    }

    try {
      // AMD ROCm (AC-003-08)
      if (pathExists('/sys/class/kfd')) {
        return { device: 'rocm', reason: 'AMD GPU detected' };
      }
    } catch {
      // ERR-DEV-002: GPU detection failed, continue to fallback
    }

    // No GPU detected on Linux (AC-003-04)
    return { device: 'cpu', reason: 'No GPU detected' };
  }

  // Windows -> DirectML (AC-003-03)
  if (platform === 'win32') {
    return { device: 'directml', reason: 'Windows platform detected' };
  }

  // Unknown platform -> CPU fallback (AC-003-04)
  return { device: 'cpu', reason: 'No GPU detected' };
}

// ---------------------------------------------------------------------------
// detectOptimalDtype()
// ---------------------------------------------------------------------------

/**
 * Select the optimal model dtype for the given device.
 *
 * Hardware-accelerated devices benefit from fp16 (half precision),
 * while CPU inference uses q8 (8-bit quantized) for speed. (AC-004-07)
 *
 * @param {string} device - The resolved device string
 * @returns {string} 'fp16' for hardware-accelerated, 'q8' for CPU
 */
export function detectOptimalDtype(device) {
  if (device === 'cpu') {
    return 'q8';
  }
  return 'fp16';
}

// ---------------------------------------------------------------------------
// validateDevice() -- explicit device validation with fallback
// ---------------------------------------------------------------------------

/**
 * Validate an explicitly requested device against the current platform.
 * Returns the device if available, or falls back to CPU with warnings.
 *
 * @param {string} device - The requested device string
 * @param {PlatformInfo} [env] - Override platform info for testing
 * @returns {{ device: string, reason: string, warnings: string[] }}
 */
export function validateDevice(device, env) {
  const { platform, arch, pathExists } = env || currentPlatform();
  const warnings = [];

  // CPU is always valid on any platform (AC-003-06)
  if (device === 'cpu') {
    return { device: 'cpu', reason: 'Explicit CPU requested', warnings };
  }

  // Auto delegates to detectDevice
  if (device === 'auto') {
    const result = detectDevice(env);
    return { ...result, warnings };
  }

  // CoreML: macOS ARM only (AC-003-05)
  if (device === 'coreml') {
    if (platform === 'darwin' && arch === 'arm64') {
      return { device: 'coreml', reason: 'CoreML available on macOS ARM', warnings };
    }
    const msg = platform === 'darwin'
      ? 'CoreML requires Apple Silicon (ARM); this Mac uses x86. Falling back to CPU. (ERR-DEV-001)'
      : `CoreML is not available on ${platform}. Falling back to CPU. (ERR-DEV-001)`;
    warnings.push(msg);
    return { device: 'cpu', reason: msg, warnings };
  }

  // CUDA: Linux with NVIDIA only (AC-003-07)
  if (device === 'cuda') {
    let nvidiaAvailable = false;
    try {
      nvidiaAvailable = platform === 'linux' && pathExists('/proc/driver/nvidia/version');
    } catch {
      // ERR-DEV-002: detection failed
    }
    if (nvidiaAvailable) {
      return { device: 'cuda', reason: 'NVIDIA GPU available for CUDA', warnings };
    }
    const msg = 'CUDA is not available (no NVIDIA GPU detected). Falling back to CPU. (ERR-DEV-001)';
    warnings.push(msg);
    return { device: 'cpu', reason: msg, warnings };
  }

  // DirectML: Windows only (AC-003-05)
  if (device === 'directml') {
    if (platform === 'win32') {
      return { device: 'directml', reason: 'DirectML available on Windows', warnings };
    }
    const msg = `DirectML is Windows-only. Falling back to CPU. (ERR-DEV-001)`;
    warnings.push(msg);
    return { device: 'cpu', reason: msg, warnings };
  }

  // ROCm: Linux with AMD only (AC-003-09)
  if (device === 'rocm') {
    let rocmAvailable = false;
    try {
      rocmAvailable = platform === 'linux' && pathExists('/sys/class/kfd');
    } catch {
      // ERR-DEV-002: detection failed
    }
    if (rocmAvailable) {
      return { device: 'rocm', reason: 'AMD GPU available for ROCm', warnings };
    }
    const msg = 'ROCm is not available (no AMD GPU detected). Falling back to CPU. (ERR-DEV-001)';
    warnings.push(msg);
    return { device: 'cpu', reason: msg, warnings };
  }

  // Unrecognized device string (ERR-DEV-003)
  const validList = VALID_DEVICES.filter(d => d !== 'auto').join(', ');
  const msg = `Unrecognized device "${device}". Valid options: ${validList}. Falling back to CPU. (ERR-DEV-003)`;
  warnings.push(msg);
  return { device: 'cpu', reason: msg, warnings };
}

// ---------------------------------------------------------------------------
// resolvePerWorkerMemGB() -- prefer calibrated value, fall back to hardcoded
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} PerWorkerMemResult
 * @property {'calibrated'|'hardcoded'} source
 * @property {number} value        Per-worker memory estimate in GB
 * @property {string} [measuredAt] ISO timestamp (only when source='calibrated')
 */

/**
 * Resolve the per-worker memory cost (GB), preferring a cached calibration
 * over the hardcoded WORKER_MEMORY_ESTIMATE_GB constants.
 *
 * This function only READS the calibration cache. It never triggers
 * calibration (that is the CLI's job in bin/isdlc-embedding.js), avoiding
 * the circular "device-detector -> worker-pool -> device-detector" bootstrap.
 *
 * REQ-GH-239 / FR-003 (calibration cache read), FR-009 (configurability
 * preserved — user max_memory_gb still caps total memory), NFR-001 (memory
 * respect).
 *
 * @param {{device:string, dtype?:string, model?:string}} config
 * @param {string} [projectRoot=process.cwd()]
 * @returns {PerWorkerMemResult}
 */
export function resolvePerWorkerMemGB(config, projectRoot = process.cwd()) {
  try {
    const fingerprint = computeFingerprint(config || {});
    const cached = readCachedCalibration(projectRoot, fingerprint);
    if (cached && Number.isFinite(cached.perWorkerMemGB) && cached.perWorkerMemGB > 0) {
      // eslint-disable-next-line no-console
      console.log(
        `[device-detector] perWorkerMemGB = ${cached.perWorkerMemGB.toFixed(2)} GB (calibrated, measured ${cached.measuredAt})`
      );
      return {
        source: 'calibrated',
        value: cached.perWorkerMemGB,
        measuredAt: cached.measuredAt,
      };
    }
  } catch {
    // Defence-in-depth: calibration cache read must never break resolution
  }

  const device = config?.device;
  const hardcoded = WORKER_MEMORY_ESTIMATE_GB[device] || WORKER_MEMORY_ESTIMATE_GB.cpu;
  // eslint-disable-next-line no-console
  console.log(
    `[device-detector] perWorkerMemGB = ${hardcoded.toFixed(2)} GB (hardcoded fallback for device=${device ?? 'unknown'})`
  );
  return { source: 'hardcoded', value: hardcoded };
}

// ---------------------------------------------------------------------------
// resolveConfig() -- merge CLI > config > defaults
// ---------------------------------------------------------------------------

/**
 * Resolve a full embedding configuration by merging layers:
 *   CLI overrides > config file values > defaults
 *
 * Resolves all 'auto' values to concrete settings.
 * Validates numeric fields and dtype/device strings.
 *
 * REQ-GH-248 FR-006 / FR-007: the resolver now accepts an optional
 * `workloadSize` in `opts` and returns the resolved `perWorkerMemGB`
 * alongside the other fields. Callers thread these through so the
 * auto-parallelism decision is workload-aware AND the adapter can pass
 * the calibrated per-worker memory value into pool construction.
 *
 * @param {Object} [configValues={}] - Values from config file
 * @param {Object} [cliOverrides={}] - Values from CLI flags
 * @param {PlatformInfo} [env] - Override platform info for testing
 * @param {Object} [opts]
 * @param {string} [opts.projectRoot] - Project root for calibration cache lookup
 * @param {number} [opts.workloadSize] - REQ-GH-248 FR-006: number of texts to embed
 * @param {function} [opts._resolvePerWorkerMemGB] - DI hook for tests
 * @returns {{ device: string, dtype: string, parallelism: number, batch_size: number, session_options: Object, perWorkerMemGB: number, warnings: string[] }}
 */
export function resolveConfig(configValues = {}, cliOverrides = {}, env, opts = {}) {
  const {
    projectRoot = process.cwd(),
    workloadSize,
    _resolvePerWorkerMemGB = resolvePerWorkerMemGB,
  } = opts;
  const warnings = [];

  // Merge: CLI > config > defaults
  const raw = {
    device: cliOverrides.device ?? configValues.device ?? DEFAULTS.device,
    dtype: cliOverrides.dtype ?? configValues.dtype ?? DEFAULTS.dtype,
    parallelism: cliOverrides.parallelism ?? configValues.parallelism ?? DEFAULTS.parallelism,
    batch_size: cliOverrides.batch_size ?? configValues.batch_size ?? DEFAULTS.batch_size,
    session_options: cliOverrides.session_options ?? configValues.session_options ?? DEFAULTS.session_options,
    max_memory_gb: cliOverrides.max_memory_gb ?? configValues.max_memory_gb ?? DEFAULTS.max_memory_gb,
  };

  // Resolve device
  let deviceResult;
  if (raw.device === 'auto') {
    deviceResult = detectDevice(env);
  } else {
    deviceResult = validateDevice(raw.device, env);
  }
  warnings.push(...(deviceResult.warnings || []));
  const device = deviceResult.device;

  // Resolve dtype (AC-004-07, AC-004-08)
  let dtype;
  if (raw.dtype === 'auto') {
    dtype = detectOptimalDtype(device);
  } else if (VALID_DTYPES.includes(raw.dtype)) {
    dtype = raw.dtype; // Explicit override honored (AC-004-08)
  } else {
    // ERR-CFG-002: invalid dtype
    warnings.push(`Invalid dtype "${raw.dtype}". Valid options: ${VALID_DTYPES.join(', ')}. Defaulting to auto.`);
    dtype = detectOptimalDtype(device);
  }

  // Resolve batch_size first so the workload floor can be computed
  // before we resolve parallelism (the floor depends on batch_size).
  let batch_size;
  const parsedBatch = Number(raw.batch_size);
  if (!Number.isFinite(parsedBatch) || parsedBatch < 1 || !Number.isInteger(parsedBatch)) {
    batch_size = DEFAULTS.batch_size;
  } else {
    batch_size = parsedBatch;
  }

  // Resolve perWorkerMemGB once so we can return it to callers
  // (jina-code-adapter passes it through to pool construction — REQ-GH-248
  // FR-007). This replaces the inline lookup in autoParallelism so both
  // code paths see the same value.
  const perWorker = _resolvePerWorkerMemGB(
    { device, dtype, model: configValues.model },
    projectRoot,
  );
  const perWorkerMemGB =
    (perWorker && Number.isFinite(perWorker.value) && perWorker.value > 0)
      ? perWorker.value
      : (WORKER_MEMORY_ESTIMATE_GB[device] || 3);

  // Resolve parallelism (ERR-CFG-001).
  // REQ-GH-248 FR-006/FR-008: workload-aware auto-resolution through the
  // shared `computeEffectiveParallelism` helper. Explicit integer values
  // are warn-but-respect (fix-strategy R2): if the user asks for 8 workers
  // on an 8-chunk workload, they get 8 workers plus a warning recommending
  // "auto".
  let parallelism;
  const autoParallelism = () => {
    const envInfo = env || currentPlatform();
    const cpuCount = envInfo.cpuCount ?? cpus().length;
    const totalMemBytes = envInfo.totalMem ?? totalmem();
    const totalMemGB = totalMemBytes / (1024 ** 3);
    const effectiveMemGB = raw.max_memory_gb != null
      ? Math.min(raw.max_memory_gb, totalMemGB)
      : totalMemGB;
    const maxByCpu = Math.max(1, cpuCount - 1);
    const reservedGB = Math.max(SYSTEM_RESERVED_GB, effectiveMemGB * 0.3);
    const availableGB = effectiveMemGB - reservedGB;
    const maxByMemory = Math.max(1, Math.floor(availableGB / perWorkerMemGB));
    const workloadFloor = Number.isFinite(workloadSize) && workloadSize > 0
      ? computeWorkloadFloor(workloadSize, batch_size)
      : 0;
    return computeEffectiveParallelism({
      memoryCap: maxByMemory,
      cpuCap: maxByCpu,
      hardCap: PARALLELISM_HARD_CAP,
      workloadFloor,
    });
  };

  if (raw.parallelism === 'auto') {
    parallelism = autoParallelism();
  } else {
    const parsed = Number(raw.parallelism);
    if (!Number.isFinite(parsed) || parsed < 1 || !Number.isInteger(parsed)) {
      warnings.push(`Invalid parallelism "${raw.parallelism}". Must be a positive integer or "auto". Defaulting to auto.`);
      parallelism = autoParallelism();
    } else {
      parallelism = parsed;
      // REQ-GH-248 FR-006 AC-006-03 / fix-strategy R2: warn-but-respect.
      // If the user explicitly sets N but the workload floor would cap
      // "auto" at a lower value, log a recommendation but keep N.
      if (Number.isFinite(workloadSize) && workloadSize > 0) {
        const floor = computeWorkloadFloor(workloadSize, batch_size);
        if (floor > 0 && parsed > floor) {
          warnings.push(
            `parallelism ${parsed} is high for workload of ${workloadSize} chunks ` +
            `(workload floor = ${floor}). Consider "auto" for small workloads.`
          );
        }
      }
    }
  }

  return {
    device,
    dtype,
    parallelism,
    batch_size,
    session_options: raw.session_options || {},
    max_memory_gb: raw.max_memory_gb,
    perWorkerMemGB, // REQ-GH-248 FR-007: exposed for adapter pass-through
    warnings,
  };
}
