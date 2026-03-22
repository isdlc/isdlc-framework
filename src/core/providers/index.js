/**
 * Providers Module — Re-exports
 *
 * REQ-0127: Extract provider routing from provider-utils.cjs
 *
 * @module src/core/providers
 */

export {
  parseYaml,
  parseValue,
  resolveProvidersConfigPath,
  loadProvidersConfig,
  getMinimalDefaultConfig,
  hasProvidersConfig
} from './config.js';

export {
  parseProviderModel,
  isLocalProvider,
  getDefaultModel,
  resolveModelId,
  selectProvider,
  selectWithFallback,
  checkProviderHealth,
  autoDetectProvider
} from './routing.js';

export {
  trackUsage,
  getUsageStats
} from './usage.js';

export {
  getActiveMode,
  setActiveMode,
  getAvailableModes
} from './modes.js';
