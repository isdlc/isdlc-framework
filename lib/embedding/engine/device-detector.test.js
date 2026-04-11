/**
 * Tests for Device Detector, Configuration, and CLI Overrides -- FR-003, FR-004, FR-006
 *
 * REQ-GH-238 / FR-003 (AC-003-01..AC-003-09), FR-004 (AC-004-01..AC-004-08),
 *              FR-006 (AC-006-01..AC-006-02)
 * Article II: Test-First Development
 *
 * Module under test: lib/embedding/engine/device-detector.js
 * Interface:
 *   detectDevice(env?) => { device: string, reason: string }
 *   detectOptimalDtype(device) => string
 *   validateDevice(device, env?) => { device, reason, warnings }
 *   resolveConfig(config?, cli?, env?) => { device, dtype, parallelism, batch_size, session_options, warnings }
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectDevice,
  detectOptimalDtype,
  validateDevice,
  resolveConfig,
  VALID_DEVICES,
  VALID_DTYPES,
  DEFAULTS,
  WORKER_MEMORY_ESTIMATE_GB,
  PARALLELISM_HARD_CAP,
  SYSTEM_RESERVED_GB,
} from './device-detector.js';

// ---------------------------------------------------------------------------
// Test environment helpers — injectable PlatformInfo for deterministic tests
// ---------------------------------------------------------------------------

/**
 * Build a mock PlatformInfo object.
 * @param {Object} overrides
 * @param {string} [overrides.platform='linux']
 * @param {string} [overrides.arch='x64']
 * @param {Object} [overrides.paths={}] - Map of path -> boolean for pathExists
 * @returns {import('./device-detector.js').PlatformInfo}
 */
const GB = 1024 ** 3;

function mockEnv({ platform = 'linux', arch = 'x64', paths = {}, totalMem = 32 * GB, cpuCount = 8 } = {}) {
  return {
    platform,
    arch,
    pathExists: (p) => {
      if (p in paths) {
        const val = paths[p];
        if (val instanceof Error) throw val;
        return val;
      }
      return false;
    },
    totalMem,
    cpuCount,
  };
}

// ===========================================================================
// FR-003: Cross-Platform Hardware Acceleration
// ===========================================================================

