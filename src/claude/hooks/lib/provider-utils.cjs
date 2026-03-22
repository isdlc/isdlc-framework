/**
 * iSDLC Multi-Provider Support - Provider Utilities
 * ==================================================
 * Shared functions for LLM provider configuration, health checking,
 * and environment variable management.
 *
 * Version: 1.0.0
 * Supports: Anthropic, Ollama, OpenRouter, Custom endpoints
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const { getProjectRoot, readState, writeState } = require('./common.cjs');

// ============================================================================
// Core Bridge (REQ-0127): Lazy-load the extracted core providers bridge.
// When available, functions delegate to src/core/providers/ (the canonical
// implementation). Falls back to the inline code below when the bridge
// is unreachable (e.g., when provider-utils.cjs is run standalone).
// ============================================================================
let _providersBridge;
function _getProvidersBridge() {
    if (_providersBridge !== undefined) return _providersBridge;
    try {
        const bridgePath = path.resolve(__dirname, '..', '..', '..', 'core', 'bridge', 'providers.cjs');
        if (fs.existsSync(bridgePath)) {
            _providersBridge = require(bridgePath);
        } else {
            _providersBridge = null;
        }
    } catch (e) {
        _providersBridge = null;
    }
    return _providersBridge;
}

// ============================================================================
// YAML PARSING (Minimal implementation - no external dependency)
// ============================================================================

/**
 * Simple YAML parser for provider config files.
 * Handles basic YAML features: objects, arrays, strings, numbers, booleans.
 * Does NOT handle: anchors, aliases, multi-line strings, complex types.
 * @param {string} yamlContent - YAML content string
 * @returns {object} Parsed object
 */
function parseYaml(yamlContent) {
    const lines = yamlContent.split('\n');
    const result = {};
    const stack = [{ obj: result, indent: -1 }];
    let currentArray = null;
    let currentArrayKey = null;
    let currentArrayIndent = -1;

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
                    // Simple key-value, start a new object
                    const newObj = { [itemKey]: itemValue };
                    parent[currentArrayKey].push(newObj);
                    stack.push({ obj: newObj, indent: indent });
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
                stack.push({ obj: parent[key], indent: indent });
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

/**
 * Parse a YAML value string into appropriate JS type
 * @param {string} value - Raw value string
 * @returns {any} Parsed value
 */
function parseValue(value) {
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
        } catch (e) {
            // Try parsing as comma-separated
            return value.slice(1, -1).split(',').map(v => parseValue(v.trim()));
        }
    }

    return value;
}

// ============================================================================
// CONFIGURATION LOADING
// ============================================================================

/**
 * Resolve the path to providers.yaml
 * Priority: project-specific > framework defaults
 * @returns {string|null} Path to providers.yaml or null
 */
function resolveProvidersConfigPath() {
    const projectRoot = getProjectRoot();

    // 1. Project-specific config
    const projectConfig = path.join(projectRoot, '.isdlc', 'providers.yaml');
    if (fs.existsSync(projectConfig)) {
        return projectConfig;
    }

    // 2. Framework defaults (in hooks config)
    const frameworkConfig = path.join(projectRoot, 'src', 'claude', 'hooks', 'config', 'provider-defaults.yaml');
    if (fs.existsSync(frameworkConfig)) {
        return frameworkConfig;
    }

    // 3. Alternative framework location
    const altFrameworkConfig = path.join(projectRoot, '.claude', 'hooks', 'config', 'provider-defaults.yaml');
    if (fs.existsSync(altFrameworkConfig)) {
        return altFrameworkConfig;
    }

    return null;
}

/**
 * Load and parse providers configuration
 * @returns {object} Provider configuration object
 */
function loadProvidersConfig() {
    const configPath = resolveProvidersConfigPath();

    if (configPath) {
        try {
            const content = fs.readFileSync(configPath, 'utf8');
            return parseYaml(content);
        } catch (err) {
            console.error(`[provider-utils] Failed to load config: ${err.message}`);
        }
    }

    // Return minimal default configuration
    return getMinimalDefaultConfig();
}

/**
 * Get minimal default configuration (Anthropic only)
 * @returns {object} Minimal config
 */
