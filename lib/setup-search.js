/**
 * Search Setup Pipeline Integration
 *
 * Orchestrates lib/search/ modules during the installer's Step 8.
 * Detects search capabilities, recommends tools, installs with consent,
 * configures MCP servers, and writes search-config.json.
 *
 * REQ-0042 / FR-001: Setup Pipeline Integration
 * REQ-0042 / FR-003: Detection Step
 * REQ-0042 / FR-004: Installation Step
 * REQ-0042 / FR-005: Configuration Persistence
 * REQ-0042 / FR-007: Fail-Open Behavior (entire function wrapped in try-catch)
 *
 * @module lib/setup-search
 */

import { join } from 'node:path';

// Default imports from lib/search/ modules -- overridable via dependency injection
import { detectSearchCapabilities as defaultDetect } from './search/detection.js';
import { installTool as defaultInstall, configureMcpServers as defaultConfigureMcp } from './search/install.js';
import { writeSearchConfig as defaultWriteConfig } from './search/config.js';
import { setupSemanticSearch as defaultSetupSemantic, getSemanticSearchConfig } from './embedding/installer/semantic-search-setup.js';

/**
 * Build a search configuration from detection results and install outcomes.
 * REQ-0042 / FR-005 (AC-005-01): Construct config for writeSearchConfig().
 *
 * @param {Object|null} detection - Detection result (scaleTier, fileCount, etc.)
 * @param {Object[]} installResults - Array of install result objects ({ success, tool })
 * @returns {Object} SearchConfig object ready for writeSearchConfig()
 */
export function buildSearchConfig(detection, installResults) {
  const scaleTier = (detection && detection.scaleTier) ? detection.scaleTier : 'small';

  const activeBackends = ['grep-glob'];
  const backendConfigs = {};

  if (Array.isArray(installResults)) {
    for (const result of installResults) {
      if (result.success && result.tool) {
        activeBackends.push(result.tool);
        backendConfigs[result.tool] = { enabled: true };
      }
    }
  }

  return {
    enabled: true,
    activeBackends,
    preferredModality: 'lexical',
    cloudAllowed: false,
    scaleTier,
    backendConfigs,
  };
}

/**
 * Setup search capabilities during installer Step 8.
 *
 * This function is the main orchestration entry point called by the installer.
 * It coordinates detection, installation, MCP configuration, and config persistence.
 *
 * REQ-0042 / FR-001 (AC-001-01 through AC-001-07)
 * REQ-0042 / FR-007: Entire function wrapped in try-catch (fail-open)
 *
 * @param {string} projectRoot - Project root directory
 * @param {Object} options - Installer options
 * @param {boolean} [options.force] - Auto-accept all recommendations
 * @param {boolean} [options.dryRun] - Display recommendations without making changes
 * @param {Object} [context] - Injectable context for testing
 * @param {Object} [context.logger] - Logger instance
 * @param {Object} [context.deps] - Dependency overrides for testing
 */
export async function setupSearchCapabilities(projectRoot, options = {}, context = {}) {
  const { force = false, dryRun = false } = options;
  const logger = context.logger || (await import('./utils/logger.js')).default;
  const deps = context.deps || {};

  const detect = deps.detectSearchCapabilities || defaultDetect;
  const install = deps.installTool || defaultInstall;
  const configureMcp = deps.configureMcpServers || defaultConfigureMcp;
  const writeConfig = deps.writeSearchConfig || defaultWriteConfig;
  const confirmFn = deps.confirm || (async () => true);
  const setupSemantic = deps.setupSemanticSearch || defaultSetupSemantic;

  // REQ-0042 / FR-007 (AC-007-01): Entire step 8 in try-catch
  try {
    // Step label
    logger.step('8/8', 'Setting up search capabilities...');

    // FR-003: Detection step
    const detection = await detect(projectRoot);

    // Report findings -- REQ-0042 / FR-001 (AC-001-02)
    logger.labeled('Project Scale', `${detection.scaleTier} (${detection.fileCount} files)`);

    // Report installed tools
    for (const tool of (detection.tools || [])) {
      if (tool.installed) {
        logger.success(`Found ${tool.name}${tool.version ? ` (v${tool.version})` : ''}`);
      }
    }

    // Report recommendations
    if (detection.recommendations.length === 0) {
      logger.info('No additional search tools recommended.');
    }

    // Dry-run mode: display recommendations but make no changes
    if (dryRun) {
      for (const rec of detection.recommendations) {
        logger.info(`Would recommend: ${rec.tool.name} -- ${rec.reason}`);
      }
      logger.info('Dry run: skipping search tool installation and configuration.');
      return;
    }

    // FR-004: Installation step
    const installResults = [];

    for (const rec of detection.recommendations) {
      // Build consent callback based on mode
      const consentCallback = force
        ? async () => true
        : async (toolName, description, command) => {
            return confirmFn(`Install ${toolName}? (${command})`, true);
          };

      const result = await install(rec, consentCallback);
      installResults.push(result);

      if (result.success) {
        logger.success(`Installed ${result.tool}${result.version ? ` (v${result.version})` : ''}`);
      } else if (result.error && result.error !== 'User declined installation') {
        if (result.errorCode === 'INSTALL_EXTERNALLY_MANAGED') {
          logger.warning(`Could not install ${result.tool}: Python environment is externally managed.`);
          logger.info('Install pipx first: brew install pipx (macOS) or apt install pipx (Linux)');
          logger.info(`Then retry: pipx install ${result.tool}`);
        } else {
          logger.warning(`Could not install ${result.tool}: ${result.error}`);
        }
      }
    }

    // FR-004: Configure MCP servers for successfully installed tools
    const successfulInstalls = installResults.filter(r => r.success);

    if (successfulInstalls.length > 0) {
      const backends = successfulInstalls.map(r => ({ id: r.tool, name: r.tool }));
      const settingsPath = join(projectRoot, '.claude', 'settings.json');
      const mcpResult = await configureMcp(backends, settingsPath, { projectRoot });

      if (mcpResult.errors && mcpResult.errors.length > 0) {
        for (const err of mcpResult.errors) {
          logger.warning(`MCP configuration: ${err.message}`);
        }
      }

      if (mcpResult.configured && mcpResult.configured.length > 0) {
        logger.success(`Configured MCP servers: ${mcpResult.configured.join(', ')}`);
      }
    }

    // REQ-0045 / FR-015: Semantic search toolchain setup (fail-open)
    let semanticConfig = null;
    try {
      const semanticResult = await setupSemantic(projectRoot, {
        skipDocker: true,
        skipModel: dryRun,
        onProgress: (component, status, detail) => {
          if (status === 'found') logger.success(detail);
          else if (status === 'skipped' && detail) logger.info(detail);
        },
      });
      semanticConfig = getSemanticSearchConfig(semanticResult);
      if (semanticResult.warnings.length > 0) {
        for (const w of semanticResult.warnings) logger.info(w);
      }
    } catch (semanticErr) {
      logger.info(`Semantic search setup skipped: ${semanticErr.message}`);
    }

    // FR-005: Configuration persistence
    const config = buildSearchConfig(detection, installResults);
    if (semanticConfig) {
      config.activeBackends.push('semantic-search');
      config.backendConfigs['semantic-search'] = semanticConfig.semantic;
    }
    writeConfig(projectRoot, config);
    logger.success('Search configuration saved.');

  } catch (err) {
    // REQ-0042 / FR-007: Fail-open -- log warning but never block init
    logger.warning(`Search setup encountered an issue: ${err.message}`);
    logger.info('Continuing without enhanced search.');
  }
}