describe('FR-003: Device Detection (device-detector)', () => {

  // -- detectDevice() -- auto detection ------------------------------------

  describe('detectDevice() -- auto detection', () => {

    it('[P0] AC-003-01: Given macOS ARM (M-series), when device is "auto", then returns { device: "coreml" }', () => {
      // Given: platform = "darwin", arch = "arm64"
      const env = mockEnv({ platform: 'darwin', arch: 'arm64' });
      // When: detectDevice() is called
      const result = detectDevice(env);
      // Then: returns { device: "coreml", reason: "macOS ARM detected" }
      assert.equal(result.device, 'coreml');
      assert.match(result.reason, /macOS ARM/i);
    });

    it('[P0] AC-003-02: Given Linux with NVIDIA GPU, when device is "auto", then returns { device: "cuda" }', () => {
      // Given: platform = "linux", /proc/driver/nvidia/version exists
      const env = mockEnv({ platform: 'linux', paths: { '/proc/driver/nvidia/version': true } });
      // When: detectDevice() is called
      const result = detectDevice(env);
      // Then: returns { device: "cuda", reason: "NVIDIA GPU detected" }
      assert.equal(result.device, 'cuda');
      assert.match(result.reason, /NVIDIA/i);
    });

    it('[P0] AC-003-03: Given Windows with any GPU, when device is "auto", then returns { device: "directml" }', () => {
      // Given: platform = "win32"
      const env = mockEnv({ platform: 'win32' });
      // When: detectDevice() is called
      const result = detectDevice(env);
      // Then: returns { device: "directml", reason: "Windows platform detected" }
      assert.equal(result.device, 'directml');
      assert.match(result.reason, /Windows/i);
    });

    it('[P0] AC-003-04: Given no GPU detected, when device is "auto", then falls back to { device: "cpu" }', () => {
      // Given: platform = "linux", no /proc/driver/nvidia/version, no /sys/class/kfd
      const env = mockEnv({ platform: 'linux' });
      // When: detectDevice() is called
      const result = detectDevice(env);
      // Then: returns { device: "cpu", reason: "No GPU detected" }
      assert.equal(result.device, 'cpu');
      assert.match(result.reason, /No GPU/i);
    });

    it('[P1] AC-003-08: Given Linux with AMD GPU, when device is "auto", then returns { device: "rocm" }', () => {
      // Given: platform = "linux", /sys/class/kfd exists (AMD ROCm)
      const env = mockEnv({ platform: 'linux', paths: { '/sys/class/kfd': true } });
      // When: detectDevice() is called
      const result = detectDevice(env);
      // Then: returns { device: "rocm", reason: "AMD GPU detected" }
      assert.equal(result.device, 'rocm');
      assert.match(result.reason, /AMD/i);
    });

    it('[P1] AC-003-04: Given macOS x86 (Intel Mac), when device is "auto", then falls back to { device: "cpu" }', () => {
      // Given: platform = "darwin", arch = "x64" (Intel)
      const env = mockEnv({ platform: 'darwin', arch: 'x64' });
      // When: detectDevice() is called
      const result = detectDevice(env);
      // Then: returns { device: "cpu", reason: "macOS x86 -- CoreML requires ARM" }
      assert.equal(result.device, 'cpu');
      assert.match(result.reason, /CoreML requires ARM/i);
    });

    it('[P2] AC-003-04: Given GPU detection file check throws (ERR-DEV-002), then falls back to { device: "cpu" }', () => {
      // Given: platform = "linux", reading /proc/driver/nvidia/version throws EACCES
      const env = mockEnv({
        platform: 'linux',
        paths: {
          '/proc/driver/nvidia/version': new Error('EACCES: permission denied'),
          '/sys/class/kfd': new Error('EACCES: permission denied'),
        },
      });
      // When: detectDevice() is called
      const result = detectDevice(env);
      // Then: returns { device: "cpu" } without throwing
      assert.equal(result.device, 'cpu');
      // And: does not throw
    });

  });

  // -- detectDevice() -- explicit device with fallback ---------------------

  describe('detectDevice() -- explicit device with fallback warnings', () => {

    it('[P0] AC-003-06: Given device "cpu", then returns "cpu" regardless of platform', () => {
      // Given: explicit device = "cpu" on macOS ARM with GPU
      const env = mockEnv({ platform: 'darwin', arch: 'arm64' });
      // When: the device is resolved
      const result = validateDevice('cpu', env);
      // Then: uses CPU execution provider
      assert.equal(result.device, 'cpu');
      // And: no warnings
      assert.equal(result.warnings.length, 0);
    });

    it('[P0] AC-003-05: Given device "coreml" on Linux, then warns and falls back to "cpu" (ERR-DEV-001)', () => {
      // Given: explicit device = "coreml", platform = "linux"
      const env = mockEnv({ platform: 'linux' });
      // When: the device is validated
      const result = validateDevice('coreml', env);
      // Then: falls back to { device: "cpu" }
      assert.equal(result.device, 'cpu');
      // And: logs a warning that CoreML is not available on Linux
      assert.equal(result.warnings.length, 1);
      assert.match(result.warnings[0], /CoreML.*not available/i);
      assert.match(result.warnings[0], /ERR-DEV-001/);
    });

    it('[P0] AC-003-07: Given device "cuda" without NVIDIA GPU, then warns and falls back to "cpu" (ERR-DEV-001)', () => {
      // Given: explicit device = "cuda", no /proc/driver/nvidia/version
      const env = mockEnv({ platform: 'linux' });
      // When: the device is validated
      const result = validateDevice('cuda', env);
      // Then: falls back to { device: "cpu" }
      assert.equal(result.device, 'cpu');
      // And: warns that CUDA is not available
      assert.equal(result.warnings.length, 1);
      assert.match(result.warnings[0], /CUDA.*not available/i);
      assert.match(result.warnings[0], /ERR-DEV-001/);
    });

    it('[P0] AC-003-09: Given device "rocm" without ROCm support, then warns and falls back to "cpu" (ERR-DEV-001)', () => {
      // Given: explicit device = "rocm", no /sys/class/kfd
      const env = mockEnv({ platform: 'linux' });
      // When: the device is validated
      const result = validateDevice('rocm', env);
      // Then: falls back to { device: "cpu" }
      assert.equal(result.device, 'cpu');
      // And: warns that ROCm is not available
      assert.equal(result.warnings.length, 1);
      assert.match(result.warnings[0], /ROCm.*not available/i);
      assert.match(result.warnings[0], /ERR-DEV-001/);
    });

    it('[P1] AC-003-05: Given device "directml" on macOS, then warns and falls back to "cpu"', () => {
      // Given: explicit device = "directml", platform = "darwin"
      const env = mockEnv({ platform: 'darwin', arch: 'arm64' });
      // When: the device is validated
      const result = validateDevice('directml', env);
      // Then: falls back to { device: "cpu" }
      assert.equal(result.device, 'cpu');
      // And: warns that DirectML is Windows-only
      assert.equal(result.warnings.length, 1);
      assert.match(result.warnings[0], /DirectML.*Windows/i);
    });

    it('[P2] Given unrecognized device string (ERR-DEV-003), then warns and falls back to "cpu"', () => {
      // Given: explicit device = "tpu" (not a valid option)
      const env = mockEnv({ platform: 'linux' });
      // When: the device is validated
      const result = validateDevice('tpu', env);
      // Then: falls back to { device: "cpu" }
      assert.equal(result.device, 'cpu');
      // And: warns listing valid device options
      assert.equal(result.warnings.length, 1);
      assert.match(result.warnings[0], /Unrecognized device/i);
      assert.match(result.warnings[0], /ERR-DEV-003/);
    });

  });

  // -- detectOptimalDtype() ------------------------------------------------

  describe('detectOptimalDtype(device)', () => {

    it('[P0] AC-004-07: Given device is not "cpu" (hardware accel active), then returns "fp16"', () => {
      // Given: device = "coreml" (or "cuda", "directml", "rocm")
      // When: detectOptimalDtype(device) is called
      // Then: returns "fp16"
      assert.equal(detectOptimalDtype('coreml'), 'fp16');
      assert.equal(detectOptimalDtype('directml'), 'fp16');
    });

    it('[P0] AC-004-07: Given device is "cpu", then returns "q8"', () => {
      // Given: device = "cpu"
      // When: detectOptimalDtype(device) is called
      // Then: returns "q8"
      assert.equal(detectOptimalDtype('cpu'), 'q8');
    });

    it('[P1] AC-004-07: Given device "cuda", then returns "fp16"', () => {
      // Given: device = "cuda"
      // When: detectOptimalDtype("cuda")
      // Then: returns "fp16"
      assert.equal(detectOptimalDtype('cuda'), 'fp16');
    });

    it('[P1] AC-004-07: Given device "rocm", then returns "fp16"', () => {
      // Given: device = "rocm"
      // When: detectOptimalDtype("rocm")
      // Then: returns "fp16"
      assert.equal(detectOptimalDtype('rocm'), 'fp16');
    });

  });

});

