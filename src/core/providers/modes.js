/**
 * Provider Modes — Core module
 * ==============================
 * Mode management: get/set active mode, list available modes.
 *
 * Extracted from src/claude/hooks/lib/provider-utils.cjs (REQ-0127).
 * Per ADR-CODEX-006: Core in ESM, CJS bridge for hooks.
 *
 * @module src/core/providers/modes
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Get the current active mode from config.
 * @param {object|null} config - Provider configuration object
 * @returns {string} Active mode name
 */
export function getActiveMode(config) {
  if (!config) return 'hybrid';
  return config.active_mode || 'hybrid';
}

/**
 * Set the active mode in providers.yaml.
 * @param {string} mode - Mode name (budget, quality, local, hybrid)
 * @param {string} projectRoot - Project root directory
 * @returns {boolean} Success
 */
export function setActiveMode(mode, projectRoot) {
  const configPath = join(projectRoot, '.isdlc', 'providers.yaml');

  if (!existsSync(configPath)) {
    return false;
  }

  try {
    let content = readFileSync(configPath, 'utf8');

    if (content.includes('active_mode:')) {
      content = content.replace(/active_mode:\s*["']?\w+["']?/, `active_mode: "${mode}"`);
    } else {
      content += `\nactive_mode: "${mode}"\n`;
    }

    writeFileSync(configPath, content);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get available modes from config.
 * @param {object|null} config - Provider configuration object
 * @returns {object} Modes configuration
 */
export function getAvailableModes(config) {
  if (config?.modes) return config.modes;
  return {
    budget: { description: 'Minimize API costs' },
    quality: { description: 'Best models everywhere' },
    local: { description: 'No cloud calls (Ollama only)' },
    hybrid: { description: 'Smart routing by phase' }
  };
}
