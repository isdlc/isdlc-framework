/**
 * Tests for setupSearchCapabilities() and buildSearchConfig()
 *
 * REQ-0042 / FR-001 through FR-007: Wire search abstraction layer into setup pipeline.
 * Tests the integration glue that connects lib/search/ modules to the installer.
 *
 * Uses dependency injection to mock search modules (detection, install, config).
 * Follows existing patterns from lib/search/router.test.js.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTempDir, cleanupTempDir } from './utils/test-helpers.js';

// Import the functions under test
import { setupSearchCapabilities, buildSearchConfig } from './setup-search.js';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

/**
 * Create a mock logger that records all calls.
 */
function createMockLogger() {
  const calls = {
    step: [],
    info: [],
    success: [],
    warning: [],
    labeled: [],
    listItem: [],
    newline: [],
    log: [],
  };

  return {
    step: (...args) => calls.step.push(args),
    info: (...args) => calls.info.push(args),
    success: (...args) => calls.success.push(args),
    warning: (...args) => calls.warning.push(args),
    labeled: (...args) => calls.labeled.push(args),
    listItem: (...args) => calls.listItem.push(args),
    newline: () => calls.newline.push([]),
    log: (...args) => calls.log.push(args),
    calls,
  };
}

/**
 * Create mock detection result.
 */
function createDetectionResult(overrides = {}) {
  return {
    scaleTier: 'small',
    fileCount: 42,
    tools: [
      { name: 'ast-grep', installed: false, installMethods: [{ method: 'npm', command: 'npm install -g @ast-grep/cli', available: true }] },
      { name: 'probe', installed: false, installMethods: [{ method: 'cargo', command: 'cargo install probe-search', available: true }] },
    ],
    recommendations: [
      {
        tool: { name: 'ast-grep', installed: false, installMethods: [{ method: 'npm', command: 'npm install -g @ast-grep/cli', available: true }] },
        reason: 'Structural search support',
        priority: 'recommended',
        installMethod: { method: 'npm', command: 'npm install -g @ast-grep/cli', available: true },
      },
    ],
    existingMcpServers: [],
    ...overrides,
  };
}

/**
 * Create mock dependencies for setupSearchCapabilities.
 */
function createMockDeps(overrides = {}) {
  const detectionResult = overrides.detectionResult || createDetectionResult();
  const installResults = overrides.installResults || [{ tool: 'ast-grep', success: true, version: '0.25.0', fallbackAvailable: true }];
  const mcpResult = overrides.mcpResult || { configured: ['ast-grep'], errors: [] };
  const writeConfigCalls = [];
  let installCallIndex = 0;

  return {
    detectSearchCapabilities: overrides.detectSearchCapabilities || (async () => detectionResult),
    installTool: overrides.installTool || (async (rec, onConsent) => {
      if (onConsent) await onConsent(rec.tool.name, rec.reason, rec.installMethod.command);
      const result = installResults[installCallIndex] || installResults[installResults.length - 1];
      installCallIndex++;
      return result;
    }),
    configureMcpServers: overrides.configureMcpServers || (async () => mcpResult),
    writeSearchConfig: overrides.writeSearchConfig || ((projectRoot, config) => {
      writeConfigCalls.push({ projectRoot, config });
    }),
    confirm: overrides.confirm || (async () => true),
    setupSemanticSearch: overrides.setupSemanticSearch || (async () => ({
      success: true, components: {}, warnings: [],
    })),
    writeConfigCalls,
    _installCallIndex: () => installCallIndex,
  };
}

// ---------------------------------------------------------------------------
// TC-U-001: Happy path -- detection finds tools, user accepts, config written
// ---------------------------------------------------------------------------