// ===========================================================================
// FR-004: Embeddings Configuration
// ===========================================================================

describe('FR-004: Embeddings Configuration', () => {

  // -- Config field parsing ------------------------------------------------

  describe('config field parsing', () => {

    it('[P0] AC-004-01: Given embeddings.parallelism: 6 in config, when adapter initializes, then it spawns 6 workers', () => {
      // Given: config contains { parallelism: 6 }
      const env = mockEnv({ platform: 'linux' });
      // When: resolveConfig reads config
      const result = resolveConfig({ parallelism: 6 }, {}, env);
      // Then: parallelism is 6
      assert.equal(result.parallelism, 6);
    });

    it('[P0] AC-004-02: Given embeddings.device: "cuda" in config, when adapter initializes, then device is "cuda"', () => {
      // Given: config contains { device: "cuda" } and NVIDIA is available
      const env = mockEnv({ platform: 'linux', paths: { '/proc/driver/nvidia/version': true } });
      // When: resolveConfig reads config
      const result = resolveConfig({ device: 'cuda' }, {}, env);
      // Then: device is "cuda"
      assert.equal(result.device, 'cuda');
    });

    it('[P0] AC-004-03: Given embeddings.batch_size: 64, then batches are sized to 64', () => {
      // Given: config has batch_size: 64
      const env = mockEnv({ platform: 'linux' });
      // When: resolveConfig reads config
      const result = resolveConfig({ batch_size: 64 }, {}, env);
      // Then: batch_size is 64
      assert.equal(result.batch_size, 64);
    });

    it('[P0] AC-004-04: Given embeddings.dtype: "fp16", then pipeline loads fp16 model variant', () => {
      // Given: config has dtype: "fp16"
      const env = mockEnv({ platform: 'linux' });
      // When: resolveConfig reads config
      const result = resolveConfig({ dtype: 'fp16' }, {}, env);
      // Then: dtype is "fp16"
      assert.equal(result.dtype, 'fp16');
    });

    it('[P1] AC-004-05: Given embeddings.session_options, then options are passed through to ONNX Runtime', () => {
      // Given: config has session_options: { intraOpNumThreads: 4 }
      const env = mockEnv({ platform: 'linux' });
      const opts = { intraOpNumThreads: 4 };
      // When: resolveConfig reads config
      const result = resolveConfig({ session_options: opts }, {}, env);
      // Then: session_options are forwarded
      assert.deepEqual(result.session_options, { intraOpNumThreads: 4 });
    });

    it('[P0] AC-004-06: Given no config values, then defaults apply (auto parallelism, auto device, batch 32, auto dtype)', () => {
      // Given: no embeddings config
      const env = mockEnv({ platform: 'linux' });
      // When: resolveConfig with empty config
      const result = resolveConfig({}, {}, env);
      // Then: batch_size = 32
      assert.equal(result.batch_size, 32);
      // And: parallelism is auto-resolved to a positive integer
      assert.ok(result.parallelism >= 1);
      // And: device is resolved (not 'auto')
      assert.notEqual(result.device, 'auto');
      // And: dtype is resolved (not 'auto')
      assert.notEqual(result.dtype, 'auto');
    });

    it('[P0] AC-004-08: Given explicit dtype: "q8" with hardware acceleration active, then honors "q8"', () => {
      // Given: device = "coreml" (hardware accel), dtype = "q8" (explicit)
      const env = mockEnv({ platform: 'darwin', arch: 'arm64' });
      // When: resolveConfig with explicit dtype
      const result = resolveConfig({ device: 'auto', dtype: 'q8' }, {}, env);
      // Then: dtype is "q8" (explicit overrides auto logic)
      assert.equal(result.dtype, 'q8');
      // And: device is still coreml (auto-detected)
      assert.equal(result.device, 'coreml');
    });

    it('[P1] AC-004-07: Given dtype: "auto" with CPU device, then uses "q8"', () => {
      // Given: device = "cpu", dtype = "auto"
      const env = mockEnv({ platform: 'linux' });
      // When: resolveConfig resolves dtype
      const result = resolveConfig({ device: 'cpu', dtype: 'auto' }, {}, env);
      // Then: dtype is "q8"
      assert.equal(result.dtype, 'q8');
      assert.equal(result.device, 'cpu');
    });

    it('[P1] AC-004-07: Given dtype: "auto" with hardware accel device, then uses "fp16"', () => {
      // Given: device = "coreml", dtype = "auto"
      const env = mockEnv({ platform: 'darwin', arch: 'arm64' });
      // When: resolveConfig resolves dtype
      const result = resolveConfig({ device: 'auto', dtype: 'auto' }, {}, env);
      // Then: dtype is "fp16" (coreml auto-detected)
      assert.equal(result.dtype, 'fp16');
      assert.equal(result.device, 'coreml');
    });

  });

  // -- Config validation errors --------------------------------------------

  describe('config validation (ERR-CFG-001, ERR-CFG-002)', () => {

    it('[P1] ERR-CFG-001: Given parallelism: -1, then warns and defaults to "auto"', () => {
      // Given: config has parallelism: -1 (invalid)
      const env = mockEnv({ platform: 'linux' });
      // When: resolveConfig reads config
      const result = resolveConfig({ parallelism: -1 }, {}, env);
      // Then: parallelism falls back to auto (positive integer)
      assert.ok(result.parallelism >= 1);
      // And: warning logged
      assert.ok(result.warnings.some(w => /parallelism/i.test(w)));
    });

    it('[P1] ERR-CFG-001: Given parallelism: 0, then warns and defaults to "auto"', () => {
      // Given: config has parallelism: 0 (invalid)
      const env = mockEnv({ platform: 'linux' });
      // When: resolveConfig reads config
      const result = resolveConfig({ parallelism: 0 }, {}, env);
      // Then: parallelism falls back to auto
      assert.ok(result.parallelism >= 1);
      assert.ok(result.warnings.some(w => /parallelism/i.test(w)));
    });

    it('[P1] ERR-CFG-001: Given parallelism: "banana", then warns and defaults to "auto"', () => {
      // Given: config has parallelism: "banana" (non-numeric, not "auto")
      const env = mockEnv({ platform: 'linux' });
      // When: resolveConfig reads config
      const result = resolveConfig({ parallelism: 'banana' }, {}, env);
      // Then: parallelism falls back to auto
      assert.ok(result.parallelism >= 1);
      assert.ok(result.warnings.some(w => /parallelism/i.test(w)));
    });

    it('[P1] ERR-CFG-002: Given dtype: "fp64" (unrecognized), then warns and defaults to "auto"', () => {
      // Given: config has dtype: "fp64" (not a valid option)
      const env = mockEnv({ platform: 'linux' });
      // When: resolveConfig reads config
      const result = resolveConfig({ dtype: 'fp64' }, {}, env);
      // Then: dtype falls back to auto-resolved value (q8 for cpu)
      assert.ok(VALID_DTYPES.includes(result.dtype) && result.dtype !== 'auto');
      // And: warning logged listing valid dtype options
      assert.ok(result.warnings.some(w => /dtype/i.test(w)));
    });

    it('[P2] Given batch_size: 0, then uses default batch_size (32)', () => {
      // Given: config has batch_size: 0
      const env = mockEnv({ platform: 'linux' });
      // When: resolveConfig reads config
      const result = resolveConfig({ batch_size: 0 }, {}, env);
      // Then: uses default batch_size of 32
      assert.equal(result.batch_size, DEFAULTS.batch_size);
    });

    it('[P2] Given batch_size: -5, then uses default batch_size (32)', () => {
      // Given: config has batch_size: -5
      const env = mockEnv({ platform: 'linux' });
      // When: resolveConfig reads config
      const result = resolveConfig({ batch_size: -5 }, {}, env);
      // Then: uses default batch_size of 32
      assert.equal(result.batch_size, DEFAULTS.batch_size);
    });

  });

});

