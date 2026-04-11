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
// resolveConfig() -- merge CLI > config > defaults
// ---------------------------------------------------------------------------

/**
 * Resolve a full embedding configuration by merging layers:
 *   CLI overrides > config file values > defaults
 *
 * Resolves all 'auto' values to concrete settings.
 * Validates numeric fields and dtype/device strings.
 *
 * @param {Object} [configValues={}] - Values from config file
 * @param {Object} [cliOverrides={}] - Values from CLI flags
 * @param {PlatformInfo} [env] - Override platform info for testing
 * @returns {{ device: string, dtype: string, parallelism: number, batch_size: number, session_options: Object, warnings: string[] }}
 */
export function resolveConfig(configValues = {}, cliOverrides = {}, env) {
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

  // Resolve parallelism (ERR-CFG-001)
  // Memory-aware auto-resolution: caps workers so they don't exhaust system
  // RAM. Each worker loads the full ONNX model; on a 24GB Mac with CoreML
  // workers consuming ~6GB each, naive cpu-count-based sizing caused OOM.
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
    const perWorkerGB = WORKER_MEMORY_ESTIMATE_GB[device] || 3;
    const maxByMemory = Math.max(1, Math.floor(availableGB / perWorkerGB));
    return Math.min(maxByCpu, maxByMemory, PARALLELISM_HARD_CAP);
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
    }
  }

  // Resolve batch_size
  let batch_size;
  const parsedBatch = Number(raw.batch_size);
  if (!Number.isFinite(parsedBatch) || parsedBatch < 1 || !Number.isInteger(parsedBatch)) {
    batch_size = DEFAULTS.batch_size;
  } else {
    batch_size = parsedBatch;
  }

  return {
    device,
    dtype,
    parallelism,
    batch_size,
    session_options: raw.session_options || {},
    max_memory_gb: raw.max_memory_gb,
    warnings,
  };
}