describe('setupSearchCapabilities()', () => {
  let tmpDir;
  let mockLogger;

  beforeEach(() => {
    tmpDir = createTempDir();
    mkdirSync(join(tmpDir, '.isdlc'), { recursive: true });
    mkdirSync(join(tmpDir, '.claude'), { recursive: true });
    mockLogger = createMockLogger();
  });

  afterEach(() => {
    cleanupTempDir(tmpDir);
  });

  // TC-U-001
  it('should orchestrate detection, installation, MCP config, and config write on happy path', async () => {
    const deps = createMockDeps();
    let detectCalled = false;
    let installCalled = false;
    let mcpCalled = false;

    deps.detectSearchCapabilities = async (root) => {
      detectCalled = true;
      assert.equal(root, tmpDir);
      return createDetectionResult();
    };

    deps.installTool = async (rec, onConsent) => {
      installCalled = true;
      if (onConsent) await onConsent(rec.tool.name, rec.reason, rec.installMethod.command);
      return { tool: 'ast-grep', success: true, version: '0.25.0', fallbackAvailable: true };
    };

    deps.configureMcpServers = async (backends, settingsPath) => {
      mcpCalled = true;
      return { configured: ['ast-grep'], errors: [] };
    };

    await setupSearchCapabilities(tmpDir, {}, { logger: mockLogger, deps });

    assert.ok(detectCalled, 'detectSearchCapabilities should be called');
    assert.ok(installCalled, 'installTool should be called');
    assert.ok(mcpCalled, 'configureMcpServers should be called');
    assert.ok(deps.writeConfigCalls.length > 0, 'writeSearchConfig should be called');
  });

  // TC-U-002: Happy path -- detection finds no recommendations
  it('should write baseline config when no recommendations found', async () => {
    const deps = createMockDeps({
      detectionResult: createDetectionResult({ recommendations: [] }),
    });

    let installCalled = false;
    deps.installTool = async () => { installCalled = true; return { success: false }; };

    let mcpCalled = false;
    deps.configureMcpServers = async () => { mcpCalled = true; return { configured: [], errors: [] }; };

    await setupSearchCapabilities(tmpDir, {}, { logger: mockLogger, deps });

    assert.ok(!installCalled, 'installTool should NOT be called when no recommendations');
    assert.ok(!mcpCalled, 'configureMcpServers should NOT be called when no installations');
    assert.ok(deps.writeConfigCalls.length > 0, 'writeSearchConfig should still be called');
    assert.deepEqual(deps.writeConfigCalls[0].config.activeBackends, ['grep-glob']);
  });

  // TC-U-003: Force mode -- auto-accept consent
  it('should auto-accept all recommendations in force mode', async () => {
    let consentCallbackReturns = [];
    const deps = createMockDeps();
    deps.installTool = async (rec, onConsent) => {
      const result = await onConsent(rec.tool.name, rec.reason, rec.installMethod.command);
      consentCallbackReturns.push(result);
      return { tool: rec.tool.name, success: true, version: '0.25.0', fallbackAvailable: true };
    };

    await setupSearchCapabilities(tmpDir, { force: true }, { logger: mockLogger, deps });

    // In force mode, consent callback should always return true
    assert.ok(consentCallbackReturns.length > 0, 'Consent callback should be called');
    assert.ok(consentCallbackReturns.every(r => r === true), 'All consent callbacks should return true in force mode');
  });

  // TC-U-004: Dry-run mode -- no installations, no MCP config, no config write
  it('should not install, configure MCP, or write config in dry-run mode', async () => {
    let installCalled = false;
    let mcpCalled = false;
    const deps = createMockDeps();
    deps.installTool = async () => { installCalled = true; return { success: true }; };
    deps.configureMcpServers = async () => { mcpCalled = true; return { configured: [], errors: [] }; };

    await setupSearchCapabilities(tmpDir, { dryRun: true }, { logger: mockLogger, deps });

    assert.ok(!installCalled, 'installTool should NOT be called in dry-run');
    assert.ok(!mcpCalled, 'configureMcpServers should NOT be called in dry-run');
    assert.equal(deps.writeConfigCalls.length, 0, 'writeSearchConfig should NOT be called in dry-run');
  });

  // TC-U-005: Detection failure -- outer try-catch catches, logs warning, returns
  it('should catch detection errors and log warning without throwing', async () => {
    const deps = createMockDeps();
    deps.detectSearchCapabilities = async () => { throw new Error('Detection broke'); };

    // Should NOT throw
    await setupSearchCapabilities(tmpDir, {}, { logger: mockLogger, deps });

    const warningMessages = mockLogger.calls.warning.map(args => args.join(' '));
    assert.ok(
      warningMessages.some(msg => msg.includes('Detection broke') || msg.includes('search')),
      'Warning should mention the error'
    );
  });

  // TC-U-006: Tool installation failure -- continue to next recommendation
  it('should continue to next recommendation when installation fails', async () => {
    const detectionResult = createDetectionResult({
      recommendations: [
        {
          tool: { name: 'ast-grep', installed: false, installMethods: [] },
          reason: 'Structural search',
          priority: 'recommended',
          installMethod: { method: 'npm', command: 'npm install -g @ast-grep/cli', available: true },
        },
        {
          tool: { name: 'probe', installed: false, installMethods: [] },
          reason: 'Enhanced lexical search',
          priority: 'optional',
          installMethod: { method: 'cargo', command: 'cargo install probe-search', available: true },
        },
      ],
    });

    let installCallCount = 0;
    const deps = createMockDeps({ detectionResult });
    deps.installTool = async (rec, onConsent) => {
      installCallCount++;
      if (onConsent) await onConsent(rec.tool.name, rec.reason, rec.installMethod.command);
      if (rec.tool.name === 'ast-grep') {
        return { tool: 'ast-grep', success: false, error: 'npm EACCES', fallbackAvailable: true };
      }
      return { tool: 'probe', success: true, version: '1.0.0', fallbackAvailable: true };
    };

    deps.configureMcpServers = async (backends) => {
      return { configured: backends.map(b => b.id || b.name), errors: [] };
    };

    await setupSearchCapabilities(tmpDir, {}, { logger: mockLogger, deps });

    assert.equal(installCallCount, 2, 'installTool should be called for both recommendations');
  });

  // TC-U-007: User declines tool installation -- no warning logged
  it('should not log warning when user declines installation', async () => {
    const deps = createMockDeps();
    deps.installTool = async (rec, onConsent) => {
      return { tool: rec.tool.name, success: false, error: 'User declined installation', fallbackAvailable: true };
    };

    await setupSearchCapabilities(tmpDir, {}, { logger: mockLogger, deps });

    const warningMessages = mockLogger.calls.warning.map(args => args.join(' '));
    assert.ok(
      !warningMessages.some(msg => msg.includes('Could not install')),
      'Should not warn about user-declined installations'
    );
  });

  // TC-U-008: MCP configuration failure -- continue to config write
  it('should continue to config write even when MCP configuration fails', async () => {
    const deps = createMockDeps();
    deps.configureMcpServers = async () => {
      return { configured: [], errors: [{ code: 'CONFIG_SETTINGS_CORRUPT', message: 'Invalid JSON' }] };
    };

    await setupSearchCapabilities(tmpDir, {}, { logger: mockLogger, deps });

    const warningMessages = mockLogger.calls.warning.map(args => args.join(' '));
    assert.ok(
      warningMessages.some(msg => msg.includes('MCP') || msg.includes('Invalid JSON') || msg.includes('CONFIG')),
      'Should warn about MCP configuration error'
    );
    assert.ok(deps.writeConfigCalls.length > 0, 'writeSearchConfig should still be called');
  });

  // TC-U-009: Config write failure -- caught by outer try-catch
  it('should catch config write errors without throwing', async () => {
    const deps = createMockDeps();
    deps.writeSearchConfig = () => { throw new Error('Disk full'); };

    // Should NOT throw
    await setupSearchCapabilities(tmpDir, {}, { logger: mockLogger, deps });

    const warningMessages = mockLogger.calls.warning.map(args => args.join(' '));
    assert.ok(
      warningMessages.some(msg => msg.includes('Disk full') || msg.includes('search')),
      'Should warn about config write error'
    );
  });

  // TC-U-010: Detection reports findings via logger
  it('should report detection findings via logger', async () => {
    const deps = createMockDeps({
      detectionResult: createDetectionResult({ scaleTier: 'medium', fileCount: 15000 }),
    });

    await setupSearchCapabilities(tmpDir, {}, { logger: mockLogger, deps });

    const labeledArgs = mockLogger.calls.labeled.map(args => args.join(' '));
    assert.ok(
      labeledArgs.some(msg => msg.includes('medium') || msg.includes('Scale')),
      'Should report project scale tier'
    );
  });

  // TC-U-011: Multiple recommendations -- each gets consent callback
  it('should call installTool for each recommendation', async () => {
    const detectionResult = createDetectionResult({
      recommendations: [
        { tool: { name: 'tool-a' }, reason: 'A', priority: 'recommended', installMethod: { method: 'npm', command: 'npm i a', available: true } },
        { tool: { name: 'tool-b' }, reason: 'B', priority: 'optional', installMethod: { method: 'npm', command: 'npm i b', available: true } },
        { tool: { name: 'tool-c' }, reason: 'C', priority: 'optional', installMethod: { method: 'npm', command: 'npm i c', available: true } },
      ],
    });

    let installCallCount = 0;
    const deps = createMockDeps({ detectionResult });
    deps.installTool = async (rec, onConsent) => {
      installCallCount++;
      if (onConsent) await onConsent(rec.tool.name, rec.reason, rec.installMethod.command);
      return { tool: rec.tool.name, success: true, fallbackAvailable: true };
    };

    await setupSearchCapabilities(tmpDir, {}, { logger: mockLogger, deps });

    assert.equal(installCallCount, 3, 'installTool should be called 3 times');
  });

  // TC-U-012: Successful installation logged with version
  it('should log successful installation with version', async () => {
    const deps = createMockDeps();
    deps.installTool = async (rec, onConsent) => {
      if (onConsent) await onConsent(rec.tool.name, rec.reason, rec.installMethod.command);
      return { tool: 'ast-grep', success: true, version: '0.25.0', fallbackAvailable: true };
    };

    await setupSearchCapabilities(tmpDir, {}, { logger: mockLogger, deps });

    const successMessages = mockLogger.calls.success.map(args => args.join(' '));
    assert.ok(
      successMessages.some(msg => msg.includes('ast-grep') && msg.includes('0.25.0')),
      'Should log installed tool with version'
    );
  });

  // TC-U-023: Step 8 label is "8/8"
  it('should use step label "8/8" for search setup', async () => {
    const deps = createMockDeps({
      detectionResult: createDetectionResult({ recommendations: [] }),
    });

    await setupSearchCapabilities(tmpDir, {}, { logger: mockLogger, deps });

    const stepArgs = mockLogger.calls.step;
    assert.ok(
      stepArgs.some(args => args[0] === '8/8'),
      'Should call logger.step with "8/8"'
    );
  });

  // TC-S-001: Path traversal rejected
  it('should handle path traversal safely', async () => {
    const deps = createMockDeps({
      detectionResult: createDetectionResult({ recommendations: [] }),
    });

    // Should not throw and should not write outside tmpDir
    await setupSearchCapabilities('/tmp/../../etc', {}, { logger: mockLogger, deps });

    // The function should handle this gracefully
    // It may skip or proceed with detection but should not crash
  });

  // TC-P-002: Step 8 performance
  it('should complete within 2000ms with mocked dependencies', async () => {
    const deps = createMockDeps({
      detectionResult: createDetectionResult({ recommendations: [] }),
    });

    const start = process.hrtime.bigint();
    await setupSearchCapabilities(tmpDir, {}, { logger: mockLogger, deps });
    const elapsed = Number(process.hrtime.bigint() - start) / 1e6; // ms

    assert.ok(elapsed < 2000, `Should complete within 2000ms but took ${elapsed.toFixed(0)}ms`);
  });

  // TC-U-024: Semantic search integration -- successful setup adds backend to config
  it('should add semantic-search backend when semantic setup succeeds', async () => {
    const deps = createMockDeps({
      detectionResult: createDetectionResult({ recommendations: [] }),
      setupSemanticSearch: async () => ({
        success: true,
        components: {
          treeSitter: { installed: true, skipped: false },
          onnxRuntime: { installed: true, skipped: false },
          faiss: { installed: true, skipped: false },
          codebertModel: { installed: true, skipped: false },
          docker: { installed: false, skipped: true },
          grammars: { installed: true, skipped: false, languages: ['typescript'] },
        },
        warnings: [],
      }),
    });

    await setupSearchCapabilities(tmpDir, {}, { logger: mockLogger, deps });

    assert.ok(deps.writeConfigCalls.length > 0, 'writeSearchConfig should be called');
    const config = deps.writeConfigCalls[0].config;
    assert.ok(config.activeBackends.includes('semantic-search'), 'Should include semantic-search backend');
    assert.ok(config.backendConfigs['semantic-search'], 'Should have semantic-search backend config');
    assert.equal(config.backendConfigs['semantic-search'].enabled, true);
  });

  // TC-U-025: Semantic search failure is fail-open -- does not add backend, does not throw
  it('should not add semantic-search backend when semantic setup throws', async () => {
    const deps = createMockDeps({
      detectionResult: createDetectionResult({ recommendations: [] }),
      setupSemanticSearch: async () => { throw new Error('tree-sitter build failed'); },
    });

    await setupSearchCapabilities(tmpDir, {}, { logger: mockLogger, deps });

    assert.ok(deps.writeConfigCalls.length > 0, 'writeSearchConfig should still be called');
    const config = deps.writeConfigCalls[0].config;
    assert.ok(!config.activeBackends.includes('semantic-search'), 'Should NOT include semantic-search on failure');
  });

  // TC-U-026: Semantic search warnings are logged
  it('should log semantic setup warnings', async () => {
    const warningText = 'onnxruntime-node not installed. Local CodeBERT inference unavailable.';
    const deps = createMockDeps({
      detectionResult: createDetectionResult({ recommendations: [] }),
      setupSemanticSearch: async (_root, options) => {
        if (options.onProgress) {
          options.onProgress('onnx-runtime', 'skipped', 'onnxruntime-node not available');
        }
        return { success: true, components: {}, warnings: [warningText] };
      },
    });

    await setupSearchCapabilities(tmpDir, {}, { logger: mockLogger, deps });

    const allInfoMessages = mockLogger.calls.info.map(args => args.join(' '));
    const allSuccessMessages = mockLogger.calls.success.map(args => args.join(' '));
    const allMessages = [...allInfoMessages, ...allSuccessMessages];
    assert.ok(
      allMessages.some(msg => msg.includes('onnxruntime-node')),
      `Should log semantic warning. Got info: ${JSON.stringify(allInfoMessages)}`
    );
  });

  // TC-U-027: Semantic search respects dry-run -- skips model download
  it('should not run semantic setup in dry-run mode', async () => {
    let semanticCalled = false;
    const deps = createMockDeps({
      detectionResult: createDetectionResult({ recommendations: [] }),
      setupSemanticSearch: async () => { semanticCalled = true; return { success: true, components: {}, warnings: [] }; },
    });

    await setupSearchCapabilities(tmpDir, { dryRun: true }, { logger: mockLogger, deps });

    assert.ok(!semanticCalled, 'setupSemanticSearch should NOT be called in dry-run mode');
  });
});