// ===========================================================================
// FR-006: CLI Configuration Override
// ===========================================================================

describe('FR-006: CLI Configuration Override', () => {

  it('[P1] AC-006-01: Given --parallelism 8 on CLI, then it overrides config.json parallelism', () => {
    // Given: config.json has embeddings.parallelism: 4
    // And: CLI flag --parallelism 8 is provided
    const env = mockEnv({ platform: 'linux' });
    // When: config is resolved (CLI > config > defaults)
    const result = resolveConfig({ parallelism: 4 }, { parallelism: 8 }, env);
    // Then: effective parallelism is 8
    assert.equal(result.parallelism, 8);
  });

  it('[P1] AC-006-02: Given --device cpu on CLI, then it forces CPU regardless of config', () => {
    // Given: config.json has embeddings.device: "coreml"
    // And: CLI flag --device cpu is provided
    const env = mockEnv({ platform: 'darwin', arch: 'arm64' });
    // When: config is resolved
    const result = resolveConfig({ device: 'coreml' }, { device: 'cpu' }, env);
    // Then: effective device is "cpu"
    assert.equal(result.device, 'cpu');
  });

  it('[P1] AC-006-01: Given --parallelism on CLI with no config.json value, then CLI value is used', () => {
    // Given: no embeddings.parallelism in config.json
    // And: CLI flag --parallelism 2
    const env = mockEnv({ platform: 'linux' });
    // When: config is resolved
    const result = resolveConfig({}, { parallelism: 2 }, env);
    // Then: effective parallelism is 2
    assert.equal(result.parallelism, 2);
  });

  it('[P2] AC-006-02: Given --device auto on CLI, then auto-detection runs', () => {
    // Given: CLI flag --device auto
    const env = mockEnv({ platform: 'darwin', arch: 'arm64' });
    // When: config is resolved
    const result = resolveConfig({}, { device: 'auto' }, env);
    // Then: detectDevice() is called to auto-select
    assert.equal(result.device, 'coreml'); // auto-detected on macOS ARM
  });

  it('[P2] Given --batch-size 128 on CLI, then it overrides config.json batch_size', () => {
    // Given: config.json has embeddings.batch_size: 32
    // And: CLI flag --batch-size 128
    const env = mockEnv({ platform: 'linux' });
    // When: config is resolved
    const result = resolveConfig({ batch_size: 32 }, { batch_size: 128 }, env);
    // Then: effective batch_size is 128
    assert.equal(result.batch_size, 128);
  });

  it('[P2] Given --dtype fp16 on CLI, then it overrides config.json dtype', () => {
    // Given: config.json has embeddings.dtype: "auto"
    // And: CLI flag --dtype fp16
    const env = mockEnv({ platform: 'linux' });
    // When: config is resolved
    const result = resolveConfig({ dtype: 'auto' }, { dtype: 'fp16' }, env);
    // Then: effective dtype is "fp16"
    assert.equal(result.dtype, 'fp16');
  });

  // -- Precedence order ----------------------------------------------------

  describe('precedence: CLI > config > defaults', () => {

    it('[P1] Given CLI, config, and defaults all provide parallelism, then CLI wins', () => {
      // Given: default = "auto", config.json = 4, CLI = 8
      const env = mockEnv({ platform: 'linux' });
      // When: config is resolved
      const result = resolveConfig({ parallelism: 4 }, { parallelism: 8 }, env);
      // Then: effective parallelism is 8 (CLI wins)
      assert.equal(result.parallelism, 8);
    });

    it('[P1] Given config but no CLI, then config wins over defaults', () => {
      // Given: default = "auto", config.json = 4, no CLI flag
      const env = mockEnv({ platform: 'linux' });
      // When: config is resolved
      const result = resolveConfig({ parallelism: 4 }, {}, env);
      // Then: effective parallelism is 4 (config wins)
      assert.equal(result.parallelism, 4);
    });

    it('[P2] Given no CLI and no config, then defaults apply', () => {
      // Given: no config.json embeddings section, no CLI flags
      const env = mockEnv({ platform: 'linux' });
      // When: config is resolved
      const result = resolveConfig({}, {}, env);
      // Then: batch_size = 32 (default)
      assert.equal(result.batch_size, 32);
      // And: parallelism is auto-resolved
      assert.ok(result.parallelism >= 1);
      // And: device is auto-resolved (not 'auto')
      assert.notEqual(result.device, 'auto');
      // And: dtype is auto-resolved (not 'auto')
      assert.notEqual(result.dtype, 'auto');
    });

  });

});

