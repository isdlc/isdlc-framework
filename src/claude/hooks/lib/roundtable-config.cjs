'use strict';

/**
 * Roundtable Config Reader Module (M2) -- REQ-0047
 * ================================================
 * Reads `.isdlc/roundtable.yaml` and returns validated config.
 *
 * Exported functions:
 * - readRoundtableConfig(projectRoot, overrides?) -> RoundtableConfig
 * - formatConfigSection(config) -> string
 *
 * @module roundtable-config
 * @traces FR-004, FR-005, FR-011
 */

const fs = require('fs');
const path = require('path');

const VALID_VERBOSITY = ['conversational', 'bulleted', 'silent'];

/**
 * @typedef {Object} RoundtableConfig
 * @property {string} verbosity - 'conversational' | 'bulleted' | 'silent'
 * @property {string[]} default_personas - Always-include persona list
 * @property {string[]} disabled_personas - Never-propose persona list
 */

/**
 * Default config values when no file exists or fields are missing.
 * @returns {RoundtableConfig}
 */
function defaultConfig() {
    return {
        verbosity: 'bulleted',
        default_personas: [],
        disabled_personas: []
    };
}

/**
 * Minimal YAML parser for the roundtable config format.
 * Handles key-value pairs and arrays. Returns null on parse failure.
 *
 * @param {string} content - YAML file content
 * @returns {object|null}
 */
function parseYaml(content) {
    if (!content || typeof content !== 'string') return null;

    try {
        const result = {};
        const lines = content.split('\n');
        let currentKey = null;
        let currentArray = null;

        for (const line of lines) {
            // Skip comments and empty lines at top level
            if (line.match(/^\s*#/) || line.trim() === '') {
                if (currentKey && currentArray) {
                    result[currentKey] = currentArray;
                    currentKey = null;
                    currentArray = null;
                }
                continue;
            }

            // Key-value pair
            const kvMatch = line.match(/^([\w][\w_-]*):\s*(.*)$/);
            if (kvMatch) {
                // Flush previous array
                if (currentKey && currentArray) {
                    result[currentKey] = currentArray;
                }

                const [, key, value] = kvMatch;
                const trimmed = value.replace(/#.*$/, '').trim(); // strip inline comments

                if (trimmed === '' || trimmed === '[]') {
                    if (trimmed === '[]') {
                        result[key] = [];
                        currentKey = null;
                        currentArray = null;
                    } else {
                        currentKey = key;
                        currentArray = [];
                    }
                } else if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
                    // Inline array
                    result[key] = trimmed.slice(1, -1).split(',')
                        .map(s => s.trim().replace(/^["']|["']$/g, ''))
                        .filter(Boolean);
                    currentKey = null;
                    currentArray = null;
                } else {
                    result[key] = trimmed.replace(/^["']|["']$/g, '');
                    currentKey = null;
                    currentArray = null;
                }
            } else if (currentKey && line.match(/^\s+-\s+/)) {
                const item = line.replace(/^\s+-\s+/, '').replace(/^["']|["']$/g, '').trim();
                if (item) currentArray.push(item);
            } else if (currentKey && line.match(/^\s+-\s*/)) {
                const item = line.replace(/^\s+-\s*/, '').replace(/^["']|["']$/g, '').trim();
                if (item) currentArray.push(item);
            }
        }

        // Flush any remaining array
        if (currentKey && currentArray) {
            result[currentKey] = currentArray;
        }

        return result;
    } catch (_) {
        return null;
    }
}

/**
 * Read and validate roundtable configuration.
 *
 * @param {string} projectRoot - Absolute path to project root
 * @param {{ verbose?: boolean, silent?: boolean, personas?: string }} [overrides] - Per-analysis flags
 * @returns {RoundtableConfig}
 * @traces FR-005, FR-011
 */
function readRoundtableConfig(projectRoot, overrides) {
    const configPath = path.join(projectRoot, '.isdlc', 'roundtable.yaml');
    const defaults = defaultConfig();
    let config = { ...defaults };

    // Read config file
    try {
        if (fs.existsSync(configPath)) {
            const content = fs.readFileSync(configPath, 'utf8');
            const parsed = parseYaml(content);

            if (parsed) {
                // Validate verbosity
                if (parsed.verbosity && typeof parsed.verbosity === 'string' && VALID_VERBOSITY.includes(parsed.verbosity)) {
                    config.verbosity = parsed.verbosity;
                }
                // else keep default 'bulleted'

                // Validate default_personas
                if (Array.isArray(parsed.default_personas)) {
                    config.default_personas = parsed.default_personas.filter(p => typeof p === 'string');
                }

                // Validate disabled_personas
                if (Array.isArray(parsed.disabled_personas)) {
                    config.disabled_personas = parsed.disabled_personas.filter(p => typeof p === 'string');
                }
            }
            // Malformed YAML: parsed is null, defaults are used
        }
        // Missing file: defaults are used
    } catch (_) {
        // Read error: defaults are used
    }

    // Conflict resolution: disabled wins over default (FR-005 AC-005-07)
    if (config.disabled_personas.length > 0 && config.default_personas.length > 0) {
        const disabledSet = new Set(config.disabled_personas);
        config.default_personas = config.default_personas.filter(p => !disabledSet.has(p));
    }

    // Apply per-analysis overrides (FR-011)
    if (overrides) {
        if (overrides.verbose) {
            config.verbosity = 'conversational';
        }
        if (overrides.silent) {
            config.verbosity = 'silent';
        }
        // --personas flag is handled separately in the dispatch layer
    }

    return config;
}

/**
 * Format config as a text section for injection into dispatch context.
 *
 * @param {RoundtableConfig} config
 * @returns {string}
 * @traces FR-005 AC-005-04
 */
function formatConfigSection(config) {
    const lines = [];
    lines.push(`verbosity: ${config.verbosity}`);
    if (config.default_personas.length > 0) {
        lines.push(`default_personas: [${config.default_personas.join(', ')}]`);
    } else {
        lines.push('default_personas: []');
    }
    if (config.disabled_personas.length > 0) {
        lines.push(`disabled_personas: [${config.disabled_personas.join(', ')}]`);
    } else {
        lines.push('disabled_personas: []');
    }
    return lines.join('\n');
}

module.exports = {
    readRoundtableConfig,
    formatConfigSection,
    parseYaml,
    defaultConfig,
    VALID_VERBOSITY
};