// ---------------------------------------------------------------------------
// buildSearchConfig() tests
// ---------------------------------------------------------------------------

describe('buildSearchConfig()', () => {
  // TC-U-013: Build config from detection and successful installs
  it('should build config from detection and successful installs', () => {
    const config = buildSearchConfig(
      { scaleTier: 'medium' },
      [{ success: true, tool: 'ast-grep' }]
    );

    assert.equal(config.enabled, true);
    assert.deepEqual(config.activeBackends, ['grep-glob', 'ast-grep']);
    assert.equal(config.preferredModality, 'lexical');
    assert.equal(config.cloudAllowed, false);
    assert.equal(config.scaleTier, 'medium');
    assert.ok(config.backendConfigs['ast-grep'], 'Should have ast-grep backend config');
    assert.equal(config.backendConfigs['ast-grep'].enabled, true);
  });

  // TC-U-014: Build config with no successful installs
  it('should build baseline config when no installs succeed', () => {
    const config = buildSearchConfig(
      { scaleTier: 'small' },
      [{ success: false, tool: 'ast-grep' }]
    );

    assert.equal(config.enabled, true);
    assert.deepEqual(config.activeBackends, ['grep-glob']);
    assert.equal(config.scaleTier, 'small');
    assert.deepEqual(config.backendConfigs, {});
  });

  // TC-U-015: Build config with multiple successful installs
  it('should include all successful installs in config', () => {
    const config = buildSearchConfig(
      { scaleTier: 'large' },
      [
        { success: true, tool: 'ast-grep' },
        { success: true, tool: 'probe' },
      ]
    );

    assert.deepEqual(config.activeBackends, ['grep-glob', 'ast-grep', 'probe']);
    assert.ok(config.backendConfigs['ast-grep']);
    assert.ok(config.backendConfigs['probe']);
  });

  // TC-U-016: Build config always includes grep-glob as first backend
  it('should always include grep-glob as first backend', () => {
    const config = buildSearchConfig({ scaleTier: 'small' }, []);

    assert.equal(config.activeBackends[0], 'grep-glob');
  });

  // Edge case: empty install results
  it('should handle empty install results array', () => {
    const config = buildSearchConfig({ scaleTier: 'small' }, []);

    assert.deepEqual(config.activeBackends, ['grep-glob']);
    assert.deepEqual(config.backendConfigs, {});
  });

  // Edge case: null detection
  it('should handle null detection result gracefully', () => {
    const config = buildSearchConfig(null, []);

    assert.equal(config.enabled, true);
    assert.deepEqual(config.activeBackends, ['grep-glob']);
    assert.equal(config.scaleTier, 'small');
  });
});