// ===========================================================================
// Memory-aware parallelism resolution
// ===========================================================================

describe('Memory-aware auto parallelism', () => {

  it('[P0] Given 24GB Mac with CoreML (6GB/worker), auto parallelism caps at 2', () => {
    // Given: 24GB Mac M-series, 10 CPU cores, coreml auto-detected
    const env = mockEnv({ platform: 'darwin', arch: 'arm64', totalMem: 24 * GB, cpuCount: 10 });
    // When: resolveConfig with all defaults
    const result = resolveConfig({}, {}, env);
    // Then: parallelism = min(9, floor(16/6)=2, 4) = 2
    assert.equal(result.device, 'coreml');
    assert.equal(result.parallelism, 2);
  });

  it('[P0] Given 8GB machine with CPU (2GB/worker), auto parallelism caps at 1', () => {
    // Given: 8GB Linux, 4 cores, CPU device
    // reserved = max(8, 2.4) = 8, available = 0
    const env = mockEnv({ platform: 'linux', totalMem: 8 * GB, cpuCount: 4 });
    const result = resolveConfig({}, {}, env);
    // Then: maxByMemory floors to 1
    assert.equal(result.parallelism, 1);
  });

  it('[P0] Given 64GB Mac with CoreML, auto parallelism caps at hard cap (4)', () => {
    // Given: 64GB Mac, 12 cores, coreml
    // reserved = max(8, 19.2) = 19.2, available = 44.8, perWorker = 6
    // maxByMem = floor(44.8/6) = 7, maxByCpu = 11, hardCap = 4
    const env = mockEnv({ platform: 'darwin', arch: 'arm64', totalMem: 64 * GB, cpuCount: 12 });
    const result = resolveConfig({}, {}, env);
    assert.equal(result.parallelism, PARALLELISM_HARD_CAP);
  });

  it('[P1] Given 16GB Linux CPU (2GB/worker), auto parallelism is 4 (memory allows, hard cap limits)', () => {
    // Given: 16GB Linux, 8 cores, CPU device
    // reserved = max(8, 4.8) = 8, available = 8, perWorker = 2
    // maxByMem = 4, maxByCpu = 7, hardCap = 4
    const env = mockEnv({ platform: 'linux', totalMem: 16 * GB, cpuCount: 8 });
    const result = resolveConfig({}, {}, env);
    assert.equal(result.parallelism, 4);
  });

  it('[P1] Given 32GB Linux with CUDA (4GB/worker), auto parallelism is 4', () => {
    // Given: 32GB Linux, 16 cores, CUDA
    // reserved = max(8, 9.6) = 9.6, available = 22.4, perWorker = 4
    // maxByMem = 5, maxByCpu = 15, hardCap = 4
    const env = mockEnv({ platform: 'linux', cpuCount: 16, totalMem: 32 * GB, paths: { '/proc/driver/nvidia/version': true } });
    const result = resolveConfig({}, {}, env);
    assert.equal(result.device, 'cuda');
    assert.equal(result.parallelism, 4);
  });

  it('[P1] Explicit parallelism is NOT capped by memory or hard cap', () => {
    // Given: explicit parallelism: 8 on a 16GB machine
    const env = mockEnv({ platform: 'linux', totalMem: 16 * GB, cpuCount: 4 });
    const result = resolveConfig({ parallelism: 8 }, {}, env);
    // Then: explicit value is honored regardless of memory
    assert.equal(result.parallelism, 8);
  });

  it('[P1] Invalid parallelism falls back to memory-aware auto', () => {
    // Given: parallelism: "banana" on a 24GB Mac
    const env = mockEnv({ platform: 'darwin', arch: 'arm64', totalMem: 24 * GB, cpuCount: 10 });
    const result = resolveConfig({ parallelism: 'banana' }, {}, env);
    // Then: falls back to auto → memory-aware cap of 2
    assert.equal(result.parallelism, 2);
    assert.ok(result.warnings.some(w => /parallelism/i.test(w)));
  });

  it('[P2] Given 2-core machine with plenty of RAM, auto parallelism is 1 (CPU limited)', () => {
    // Given: 64GB, 2 cores → maxByCpu = 1
    const env = mockEnv({ platform: 'linux', totalMem: 64 * GB, cpuCount: 2 });
    const result = resolveConfig({}, {}, env);
    assert.equal(result.parallelism, 1);
  });

});

