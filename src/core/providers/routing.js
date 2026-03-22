/**
 * Provider Routing — Core module
 * ===============================
 * Provider selection, fallback, model resolution, health checking,
 * and auto-detection.
 *
 * Extracted from src/claude/hooks/lib/provider-utils.cjs (REQ-0127).
 * Per ADR-CODEX-006: Core in ESM, CJS bridge for hooks.
 *
 * Traces: REQ-006, NFR-001, NFR-002, NFR-003, ADR-0001, ADR-0004
 *
 * @module src/core/providers/routing
 */

import http from 'node:http';
import https from 'node:https';

// ============================================================================
// PROVIDER PARSING
// ============================================================================

/**
 * Parse provider:model string format.
 * @param {string|object} input - "provider:model" string or {provider, model} object
 * @returns {{provider: string, model: string|null}} Parsed provider and model
 */
export function parseProviderModel(input) {
  if (typeof input === 'object' && input !== null) {
    return { provider: input.provider, model: input.model || null };
  }

  if (typeof input === 'string') {
    const parts = input.split(':');
    return {
      provider: parts[0],
      model: parts[1] || null
    };
  }

  return { provider: null, model: null };
}

/**
 * Check if a provider is local (no network calls).
 * @param {string} providerName - Provider name
 * @returns {boolean} True if local
 */
export function isLocalProvider(providerName) {
  return providerName === 'ollama' || providerName === 'local';
}

/**
 * Get the default model for a provider.
 * @param {object} config - Full config object
 * @param {string} providerName - Provider name
 * @returns {string|null} Default model alias or null
 */
export function getDefaultModel(config, providerName) {
  const provider = config.providers?.[providerName];
  if (!provider?.models?.length) return null;
  return provider.models[0].alias || provider.models[0].id;
}

/**
 * Resolve model alias to full model ID.
 * @param {object} config - Full config object
 * @param {string} providerName - Provider name
 * @param {string} modelAlias - Model alias (e.g., "sonnet")
 * @returns {string} Full model ID
 */
export function resolveModelId(config, providerName, modelAlias) {
  const provider = config.providers?.[providerName];
  if (!provider?.models) return modelAlias;

  const model = provider.models.find(m =>
    m.alias === modelAlias || m.id === modelAlias
  );

  return model?.id || modelAlias;
}

// ============================================================================
// PROVIDER SELECTION
// ============================================================================

/**
 * Select provider based on configuration rules.
 * @param {object} config - Provider configuration
 * @param {object} state - Project state
 * @param {object} context - Selection context {subagent_type, prompt}
 * @returns {object} Selection result {provider, model, source, rationale, fallback}
 */
export function selectProvider(config, state, context) {
  const { subagent_type } = context;
  // BUG-0005 (AC-03f): prefer active_workflow.current_phase over top-level
  const currentPhase = state?.active_workflow?.current_phase || state?.current_phase || 'unknown';
  const activeMode = config.active_mode || 'hybrid';

  // 1. Check CLI override (environment variables)
  const cliProvider = process.env.ISDLC_PROVIDER_OVERRIDE;
  const cliModel = process.env.ISDLC_MODEL_OVERRIDE;
  if (cliProvider) {
    return {
      provider: cliProvider,
      model: cliModel || getDefaultModel(config, cliProvider),
      source: 'cli_override'
    };
  }

  // 2. Check agent-specific override
  if (config.agent_overrides && config.agent_overrides[subagent_type]) {
    const override = config.agent_overrides[subagent_type];
    return {
      provider: override.provider,
      model: override.model || getDefaultModel(config, override.provider),
      source: 'agent_override',
      rationale: override.rationale
    };
  }

  // 3. Check phase routing (for hybrid mode)
  if (activeMode === 'hybrid' && config.phase_routing?.[currentPhase]) {
    const routing = config.phase_routing[currentPhase];

    // Check if local is explicitly forbidden for this phase
    if (routing.local_override === false && isLocalProvider(routing.provider)) {
      const cloudFallback = routing.fallback?.find(f => {
        const { provider } = parseProviderModel(f);
        return !isLocalProvider(provider);
      });

      if (cloudFallback) {
        const { provider, model } = parseProviderModel(cloudFallback);
        return {
          provider,
          model: model || getDefaultModel(config, provider),
          source: 'phase_routing_cloud_required',
          rationale: routing.rationale,
          fallback: routing.fallback
        };
      }
    }

    return {
      provider: routing.provider,
      model: routing.model || getDefaultModel(config, routing.provider),
      source: 'phase_routing',
      rationale: routing.rationale,
      fallback: routing.fallback
    };
  }

  // 4. Check mode-specific defaults
  if (config.modes?.[activeMode]) {
    const mode = config.modes[activeMode];

    if (activeMode === 'local') {
      return {
        provider: 'ollama',
        model: mode.default_model || 'qwen-coder',
        source: 'mode_local',
        warning: mode.warning
      };
    }

    if (activeMode === 'budget') {
      const requiresCloud = mode.cloud_phases_only?.includes(currentPhase);
      if (!requiresCloud) {
        return {
          provider: 'ollama',
          model: 'qwen-coder',
          source: 'mode_budget'
        };
      }
    }

    if (activeMode === 'quality') {
      return {
        provider: mode.default_provider || 'anthropic',
        model: mode.default_model || 'opus',
        source: 'mode_quality'
      };
    }
  }

  // 5. Global defaults
  return {
    provider: config.defaults?.provider || 'anthropic',
    model: config.defaults?.model || 'sonnet',
    source: 'global_default',
    fallback: config.defaults?.fallback_chain
  };
}