function getMinimalDefaultConfig() {
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
 * Check if providers.yaml exists in project
 * @returns {boolean} True if config exists
 */
function hasProvidersConfig() {
    const projectRoot = getProjectRoot();
    return fs.existsSync(path.join(projectRoot, '.isdlc', 'providers.yaml'));
}

// ============================================================================
// AUTO-DETECTION
// ============================================================================

/**
 * Auto-detect the active LLM provider using a tiered strategy.
 * Called by selectProvider() when providers.yaml exists and no
 * explicit provider override is active.
 *
 * Detection priority (first match wins):
 *   1. Environment variable check (synchronous, zero I/O)
 *   2. Config file check (synchronous, already loaded)
 *   3. Health probe (async, up to 2000ms timeout)
 *   4. Fallback to 'anthropic'
 *
 * Traces: REQ-006, NFR-001, NFR-002, NFR-003, ADR-0001, ADR-0004
 *
 * @param {object} config - Loaded providers config (from loadProvidersConfig())
 * @returns {Promise<{provider: string, healthy: boolean, source: string, reason?: string}>}
 */
async function autoDetectProvider(config) {
    try {
        // Tier 1: Environment variable check (synchronous, zero I/O)
        const baseUrl = process.env.ANTHROPIC_BASE_URL;
        if (baseUrl && baseUrl.toLowerCase().includes('localhost:11434')) {
            return { provider: 'ollama', healthy: true, source: 'env_var' };
        }

        if (process.env.ANTHROPIC_API_KEY && !baseUrl) {
            return { provider: 'anthropic', healthy: true, source: 'env_var' };
        }

        // Tier 2: Config file check (synchronous -- config already loaded)
        const configProvider = config?.defaults?.provider;

        if (configProvider && configProvider !== 'anthropic') {
            // Tier 3: Health probe for non-Anthropic providers
            if (configProvider === 'ollama') {
                try {
                    const health = await checkProviderHealth(config, 'ollama');
                    return {
                        provider: 'ollama',
                        healthy: health.healthy,
                        source: 'config_file',
                        ...(health.healthy ? {} : { reason: health.reason || 'Health check failed' })
                    };
                } catch (healthErr) {
                    // Health probe failed -- fail-open to anthropic (Article X)
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
    } catch (err) {
        // Catch-all: any exception returns Anthropic default (fail-open, ADR-0004)
        return { provider: 'anthropic', healthy: true, source: 'default_fallback' };
    }
}

// ============================================================================
// PROVIDER SELECTION
// ============================================================================

/**
 * Parse provider:model string format
 * @param {string|object} input - "provider:model" string or {provider, model} object
 * @returns {{provider: string, model: string|null}} Parsed provider and model
 */
function parseProviderModel(input) {
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
 * Check if a provider is local (no network calls)
 * @param {string} providerName - Provider name
 * @returns {boolean} True if local
 */
function isLocalProvider(providerName) {
    return providerName === 'ollama' || providerName === 'local';
}

/**
 * Get the default model for a provider
 * @param {object} config - Full config object
 * @param {string} providerName - Provider name
 * @returns {string|null} Default model alias or null
 */
function getDefaultModel(config, providerName) {
    const provider = config.providers?.[providerName];
    if (!provider?.models?.length) return null;
    return provider.models[0].alias || provider.models[0].id;
}

/**
 * Resolve model alias to full model ID
 * @param {object} config - Full config object
 * @param {string} providerName - Provider name
 * @param {string} modelAlias - Model alias (e.g., "sonnet")
 * @returns {string} Full model ID
 */
function resolveModelId(config, providerName, modelAlias) {
    const provider = config.providers?.[providerName];
    if (!provider?.models) return modelAlias;

    const model = provider.models.find(m =>
        m.alias === modelAlias || m.id === modelAlias
    );

    return model?.id || modelAlias;
}

/**
 * Select provider based on configuration rules
 * @param {object} config - Provider configuration
 * @param {object} state - Project state
 * @param {object} context - Selection context {subagent_type, prompt}
 * @returns {object} Selection result {provider, model, source, rationale, fallback}
 */
function selectProvider(config, state, context) {
    // Bridge-first delegation (REQ-0127): try core providers if loaded
    const bridge = _getProvidersBridge();
    if (bridge && bridge._syncRouting) {
        try { return bridge.selectProvider(config, state, context); } catch (e) { /* fallback to inline */ }
    }
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
            // Find first non-local provider in fallback
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

        // Local mode - force local provider
        if (activeMode === 'local') {
            return {
                provider: 'ollama',
                model: mode.default_model || 'qwen-coder',
                source: 'mode_local',
                warning: mode.warning
            };
        }

        // Budget mode - use local unless phase requires cloud
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

        // Quality mode - always use best
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
 * Check if a provider is healthy (reachable)
 * @param {object} config - Full config object
 * @param {string} providerName - Provider name to check
 * @returns {Promise<{healthy: boolean, reason?: string, latency_ms?: number}>}
 */
async function checkProviderHealth(config, providerName) {
    const provider = config.providers?.[providerName];

    if (!provider) {
        return { healthy: false, reason: 'Provider not configured' };
    }

    if (provider.enabled === false) {
        return { healthy: false, reason: 'Provider disabled' };
    }

    // Check if API key is required and present
    if (provider.api_key_env) {
        const apiKey = process.env[provider.api_key_env];
        if (!apiKey && providerName !== 'ollama') {
            return { healthy: false, reason: `Missing ${provider.api_key_env} environment variable` };
        }
    }

    // Health check endpoint
    const healthCheck = provider.health_check;
    if (!healthCheck?.endpoint) {
        // No health check defined, assume healthy if config exists
        return { healthy: true, reason: 'No health check defined' };
    }

    const baseUrl = resolveEnvVars(provider.base_url);
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
 * Select provider with fallback on health check failure
 * @param {object} config - Full config object
 * @param {object} selection - Initial provider selection
 * @returns {Promise<object>} Final selection with health status
 */
async function selectWithFallback(config, selection) {
    // Check primary provider health
    const health = await checkProviderHealth(config, selection.provider);

    if (health.healthy) {
        return { ...selection, healthy: true, latency_ms: health.latency_ms };
    }

    debugLog(`Primary provider ${selection.provider} unhealthy: ${health.reason}`);

    // Build fallback chain
    const fallbackChain = selection.fallback || config.defaults?.fallback_chain || [];

    for (const fallback of fallbackChain) {
        const { provider, model } = parseProviderModel(fallback);
        const fallbackHealth = await checkProviderHealth(config, provider);

        if (fallbackHealth.healthy) {
            debugLog(`Falling back to ${provider}:${model}`);
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

        debugLog(`Fallback ${provider} also unhealthy: ${fallbackHealth.reason}`);
    }

    // All providers failed
    return {
        ...selection,
        healthy: false,
        error: `All providers unavailable. Primary (${selection.provider}): ${health.reason}`
    };
}

// ============================================================================
// ENVIRONMENT VARIABLE MANAGEMENT
// ============================================================================

/**
 * Resolve environment variable placeholders in a string
 * @param {string} str - String with ${VAR} placeholders
 * @returns {string} Resolved string
 */
function resolveEnvVars(str) {
    if (!str || typeof str !== 'string') return str;
    return str.replace(/\$\{([^}]+)\}/g, (_, name) => process.env[name] || '');
}

/**
 * Get environment variable overrides for a provider selection
 * @param {object} config - Full config object
 * @param {object} selection - Provider selection {provider, model}
 * @returns {object} Environment variables to set
 */
function getEnvironmentOverrides(config, selection) {
    const provider = config.providers?.[selection.provider];
    if (!provider) {
        return {};
    }

    const overrides = {};

    // Apply provider-specific environment mappings
    const envMapping = config.environment?.[selection.provider];
    if (envMapping) {
        for (const [key, template] of Object.entries(envMapping)) {
            if (template === '${api_key}') {
                overrides[key] = provider.api_key || process.env[provider.api_key_env] || '';
            } else if (template === '${base_url}') {
                overrides[key] = resolveEnvVars(provider.base_url);
            } else {
                overrides[key] = resolveEnvVars(template);
            }
        }
    } else {
        // Default environment setup based on provider type
        const apiStyle = provider.api_style || 'anthropic';

        switch (selection.provider) {
            case 'anthropic':
                overrides['ANTHROPIC_API_KEY'] = process.env[provider.api_key_env] || process.env.ANTHROPIC_API_KEY || '';
                if (provider.base_url && provider.base_url !== 'https://api.anthropic.com') {
                    overrides['ANTHROPIC_BASE_URL'] = resolveEnvVars(provider.base_url);
                }
                break;

            case 'ollama':
                overrides['ANTHROPIC_API_KEY'] = '';
                overrides['ANTHROPIC_AUTH_TOKEN'] = provider.auth_token || 'ollama';
                overrides['ANTHROPIC_BASE_URL'] = resolveEnvVars(provider.base_url) || 'http://localhost:11434';
                break;

            case 'openrouter':
                overrides['ANTHROPIC_API_KEY'] = process.env[provider.api_key_env] || process.env.OPENROUTER_API_KEY || '';
                overrides['ANTHROPIC_BASE_URL'] = resolveEnvVars(provider.base_url) || 'https://openrouter.ai/api/v1';
                overrides['HTTP_REFERER'] = 'https://github.com/isdlc-framework';
                overrides['X_TITLE'] = 'iSDLC Framework';
                break;

            case 'groq':
                // Groq uses OpenAI-compatible API
                overrides['ANTHROPIC_API_KEY'] = process.env[provider.api_key_env] || process.env.GROQ_API_KEY || '';
                overrides['ANTHROPIC_BASE_URL'] = resolveEnvVars(provider.base_url) || 'https://api.groq.com/openai/v1';
                break;

            case 'together':
                // Together AI uses OpenAI-compatible API
                overrides['ANTHROPIC_API_KEY'] = process.env[provider.api_key_env] || process.env.TOGETHER_API_KEY || '';
                overrides['ANTHROPIC_BASE_URL'] = resolveEnvVars(provider.base_url) || 'https://api.together.xyz/v1';
                break;

            case 'google':
                // Google AI Studio / Gemini
                overrides['ANTHROPIC_API_KEY'] = process.env[provider.api_key_env] || process.env.GOOGLE_AI_API_KEY || '';
                overrides['ANTHROPIC_BASE_URL'] = resolveEnvVars(provider.base_url) || 'https://generativelanguage.googleapis.com/v1beta';
                break;

            case 'mistral':
                // Mistral AI uses OpenAI-compatible API
                overrides['ANTHROPIC_API_KEY'] = process.env[provider.api_key_env] || process.env.MISTRAL_API_KEY || '';
                overrides['ANTHROPIC_BASE_URL'] = resolveEnvVars(provider.base_url) || 'https://api.mistral.ai/v1';
                break;

            case 'custom':
            default:
                overrides['ANTHROPIC_API_KEY'] = process.env[provider.api_key_env] || '';
                overrides['ANTHROPIC_BASE_URL'] = resolveEnvVars(provider.base_url);
                break;
        }
    }

    // Add model override
    const modelId = resolveModelId(config, selection.provider, selection.model);
    if (modelId) {
        overrides['CLAUDE_MODEL'] = modelId;
    }

    return overrides;
}

// ============================================================================
// USAGE TRACKING
// ============================================================================

/**
 * Log provider usage to usage-log.jsonl
 * @param {object} config - Full config object
 * @param {object} state - Project state
 * @param {object} selection - Provider selection
 */
function trackUsage(config, state, selection) {
    if (!config.constraints?.track_usage) {
        return;
    }

    const projectRoot = getProjectRoot();
    const logPath = path.join(
        projectRoot,
        config.constraints.usage_log_path || '.isdlc/usage-log.jsonl'
    );

    const entry = {
        timestamp: new Date().toISOString(),
        provider: selection.provider,
        model: selection.model,
        phase: state?.current_phase,
        source: selection.source,
        rationale: selection.rationale,
        fallback_used: selection.originalProvider ? true : false,
        original_provider: selection.originalProvider || null
    };

    try {
        fs.mkdirSync(path.dirname(logPath), { recursive: true });
        fs.appendFileSync(logPath, JSON.stringify(entry) + '\n');
    } catch (err) {
        debugLog(`Failed to log usage: ${err.message}`);
    }

    // Update state with last provider selection
    if (state) {
        state.last_provider_selection = {
            provider: selection.provider,
            model: selection.model,
            source: selection.source,
            timestamp: entry.timestamp
        };
        writeState(state);
    }
}

/**
 * Read usage statistics from log file
 * @param {number} [days=7] - Number of days to include
 * @returns {object} Usage statistics
 */
function getUsageStats(days = 7) {
    const projectRoot = getProjectRoot();
    const config = loadProvidersConfig();
    const logPath = path.join(
        projectRoot,
        config.constraints?.usage_log_path || '.isdlc/usage-log.jsonl'
    );

    if (!fs.existsSync(logPath)) {
        return { total_calls: 0, by_provider: {}, by_phase: {} };
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const stats = {
        total_calls: 0,
        by_provider: {},
        by_phase: {},
        by_source: {},
        fallback_count: 0
    };

    try {
        const content = fs.readFileSync(logPath, 'utf8');
        const lines = content.trim().split('\n').filter(l => l);

        for (const line of lines) {
            try {
                const entry = JSON.parse(line);
                const entryDate = new Date(entry.timestamp);

                if (entryDate < cutoffDate) continue;

                stats.total_calls++;
                stats.by_provider[entry.provider] = (stats.by_provider[entry.provider] || 0) + 1;
                stats.by_phase[entry.phase] = (stats.by_phase[entry.phase] || 0) + 1;
                stats.by_source[entry.source] = (stats.by_source[entry.source] || 0) + 1;

                if (entry.fallback_used) {
                    stats.fallback_count++;
                }
            } catch (e) {
                // Skip malformed lines
            }
        }
    } catch (err) {
        debugLog(`Failed to read usage log: ${err.message}`);
    }

    return stats;
}

// ============================================================================
// MODE MANAGEMENT
// ============================================================================

/**
 * Get the current active mode
 * @returns {string} Active mode name
 */
function getActiveMode() {
    const config = loadProvidersConfig();
    return config.active_mode || 'hybrid';
}

/**
 * Set the active mode in providers.yaml
 * @param {string} mode - Mode name (budget, quality, local, hybrid)
 * @returns {boolean} Success
 */
function setActiveMode(mode) {
    const projectRoot = getProjectRoot();
    const configPath = path.join(projectRoot, '.isdlc', 'providers.yaml');

    if (!fs.existsSync(configPath)) {
        console.error('[provider-utils] No providers.yaml found. Run /provider init first.');
        return false;
    }

    try {
        let content = fs.readFileSync(configPath, 'utf8');

        // Simple regex replacement for active_mode
        if (content.includes('active_mode:')) {
            content = content.replace(/active_mode:\s*["']?\w+["']?/, `active_mode: "${mode}"`);
        } else {
            // Add active_mode at the end
            content += `\nactive_mode: "${mode}"\n`;
        }

        fs.writeFileSync(configPath, content);
        return true;
    } catch (err) {
        console.error(`[provider-utils] Failed to update mode: ${err.message}`);
        return false;
    }
}

/**
 * Get available modes from config
 * @returns {object} Modes configuration
 */
function getAvailableModes() {
    const config = loadProvidersConfig();
    return config.modes || {
        budget: { description: 'Minimize API costs' },
        quality: { description: 'Best models everywhere' },
        local: { description: 'No cloud calls (Ollama only)' },
        hybrid: { description: 'Smart routing by phase' }
    };
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Debug log (only when ISDLC_PROVIDER_DEBUG=true)
 * @param {...any} args - Arguments to log
 */
function debugLog(...args) {
    if (process.env.ISDLC_PROVIDER_DEBUG === 'true') {
        console.error('[provider-utils]', ...args);
    }
}

/**
 * Get provider status summary for all configured providers
 * @returns {Promise<Array<{name: string, enabled: boolean, healthy: boolean, latency_ms?: number, reason?: string}>>}
 */
async function getProvidersStatus() {
    const config = loadProvidersConfig();
    const results = [];

    for (const [name, provider] of Object.entries(config.providers || {})) {
        const health = await checkProviderHealth(config, name);
        results.push({
            name,
            enabled: provider.enabled !== false,
            base_url: resolveEnvVars(provider.base_url),
            healthy: health.healthy,
            latency_ms: health.latency_ms,
            reason: health.reason
        });
    }

    return results;
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
    // Configuration
    loadProvidersConfig,
    hasProvidersConfig,
    resolveProvidersConfigPath,
    getMinimalDefaultConfig,

    // Provider selection
    selectProvider,
    selectWithFallback,
    parseProviderModel,
    isLocalProvider,
    getDefaultModel,
    resolveModelId,

    // Auto-detection
    autoDetectProvider,

    // Health checking
    checkProviderHealth,
    getProvidersStatus,

    // Environment
    getEnvironmentOverrides,
    resolveEnvVars,

    // Usage tracking
    trackUsage,
    getUsageStats,

    // Mode management
    getActiveMode,
    setActiveMode,
    getAvailableModes,

    // Utilities
    debugLog,
    parseYaml
};