// ===========================================================================
// max_memory_gb — user-configurable memory cap
// ===========================================================================

describe('max_memory_gb memory cap', () => {

  it('[P0] Given max_memory_gb: 18 on a 24GB Mac with CoreML, parallelism caps at 1', () => {
    // Given: 24GB Mac M-series, max_memory_gb: 18
    // effectiveMemGB = min(18, 24) = 18
    // reserved = max(8, 18 * 0.3) = max(8, 5.4) = 8
    // available = 18 - 8 = 10, perWorker (coreml) = 6
    // maxByMemory = floor(10/6) = 1
    const env = mockEnv({ platform: 'darwin', arch: 'arm64', totalMem: 24 * GB, cpuCount: 10 });
    const result = resolveConfig({ max_memory_gb: 18 }, {}, env);
    assert.equal(result.device, 'coreml');
    assert.equal(result.parallelism, 1);
  });

  it('[P0] Given max_memory_gb: null (default), uses full system RAM', () => {
    // Given: 24GB Mac M-series, no memory cap
    const env = mockEnv({ platform: 'darwin', arch: 'arm64', totalMem: 24 * GB, cpuCount: 10 });
    const result = resolveConfig({}, {}, env);
    // Without cap: reserved = 8, available = 16, perWorker = 6, maxByMemory = 2
    assert.equal(result.parallelism, 2);
  });

  it('[P1] Given max_memory_gb larger than actual RAM, uses actual RAM', () => {
    // Given: 24GB actual, max_memory_gb: 64 → effectiveMemGB = min(64, 24) = 24
    const env = mockEnv({ platform: 'darwin', arch: 'arm64', totalMem: 24 * GB, cpuCount: 10 });
    const result = resolveConfig({ max_memory_gb: 64 }, {}, env);
    // Same as no cap: parallelism = 2
    assert.equal(result.parallelism, 2);
  });

  it('[P1] CLI max_memory_gb overrides config value', () => {
    // Given: config max_memory_gb: 32, CLI max_memory_gb: 18
    const env = mockEnv({ platform: 'darwin', arch: 'arm64', totalMem: 64 * GB, cpuCount: 12 });
    const result = resolveConfig({ max_memory_gb: 32 }, { max_memory_gb: 18 }, env);
    // effectiveMemGB = min(18, 64) = 18
    // reserved = max(8, 5.4) = 8, available = 10, perWorker = 6, maxByMemory = 1
    assert.equal(result.parallelism, 1);
  });

  it('[P1] max_memory_gb is returned in resolved config', () => {
    const env = mockEnv({ platform: 'linux', totalMem: 32 * GB, cpuCount: 8 });
    const result = resolveConfig({ max_memory_gb: 18 }, {}, env);
    assert.equal(result.max_memory_gb, 18);
  });

  it('[P1] max_memory_gb: null is returned when not set', () => {
    const env = mockEnv({ platform: 'linux', totalMem: 32 * GB, cpuCount: 8 });
    const result = resolveConfig({}, {}, env);
    assert.equal(result.max_memory_gb, null);
  });

  it('[P2] Given max_memory_gb: 10 on a 32GB Linux CPU machine, parallelism caps at 1', () => {
    // Given: 32GB Linux, max_memory_gb: 10
    // effectiveMemGB = min(10, 32) = 10
    // reserved = max(8, 3) = 8, available = 2, perWorker (cpu) = 2
    // maxByMemory = 1
    const env = mockEnv({ platform: 'linux', totalMem: 32 * GB, cpuCount: 8 });
    const result = resolveConfig({ max_memory_gb: 10 }, {}, env);
    assert.equal(result.parallelism, 1);
  });

});
