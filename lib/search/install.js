/**
 * Search Tool Installation
 *
 * Install recommended search tools with user consent. Handle failures gracefully.
 * Configure MCP servers in .claude/settings.json.
 *
 * REQ-0041 / FR-004, FR-005: Tool Installation and MCP Configuration
 * @module lib/search/install
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';

/**
 * @typedef {Object} InstallResult
 * @property {string} tool - Tool name
 * @property {boolean} success - Whether installation succeeded
 * @property {string} [version] - Installed version on success
 * @property {string} [error] - Error message on failure
 * @property {string} [errorCode] - Error code
 * @property {boolean} fallbackAvailable - Whether a fallback option exists
 */

/**
 * MCP server configuration definitions for known tools.
 */
const MCP_CONFIGS = {
  'ast-grep': {
    command: 'ast-grep',
    args: ['lsp'],
    env: {},
  },
  'probe': {
    command: 'probe-mcp',
    args: [],
    env: {},
  },
  'code-index': {
    command: 'code-index-mcp',
    args: [],
    env: {},
  },
};

/**
 * Install a search tool if user consents.
 *
 * @param {import('./detection.js').ToolRecommendation} recommendation
 * @param {Function} onConsent - Called with (toolName, description, command) => Promise<boolean>
 * @param {Object} [options]
 * @param {Function} [options.execFn] - Custom exec function for testing
 * @returns {Promise<InstallResult>}
 */
export async function installTool(recommendation, onConsent, options = {}) {
  const { execFn = safeExecInstall } = options;
  const { tool, reason, installMethod } = recommendation;

  if (!tool || !installMethod) {
    return {
      tool: tool?.name || 'unknown',
      success: false,
      error: 'Invalid recommendation: missing tool or install method',
      errorCode: 'INSTALL_INVALID',
      fallbackAvailable: true,
    };
  }

  // Request consent
  let consented = false;
  try {
    consented = await onConsent(tool.name, reason, installMethod.command);
  } catch {
    consented = false;
  }

  if (!consented) {
    return {
      tool: tool.name,
      success: false,
      error: 'User declined installation',
      fallbackAvailable: true,
    };
  }

  // Attempt installation
  const result = execFn(installMethod.command);

  if (result.success) {
    // Extract version from post-install check
    const versionResult = execFn(`${tool.name} --version`);
    const version = versionResult.success
      ? extractVersion(versionResult.output)
      : undefined;

    return {
      tool: tool.name,
      success: true,
      version,
      fallbackAvailable: true,
    };
  }

  // Classify the error
  const errorCode = classifyInstallError(result.error);

  // Try fallback install method if available
  const fallbackMethods = (tool.installMethods || [])
    .filter(im => im.available && im.command !== installMethod.command);

  for (const fallback of fallbackMethods) {
    const fallbackResult = execFn(fallback.command);
    if (fallbackResult.success) {
      const versionResult = execFn(`${tool.name} --version`);
      return {
        tool: tool.name,
        success: true,
        version: versionResult.success ? extractVersion(versionResult.output) : undefined,
        fallbackAvailable: true,
      };
    }
  }

  return {
    tool: tool.name,
    success: false,
    error: result.error || 'Installation failed',
    errorCode,
    fallbackAvailable: true,
  };
}

/**
 * Configure MCP servers in .claude/settings.json for installed backends.
 *
 * Preserves existing MCP configurations. Does not overwrite conflicting entries.
 *
 * @param {Object[]} backends - Array of { id, name } objects
 * @param {string} settingsPath - Path to .claude/settings.json
 * @param {Object} [options]
 * @param {string} [options.projectRoot] - Project root for workspace paths
 * @returns {Promise<{configured: string[], errors: Object[]}>}
 */