// ============================================================================
// HEALTH CHECKING
// ============================================================================

/**
 * Check if a provider is healthy (reachable).
 * @param {object} config - Full config object
 * @param {string} providerName - Provider name to check
 * @param {function} [resolveEnvVars] - Optional env var resolver
 * @returns {Promise<{healthy: boolean, reason?: string, latency_ms?: number}>}
 */
export async function checkProviderHealth(config, providerName, resolveEnvVars) {
  const provider = config.providers?.[providerName];

  if (!provider) {
    return { healthy: false, reason: 'Provider not configured' };
  }

  if (provider.enabled === false) {
    return { healthy: false, reason: 'Provider disabled' };
  }

  if (provider.api_key_env) {
    const apiKey = process.env[provider.api_key_env];
    if (!apiKey && providerName !== 'ollama') {
      return { healthy: false, reason: `Missing ${provider.api_key_env} environment variable` };
    }
  }

  const healthCheck = provider.health_check;
  if (!healthCheck?.endpoint) {
    return { healthy: true, reason: 'No health check defined' };
  }

  const _resolveEnvVars = resolveEnvVars || ((s) => s);
  const baseUrl = _resolveEnvVars(provider.base_url);
  const timeout = healthCheck.timeout_ms || config.constraints?.health_check_timeout_ms || 5000;

  return new Promise((resolve) => {
    const startTime = Date.now();

    try {
      const url = new URL(healthCheck.endpoint, baseUrl);
      const protocol = url.protocol === 'https:' ? https : http;

      const req = protocol.get(url.href, { timeout }, (res) => {
        const latency = Date.now() - startTime;
        resolve({
          healthy: res.statusCode >= 200 && res.statusCode < 400,
          statusCode: res.statusCode,
          latency_ms: latency
        });
      });

      req.on('error', (err) => {
        resolve({ healthy: false, reason: err.message });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ healthy: false, reason: `Timeout after ${timeout}ms` });
      });
    } catch (err) {
      resolve({ healthy: false, reason: `Invalid URL: ${err.message}` });
    }
  });
}

/**
 * Select provider with fallback on health check failure.
 * @param {object} config - Full config object
 * @param {object} selection - Initial provider selection
 * @param {function} [resolveEnvVars] - Optional env var resolver
 * @returns {Promise<object>} Final selection with health status
 */
export async function selectWithFallback(config, selection, resolveEnvVars) {
  const health = await checkProviderHealth(config, selection.provider, resolveEnvVars);

  if (health.healthy) {
    return { ...selection, healthy: true, latency_ms: health.latency_ms };
  }

  const fallbackChain = selection.fallback || config.defaults?.fallback_chain || [];

  for (const fallback of fallbackChain) {
    const { provider, model } = parseProviderModel(fallback);
    const fallbackHealth = await checkProviderHealth(config, provider, resolveEnvVars);

    if (fallbackHealth.healthy) {
      return {
        ...selection,
        provider,
        model: model || getDefaultModel(config, provider),
        source: `fallback_from_${selection.provider}`,
        originalProvider: selection.provider,
        originalReason: health.reason,
        healthy: true,
        latency_ms: fallbackHealth.latency_ms
      };
    }
  }

  return {
    ...selection,
    healthy: false,
    error: `All providers unavailable. Primary (${selection.provider}): ${health.reason}`
  };
}

// ============================================================================
// AUTO-DETECTION
// ============================================================================

/**
 * Auto-detect the active LLM provider using a tiered strategy.
 *
 * Detection priority (first match wins):
 *   1. Environment variable check (synchronous, zero I/O)
 *   2. Config file check (synchronous, already loaded)
 *   3. Health probe (async, up to 2000ms timeout)
 *   4. Fallback to 'anthropic'
 *
 * @param {object} config - Loaded providers config
 * @returns {Promise<{provider: string, healthy: boolean, source: string, reason?: string}>}
 */
export async function autoDetectProvider(config) {
  try {
    // Tier 1: Environment variable check
    const baseUrl = process.env.ANTHROPIC_BASE_URL;
    if (baseUrl && baseUrl.toLowerCase().includes('localhost:11434')) {
      return { provider: 'ollama', healthy: true, source: 'env_var' };
    }

    if (process.env.ANTHROPIC_API_KEY && !baseUrl) {
      return { provider: 'anthropic', healthy: true, source: 'env_var' };
    }

    // Tier 2: Config file check
    const configProvider = config?.defaults?.provider;

    if (configProvider && configProvider !== 'anthropic') {
      if (configProvider === 'ollama') {
        try {
          const health = await checkProviderHealth(config, 'ollama');
          return {
            provider: 'ollama',
            healthy: health.healthy,
            source: 'config_file',
            ...(health.healthy ? {} : { reason: health.reason || 'Health check failed' })
          };
        } catch {
          return { provider: 'anthropic', healthy: true, source: 'default_fallback' };
        }
      }
      return { provider: configProvider, healthy: true, source: 'config_file' };
    }

    if (configProvider === 'anthropic') {
      return { provider: 'anthropic', healthy: true, source: 'config_file' };
    }

    // Tier 4: Fallback to Anthropic (Article X -- fail-safe default)
    return { provider: 'anthropic', healthy: true, source: 'default_fallback' };
  } catch {
    return { provider: 'anthropic', healthy: true, source: 'default_fallback' };
  }
}
