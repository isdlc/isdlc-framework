/**
 * CJS Bridge for src/core/providers/ modules
 *
 * Allows CJS consumers (hooks, legacy scripts) to use the ESM provider modules.
 * Bridge-first-with-fallback: tries core ESM modules first, falls back to
 * inline implementations if unavailable.
 *
 * REQ-0127: Extract provider routing from provider-utils.cjs
 * Per ADR-CODEX-006: Core in ESM with CJS bridge.
 */

'use strict';

let _configModule;
let _routingModule;
let _usageModule;
let _modesModule;

// =========================================================================
// Lazy loaders
// =========================================================================

async function loadConfig() {
  if (!_configModule) _configModule = await import('../providers/config.js');
  return _configModule;
}

async function loadRouting() {
  if (!_routingModule) _routingModule = await import('../providers/routing.js');
  return _routingModule;
}

async function loadUsage() {
  if (!_usageModule) _usageModule = await import('../providers/usage.js');
  return _usageModule;
}

async function loadModes() {
  if (!_modesModule) _modesModule = await import('../providers/modes.js');
  return _modesModule;
}

// =========================================================================
// Sync preload cache
// =========================================================================

let _syncConfig = null;
let _syncRouting = null;
let _syncUsage = null;
let _syncModes = null;

// =========================================================================
// Config functions
// =========================================================================

function parseYaml(yamlContent) {
  if (_syncConfig) return _syncConfig.parseYaml(yamlContent);
  // Inline fallback not provided — parseYaml is complex
  return {};
}

function parseValue(value) {
  if (_syncConfig) return _syncConfig.parseValue(value);
  return value;
}

function resolveProvidersConfigPath(projectRoot) {
  if (_syncConfig) return _syncConfig.resolveProvidersConfigPath(projectRoot);
  return null;
}

function loadProvidersConfig(projectRoot) {
  if (_syncConfig) return _syncConfig.loadProvidersConfig(projectRoot);
  return getMinimalDefaultConfig();
}

function getMinimalDefaultConfig() {
  if (_syncConfig) return _syncConfig.getMinimalDefaultConfig();
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
    defaults: { provider: 'anthropic', model: 'sonnet' },
    active_mode: 'quality',
    phase_routing: {},
    agent_overrides: {},
    constraints: { max_retries_per_provider: 2, health_check_timeout_ms: 5000, track_usage: false }
  };
}

function hasProvidersConfig(projectRoot) {
  if (_syncConfig) return _syncConfig.hasProvidersConfig(projectRoot);
  return false;
}

// =========================================================================
// Routing functions
// =========================================================================

function parseProviderModel(input) {
  if (_syncRouting) return _syncRouting.parseProviderModel(input);
  // Inline fallback
  if (typeof input === 'object' && input !== null) return { provider: input.provider, model: input.model || null };
  if (typeof input === 'string') { const parts = input.split(':'); return { provider: parts[0], model: parts[1] || null }; }
  return { provider: null, model: null };
}

function isLocalProvider(providerName) {
  if (_syncRouting) return _syncRouting.isLocalProvider(providerName);
  return providerName === 'ollama' || providerName === 'local';
}

function getDefaultModel(config, providerName) {
  if (_syncRouting) return _syncRouting.getDefaultModel(config, providerName);
  const provider = config.providers?.[providerName];
  if (!provider?.models?.length) return null;
  return provider.models[0].alias || provider.models[0].id;
}

function resolveModelId(config, providerName, modelAlias) {
  if (_syncRouting) return _syncRouting.resolveModelId(config, providerName, modelAlias);
  const provider = config.providers?.[providerName];
  if (!provider?.models) return modelAlias;
  const model = provider.models.find(m => m.alias === modelAlias || m.id === modelAlias);
  return model?.id || modelAlias;
}

function selectProvider(config, state, context) {
  if (_syncRouting) return _syncRouting.selectProvider(config, state, context);
  return { provider: 'anthropic', model: 'sonnet', source: 'bridge_not_loaded' };
}

async function selectWithFallback(config, selection, resolveEnvVars) {
  const mod = await loadRouting();
  return mod.selectWithFallback(config, selection, resolveEnvVars);
}

async function checkProviderHealth(config, providerName, resolveEnvVars) {
  const mod = await loadRouting();
  return mod.checkProviderHealth(config, providerName, resolveEnvVars);
}

async function autoDetectProvider(config) {
  const mod = await loadRouting();
  return mod.autoDetectProvider(config);
}

// =========================================================================
// Usage functions
// =========================================================================

function trackUsage(config, state, selection, projectRoot) {
  if (_syncUsage) return _syncUsage.trackUsage(config, state, selection, projectRoot);
  // Silent no-op before preload
}

function getUsageStats(projectRoot, logRelPath, days) {
  if (_syncUsage) return _syncUsage.getUsageStats(projectRoot, logRelPath, days);
  return { total_calls: 0, by_provider: {}, by_phase: {}, by_source: {}, fallback_count: 0 };
}

// =========================================================================
// Mode functions
// =========================================================================

function getActiveMode(config) {
  if (_syncModes) return _syncModes.getActiveMode(config);
  return config?.active_mode || 'hybrid';
}

function setActiveMode(mode, projectRoot) {
  if (_syncModes) return _syncModes.setActiveMode(mode, projectRoot);
  return false;
}

function getAvailableModes(config) {
  if (_syncModes) return _syncModes.getAvailableModes(config);
  return {
    budget: { description: 'Minimize API costs' },
    quality: { description: 'Best models everywhere' },
    local: { description: 'No cloud calls (Ollama only)' },
    hybrid: { description: 'Smart routing by phase' }
  };
}

// =========================================================================
// Preload
// =========================================================================

async function preload() {
  const [c, r, u, m] = await Promise.all([
    loadConfig(), loadRouting(), loadUsage(), loadModes()
  ]);
  _syncConfig = c;
  _syncRouting = r;
  _syncUsage = u;
  _syncModes = m;
}

module.exports = {
  // Config
  parseYaml,
  parseValue,
  resolveProvidersConfigPath,
  loadProvidersConfig,
  getMinimalDefaultConfig,
  hasProvidersConfig,

  // Routing
  parseProviderModel,
  isLocalProvider,
  getDefaultModel,
  resolveModelId,
  selectProvider,
  selectWithFallback,
  checkProviderHealth,
  autoDetectProvider,

  // Usage
  trackUsage,
  getUsageStats,

  // Modes
  getActiveMode,
  setActiveMode,
  getAvailableModes,

  // Optimization
  preload
};