export async function configureMcpServers(backends, settingsPath, options = {}) {
  const { projectRoot = '.' } = options;
  const configured = [];
  const errors = [];

  // Read existing settings
  let settings = {};
  if (existsSync(settingsPath)) {
    try {
      const raw = readFileSync(settingsPath, 'utf-8');
      settings = JSON.parse(raw);
    } catch {
      errors.push({
        code: 'CONFIG_SETTINGS_CORRUPT',
        message: 'settings.json contains invalid JSON, preserving original',
      });
      return { configured, errors };
    }
  }

  // Ensure mcpServers section
  if (!settings.mcpServers) {
    settings.mcpServers = {};
  }

  for (const backend of backends) {
    const backendId = backend.id || backend.name;
    const mcpConfig = MCP_CONFIGS[backendId];

    if (!mcpConfig) {
      errors.push({
        code: 'CONFIG_MCP_UNKNOWN',
        message: `No MCP configuration known for backend: ${backendId}`,
      });
      continue;
    }

    // Check for conflict
    if (settings.mcpServers[backendId]) {
      const existing = settings.mcpServers[backendId];
      if (existing.command !== mcpConfig.command) {
        errors.push({
          code: 'CONFIG_MCP_CONFLICT',
          message: `MCP server '${backendId}' already configured with different command`,
        });
        continue;
      }
      // Same config, already good
      configured.push(backendId);
      continue;
    }

    // Add new MCP configuration
    const config = { ...mcpConfig };
    if (backendId === 'probe' && projectRoot) {
      config.args = ['--workspace', projectRoot];
    }

    settings.mcpServers[backendId] = config;
    configured.push(backendId);
  }

  // Write settings
  try {
    const dir = dirname(settingsPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
  } catch (err) {
    errors.push({
      code: 'CONFIG_SETTINGS_WRITE_FAIL',
      message: `Failed to write settings.json: ${err.message}`,
    });
  }

  return { configured, errors };
}

/**
 * Remove MCP configuration for a backend.
 *
 * @param {string} backendId - Backend to remove
 * @param {string} settingsPath - Path to settings.json
 * @returns {{success: boolean, error?: string}}
 */
export function removeMcpServer(backendId, settingsPath) {
  if (!existsSync(settingsPath)) {
    return { success: true }; // Nothing to remove
  }

  try {
    const raw = readFileSync(settingsPath, 'utf-8');
    const settings = JSON.parse(raw);

    if (settings.mcpServers && settings.mcpServers[backendId]) {
      delete settings.mcpServers[backendId];
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Classify installation error into error codes.
 *
 * @param {string} errorMsg
 * @returns {string}
 */
function classifyInstallError(errorMsg) {
  if (!errorMsg) return 'INSTALL_UNKNOWN';

  const msg = errorMsg.toLowerCase();

  if (msg.includes('eacces') || msg.includes('permission denied')) {
    return 'INSTALL_PERMISSION_DENIED';
  }
  if (msg.includes('network') || msg.includes('enotfound') || msg.includes('etimedout')) {
    return 'INSTALL_NETWORK_FAILURE';
  }
  if (msg.includes('unsupported') || msg.includes('platform')) {
    return 'INSTALL_UNSUPPORTED_PLATFORM';
  }
  if (msg.includes('version') || msg.includes('conflict')) {
    return 'INSTALL_VERSION_CONFLICT';
  }
  if (msg.includes('not found') || msg.includes('command not found')) {
    return 'INSTALL_PACKAGE_MANAGER_MISSING';
  }

  return 'INSTALL_UNKNOWN';
}

/**
 * Extract version from command output.
 *
 * @param {string} output
 * @returns {string|undefined}
 */
function extractVersion(output) {
  if (!output) return undefined;
  const match = output.match(/(\d+\.\d+(?:\.\d+)?)/);
  return match ? match[1] : undefined;
}

/**
 * Safe exec for installation commands.
 *
 * @param {string} command
 * @returns {{success: boolean, output: string, error?: string}}
 */
function safeExecInstall(command) {
  try {
    const output = execSync(command, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 120000, // 2 minutes for installation
    }).trim();
    return { success: true, output };
  } catch (err) {
    return {
      success: false,
      output: '',
      error: err.stderr || err.message || 'Unknown error',
    };
  }
}
