/**
 * Provider Configuration — Core module
 * ======================================
 * YAML parsing, config loading, defaults, and config detection.
 *
 * Extracted from src/claude/hooks/lib/provider-utils.cjs (REQ-0127).
 * Per ADR-CODEX-006: Core in ESM, CJS bridge for hooks.
 *
 * @module src/core/providers/config
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// ============================================================================
// YAML PARSING (Minimal implementation - no external dependency)
// ============================================================================

/**
 * Parse a YAML value string into appropriate JS type.
 * @param {string} value - Raw value string
 * @returns {any} Parsed value
 */
export function parseValue(value) {
  if (!value) return '';

  // Remove quotes
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }

  // Boolean
  if (value === 'true') return true;
  if (value === 'false') return false;

  // Null
  if (value === 'null' || value === '~') return null;

  // Number
  if (!isNaN(value) && value !== '') {
    return value.includes('.') ? parseFloat(value) : parseInt(value, 10);
  }

  // Array (inline)
  if (value.startsWith('[') && value.endsWith(']')) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1).split(',').map(v => parseValue(v.trim()));
    }
  }

  return value;
}

/**
 * Simple YAML parser for provider config files.
 * Handles basic YAML features: objects, arrays, strings, numbers, booleans.
 * Does NOT handle: anchors, aliases, multi-line strings, complex types.
 * @param {string} yamlContent - YAML content string
 * @returns {object} Parsed object
 */
export function parseYaml(yamlContent) {
  const lines = yamlContent.split('\n');
  const result = {};
  const stack = [{ obj: result, indent: -1 }];
  let currentArrayKey = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip empty lines and comments
    if (!line.trim() || line.trim().startsWith('#')) {
      continue;
    }

    // Calculate indentation
    const indent = line.search(/\S/);
    const content = line.trim();

    // Handle array items
    if (content.startsWith('- ')) {
      const value = content.slice(2).trim();

      // Pop stack to correct level
      while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
        stack.pop();
      }

      const parent = stack[stack.length - 1].obj;

      // Check if this is a key-value pair in array
      if (value.includes(': ')) {
        const colonIdx = value.indexOf(': ');
        const itemKey = value.slice(0, colonIdx).trim();
        const itemValue = parseValue(value.slice(colonIdx + 2).trim());

        if (!Array.isArray(parent[currentArrayKey])) {
          parent[currentArrayKey] = [];
        }

        if (typeof itemValue === 'string' || typeof itemValue === 'number' || typeof itemValue === 'boolean') {
          const newObj = { [itemKey]: itemValue };
          parent[currentArrayKey].push(newObj);
          stack.push({ obj: newObj, indent });
        } else {
          parent[currentArrayKey].push({ [itemKey]: itemValue });
        }
      } else {
        // Simple array value
        if (!Array.isArray(parent[currentArrayKey])) {
          parent[currentArrayKey] = [];
        }
        parent[currentArrayKey].push(parseValue(value));
      }
      continue;
    }

    // Handle key-value pairs
    if (content.includes(':')) {
      const colonIdx = content.indexOf(':');
      const key = content.slice(0, colonIdx).trim();
      const rawValue = content.slice(colonIdx + 1).trim();

      // Pop stack to correct level
      while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
        stack.pop();
      }

      const parent = stack[stack.length - 1].obj;

      if (rawValue === '' || rawValue === '|' || rawValue === '>') {
        // Nested object or array coming
        parent[key] = {};
        stack.push({ obj: parent[key], indent });
        currentArrayKey = key;
      } else {
        // Direct value
        parent[key] = parseValue(rawValue);
        currentArrayKey = key;
      }
    }
  }

  return result;
}

// ============================================================================
// CONFIGURATION LOADING
// ============================================================================

/**
 * Resolve the path to providers.yaml.
 * Priority: project-specific > framework defaults.
 * @param {string} projectRoot - Project root directory
 * @returns {string|null} Path to providers.yaml or null
 */
export function resolveProvidersConfigPath(projectRoot) {
  // 1. Project-specific config
  const projectConfig = join(projectRoot, '.isdlc', 'providers.yaml');
  if (existsSync(projectConfig)) {
    return projectConfig;
  }

  // 2. Framework defaults (in hooks config)
  const frameworkConfig = join(projectRoot, 'src', 'claude', 'hooks', 'config', 'provider-defaults.yaml');
  if (existsSync(frameworkConfig)) {
    return frameworkConfig;
  }

  // 3. Alternative framework location
  const altFrameworkConfig = join(projectRoot, '.claude', 'hooks', 'config', 'provider-defaults.yaml');
  if (existsSync(altFrameworkConfig)) {
    return altFrameworkConfig;
  }

  return null;
}

/**
 * Load and parse providers configuration.
 * @param {string} projectRoot - Project root directory
 * @returns {object} Provider configuration object
 */
export function loadProvidersConfig(projectRoot) {
  const configPath = resolveProvidersConfigPath(projectRoot);

  if (configPath) {
    try {
      const content = readFileSync(configPath, 'utf8');
      return parseYaml(content);
    } catch {
      // Fall through to default
    }
  }

  return getMinimalDefaultConfig();
}

/**
 * Get minimal default configuration (Anthropic only).
 * @returns {object} Minimal config
 */
export function getMinimalDefaultConfig() {
  return {
    providers: {
      anthropic: {
        enabled: true,
        base_url: 'https://api.anthropic.com',
        api_key_env: 'ANTHROPIC_API_KEY',
        models: [
          { id: 'claude-sonnet-4-20250514', alias: 'sonnet', context_window: 200000 },
          { id: 'claude-opus-4-5-20251101', alias: 'opus', context_window: 200000 }
        ]
      }
    },
    defaults: {
      provider: 'anthropic',
      model: 'sonnet'
    },
    active_mode: 'quality',
    phase_routing: {},
    agent_overrides: {},
    constraints: {
      max_retries_per_provider: 2,
      health_check_timeout_ms: 5000,
      track_usage: false
    }
  };
}

/**
 * Check if providers.yaml exists in project.
 * @param {string} projectRoot - Project root directory
 * @returns {boolean} True if config exists
 */
export function hasProvidersConfig(projectRoot) {
  return existsSync(join(projectRoot, '.isdlc', 'providers.yaml'));
}
