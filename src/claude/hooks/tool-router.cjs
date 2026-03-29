#!/usr/bin/env node
'use strict';
/**
 * iSDLC Tool Router - PreToolUse Hook
 * ====================================
 * Routes agents from lower-fidelity built-in tools (Grep, Glob, Read) to
 * higher-fidelity MCP alternatives when available. Config-driven via
 * tool-routing.json with four-source rule merge.
 *
 * Enforcement levels per rule:
 *   - block: output JSON to block tool, suggest MCP alternative
 *   - warn:  allow through but log a warning to stderr
 *   - allow: pass through silently
 *
 * Fail-open: any error (config missing, malformed input, etc.) allows through.
 * Performance budget: < 100ms (sync JSON parse + regex matching only)
 *
 * Traces to: FR-001 through FR-011, NFR-001 through NFR-003
 * Constitutional: Article X (fail-open), Article XIII (CJS), Article XV (tool preferences)
 * Version: 1.0.0
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Source priority for rule merge (higher index = higher priority) */
const SOURCE_PRIORITY = { framework: 0, inferred: 1, skill: 2, user: 3 };

/** Default audit log path relative to project root */
const AUDIT_LOG_RELATIVE = path.join('.isdlc', 'tool-routing-audit.jsonl');

// ---------------------------------------------------------------------------
// Config loading (FR-002, FR-003)
// ---------------------------------------------------------------------------

/**
 * Load and merge routing rules from four sources:
 *   1. Framework defaults (tool-routing.json → rules)
 *   2. Inferred rules (environment probe)
 *   3. Skill-declared preferences (external-skills-manifest.json)
 *   4. User overrides (tool-routing.json → user_overrides)
 *
 * Conflict resolution: by operation + intercept_tool pair, higher-priority source wins.
 *
 * @param {string} configPath - Path to tool-routing.json
 * @param {string} [manifestPath] - Path to external-skills-manifest.json
 * @param {string} [settingsPath] - Path to .claude/settings.json (for MCP probe)
 * @returns {object[]} Merged Rule[] array
 */
function loadRoutingRules(configPath, manifestPath, settingsPath) {
    const allRules = [];

    // 1. Framework defaults
    try {
        if (fs.existsSync(configPath)) {
            const raw = fs.readFileSync(configPath, 'utf8');
            const config = JSON.parse(raw);
            if (config && Array.isArray(config.rules)) {
                for (const rule of config.rules) {
                    if (isValidRule(rule)) {
                        allRules.push({ ...rule, source: rule.source || 'framework' });
                    }
                }
            }
            // 4. User overrides (from same config file)
            if (config && Array.isArray(config.user_overrides)) {
                for (const rule of config.user_overrides) {
                    if (isValidRule(rule)) {
                        allRules.push({ ...rule, source: 'user' });
                    }
                }
            }
        }
    } catch (e) {
        // FR-008: Fail-open on config errors
        safeStderr(`tool-router: config load error: ${e.message}`);
        return [];
    }

    // 2. Inferred rules
    try {
        const inferred = inferEnvironmentRules(settingsPath);
        for (const rule of inferred) {
            allRules.push(rule);
        }
    } catch (e) {
        // Fail-open: skip inferred rules
    }

    // 3. Skill-declared preferences
    try {
        if (manifestPath && fs.existsSync(manifestPath)) {
            const raw = fs.readFileSync(manifestPath, 'utf8');
            const manifest = JSON.parse(raw);
            if (manifest && Array.isArray(manifest.skills)) {
                for (const skill of manifest.skills) {
                    if (skill && Array.isArray(skill.tool_preferences)) {
                        for (const pref of skill.tool_preferences) {
                            if (pref && pref.intercept_tool && pref.preferred_tool) {
                                allRules.push({
                                    id: `skill-${skill.skill_id || 'unknown'}-${pref.operation || pref.intercept_tool}`,
                                    operation: pref.operation || pref.intercept_tool,
                                    intercept_tool: pref.intercept_tool,
                                    preferred_tool: pref.preferred_tool,
                                    enforcement: 'block',
                                    source: 'skill',
                                    exemptions: pref.exemptions || []
                                });
                            }
                        }
                    }
                }
            }
        }
    } catch (e) {
        // FR-008: Fail-open, skip skill rules
    }

    // Merge: deduplicate by operation + intercept_tool, higher-priority source wins
    return mergeRules(allRules);
}

/**
 * Validate that a rule has the minimum required fields.
 * @param {object} rule
 * @returns {boolean}
 */
function isValidRule(rule) {
    return rule && typeof rule.intercept_tool === 'string' && typeof rule.preferred_tool === 'string';
}

/**
 * Merge rules by operation + intercept_tool pair. Higher priority source wins.
 * Non-conflicting rules from different sources are all included.
 *
 * Priority order: user (3) > skill (2) > inferred (1) > framework (0)
 *
 * Special case: inferred rules only fill gaps. If a framework or higher-priority
 * rule already exists for the same operation+intercept_tool, the inferred rule
 * is discarded. This ensures shipped framework defaults (e.g., block enforcement)
 * are not overridden by auto-detected warn rules.
 *
 * @param {object[]} rules
 * @returns {object[]}
 */
function mergeRules(rules) {
    const map = new Map();
    for (const rule of rules) {
        const key = `${rule.operation || ''}::${rule.intercept_tool}`;
        const existing = map.get(key);
        if (!existing) {
            map.set(key, rule);
        } else {
            const existingPriority = SOURCE_PRIORITY[existing.source] ?? -1;
            const newPriority = SOURCE_PRIORITY[rule.source] ?? -1;
            // Inferred rules (priority 1) never override existing rules
            // They only fill gaps (operations with no existing rule)
            if (rule.source === 'inferred' && existing) {
                continue;
            }
            if (newPriority >= existingPriority) {
                map.set(key, rule);
            }
        }
    }
    return Array.from(map.values());
}

// ---------------------------------------------------------------------------
// Environment inference (FR-004, FR-009)
// ---------------------------------------------------------------------------

/**
 * Probe MCP availability via filesystem heuristics and generate inferred rules
 * at 'warn' level for any available MCP tools.
 *
 * @param {string} [settingsPath] - Path to .claude/settings.json
 * @returns {object[]} Inferred Rule[] at warn level
 */
function inferEnvironmentRules(settingsPath) {
    const rules = [];
    const sPath = settingsPath || resolveSettingsPath();
    if (!sPath) return rules;

    // Check which MCP servers are available
    const available = probeMcpServers(sPath);

    if (available.has('code-index-mcp')) {
        rules.push({
            id: 'inferred-search-semantic',
            operation: 'codebase_search',
            intercept_tool: 'Grep',
            preferred_tool: 'mcp__code-index-mcp__search_code_advanced',
            enforcement: 'warn',
            source: 'inferred',
            exemptions: [{ type: 'context', condition: 'targeted_file', signal: 'path_has_extension_no_wildcards' }]
        });
        rules.push({
            id: 'inferred-find-files',
            operation: 'file_discovery',
            intercept_tool: 'Glob',
            preferred_tool: 'mcp__code-index-mcp__find_files',
            enforcement: 'warn',
            source: 'inferred',
            exemptions: [{ type: 'context', condition: 'exact_filename', signal: 'basename_no_wildcards' }]
        });
        rules.push({
            id: 'inferred-file-summary',
            operation: 'file_summary',
            intercept_tool: 'Read',
            preferred_tool: 'mcp__code-index-mcp__get_file_summary',
            enforcement: 'warn',
            source: 'inferred',
            exemptions: [
                { type: 'context', condition: 'edit_prep', signal: 'limit_lte_200' },
                { type: 'context', condition: 'targeted_read', signal: 'offset_present' }
            ]
        });
    }

    return rules;
}

/**
 * Resolve the path to .claude/settings.json from project root.
 * @returns {string|null}
 */
function resolveSettingsPath() {
    try {
        const dir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
        const p = path.join(dir, '.claude', 'settings.json');
        return fs.existsSync(p) ? p : null;
    } catch (e) {
        return null;
    }
}

/**
 * Probe which MCP servers are registered by reading settings.json.
 * @param {string} settingsPath - Path to .claude/settings.json
 * @returns {Set<string>} Set of available MCP server names
 */
function probeMcpServers(settingsPath) {
    const available = new Set();
    try {
        if (!settingsPath || !fs.existsSync(settingsPath)) return available;
        const raw = fs.readFileSync(settingsPath, 'utf8');
        const settings = JSON.parse(raw);
        if (settings && settings.mcpServers && typeof settings.mcpServers === 'object') {
            for (const name of Object.keys(settings.mcpServers)) {
                available.add(name);
            }
        }
    } catch (e) {
        // Fail-open
    }
    return available;
}

/**
 * Check if a specific MCP tool's server is available.
 * Extracts the server name from the tool name (mcp__{server}__{tool}).
 *
 * @param {string} mcpToolName - e.g. "mcp__code-index-mcp__search_code_advanced"
 * @param {string} [settingsPath] - Path to .claude/settings.json
 * @returns {boolean}
 */
function probeMcpAvailability(mcpToolName, settingsPath) {
    try {
        if (!mcpToolName) return false;
        const match = mcpToolName.match(/^mcp__([^_]+(?:-[^_]+)*)__/);
        if (!match) return false;
        const serverName = match[1];

        const sPath = settingsPath || resolveSettingsPath();
        if (!sPath) return false;

        const available = probeMcpServers(sPath);
        return available.has(serverName);
    } catch (e) {
        return false;
    }
}

// ---------------------------------------------------------------------------
// Exemption evaluation (FR-006)
// ---------------------------------------------------------------------------

/**
 * Check if any exemptions match the given tool input.
 * Returns the first matching exemption or null.
 *
 * @param {object[]} exemptions - Array of Exemption objects
 * @param {object} toolInput - The tool_input from stdin
 * @param {string} toolName - The tool_name from stdin
 * @returns {object|null} First matching exemption, or null
 */
function checkExemptions(exemptions, toolInput, toolName) {
    if (!Array.isArray(exemptions) || !toolInput) return null;

    for (const exemption of exemptions) {
        if (!exemption) continue;

        try {
            if (exemption.type === 'pattern') {
                // Pattern exemption: check field value against regex
                const fieldValue = getNestedField(toolInput, exemption.field);
                if (fieldValue != null && typeof exemption.regex === 'string') {
                    const re = new RegExp(exemption.regex);
                    if (re.test(String(fieldValue))) {
                        return exemption;
                    }
                }
            } else if (exemption.type === 'context') {
                // Context-based exemption
                if (matchContextCondition(exemption.condition, toolInput, toolName)) {
                    return exemption;
                }
            }
        } catch (e) {
            // Invalid regex or other error: skip this exemption (FR-008)
            safeStderr(`tool-router: exemption evaluation error: ${e.message}`);
        }
    }

    return null;
}

/**
 * Evaluate a named context condition against tool input.
 *
 * | Condition | Tool | Logic |
 * |-----------|------|-------|
 * | edit_prep | Read | limit exists AND limit <= 200 |
 * | targeted_read | Read | offset exists |
 * | targeted_file | Grep | path has file extension AND no wildcards |
 * | exact_filename | Glob | Final segment of pattern has no wildcards |
 * | non_mkdir | Bash | command does not start with mkdir |
 *
 * @param {string} condition - Named condition
 * @param {object} toolInput - The tool_input
 * @param {string} [toolName] - The tool_name
 * @returns {boolean}
 */
function matchContextCondition(condition, toolInput, toolName) {
    switch (condition) {
        case 'edit_prep': {
            // Read with limit <= 200
            const limit = toolInput.limit;
            return limit != null && typeof limit === 'number' && limit > 0 && limit <= 200;
        }
        case 'targeted_read': {
            // Read with offset present (any value including 0)
            return toolInput.offset != null;
        }
        case 'targeted_file': {
            // Grep targeting a specific file (path has extension, no wildcards)
            const p = toolInput.path;
            if (!p || typeof p !== 'string') return false;
            return /\.\w{1,10}$/.test(p) && !/[*?]/.test(p);
        }
        case 'exact_filename': {
            // Glob with exact filename (no wildcards in basename)
            const pattern = toolInput.pattern;
            if (!pattern || typeof pattern !== 'string') return false;
            const basename = path.basename(pattern);
            return !/[*?{}\[\]]/.test(basename);
        }
        case 'non_mkdir': {
            // Bash command that is NOT mkdir
            const cmd = toolInput.command;
            if (!cmd || typeof cmd !== 'string') return true;
            return !/^\s*mkdir\b/.test(cmd);
        }
        default:
            return false;
    }
}

/**
 * Get a nested field value from an object using a dot-path.
 * @param {object} obj
 * @param {string} dotPath - e.g. "path", "tool_input.command"
 * @returns {*}
 */
function getNestedField(obj, dotPath) {
    if (!obj || !dotPath) return undefined;
    const parts = dotPath.split('.');
    let current = obj;
    for (const part of parts) {
        if (current == null || typeof current !== 'object') return undefined;
        current = current[part];
    }
    return current;
}

// ---------------------------------------------------------------------------
// Rule evaluation (FR-001, FR-006, FR-009)
// ---------------------------------------------------------------------------

/**
 * Evaluate a single rule against a tool invocation.
 * Checks MCP availability, then exemptions.
 *
 * @param {object} rule - The routing rule
 * @param {object} toolInput - The tool_input from stdin
 * @param {string} toolName - The tool_name from stdin
 * @param {string} [settingsPath] - Path to settings.json for MCP probe
 * @returns {{ decision: string, exemption: object|null }}
 */
function evaluateRule(rule, toolInput, toolName, settingsPath) {
    // Check if preferred MCP tool is available
    if (!probeMcpAvailability(rule.preferred_tool, settingsPath)) {
        return { decision: 'skip', exemption: null };
    }

    // Check exemptions
    const exemption = checkExemptions(rule.exemptions || [], toolInput, toolName);
    if (exemption) {
        return { decision: 'exempt', exemption };
    }

    // Apply enforcement
    return { decision: rule.enforcement || 'allow', exemption: null };
}

// ---------------------------------------------------------------------------
// Message formatting (FR-007)
// ---------------------------------------------------------------------------

/**
 * Format a block message when a tool is intercepted.
 * Includes preferred tool name and guidance.
 *
 * @param {object} rule - The matching routing rule
 * @param {object} toolInput - The tool_input
 * @returns {string} JSON string for stdout (Claude Code block format)
 */
function formatBlockMessage(rule, toolInput) {
    const suggestion = `Consider using \`${rule.preferred_tool}\` instead of \`${rule.intercept_tool}\` for ${rule.operation || 'this operation'}.`;
    return JSON.stringify({
        continue: false,
        stopReason:
            `TOOL ROUTING: A higher-fidelity tool is available for this operation.\n\n` +
            `Blocked tool: ${rule.intercept_tool}\n` +
            `Preferred tool: ${rule.preferred_tool}\n\n` +
            `${suggestion}\n\n` +
            `If this is a legitimate use of ${rule.intercept_tool} (e.g., edit prep, targeted search), ` +
            `provide more specific parameters to bypass this check.`
    });
}

/**
 * Format a warning message when a tool is intercepted at warn level.
 * Includes preferred tool name, rule source, and config file path for promotion.
 *
 * @param {object} rule - The matching routing rule
 * @param {object} toolInput - The tool_input
 * @param {string} configPath - Path to tool-routing.json
 * @returns {string} Warning string for stderr
 */
function formatWarnMessage(rule, toolInput, configPath) {
    return `TOOL_ROUTER WARNING: Consider using \`${rule.preferred_tool}\` instead of \`${rule.intercept_tool}\` ` +
        `for ${rule.operation || 'this operation'}. ` +
        `(source: ${rule.source || 'unknown'}, config: ${configPath}). ` +
        `To enforce this, promote the rule to 'block' in ${configPath}.`;
}

// ---------------------------------------------------------------------------
// Audit log (FR-011)
// ---------------------------------------------------------------------------

/**
 * Append an audit entry to the JSONL audit log.
 * Non-blocking: errors are logged to stderr but do not affect routing.
 *
 * @param {object} entry - AuditEntry object
 * @param {string} [auditPath] - Override audit log path
 */
function appendAuditEntry(entry, auditPath) {
    try {
        const logPath = auditPath || resolveAuditLogPath();
        if (!logPath) return;

        // Ensure parent directory exists
        const dir = path.dirname(logPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        const line = JSON.stringify(entry) + '\n';
        fs.appendFileSync(logPath, line, 'utf8');
    } catch (e) {
        // FR-011 AC-011-03: audit write failure is non-blocking
        safeStderr(`tool-router: audit log write error: ${e.message}`);
    }
}

/**
 * Resolve the audit log path from project root.
 * @returns {string|null}
 */
function resolveAuditLogPath() {
    try {
        const dir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
        return path.join(dir, AUDIT_LOG_RELATIVE);
    } catch (e) {
        return null;
    }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/**
 * Write to stderr safely (never throws).
 * @param {string} msg
 */
function safeStderr(msg) {
    try { process.stderr.write(msg + '\n'); } catch (e) { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Main entry point (FR-001, FR-008)
// ---------------------------------------------------------------------------

/**
 * Main hook handler. Reads stdin, evaluates routing rules, and either
 * blocks, warns, or allows the tool call through.
 *
 * @param {string} inputStr - Raw stdin content
 * @param {object} [options] - Override paths for testing
 * @param {string} [options.configPath] - tool-routing.json path
 * @param {string} [options.manifestPath] - external-skills-manifest.json path
 * @param {string} [options.settingsPath] - .claude/settings.json path
 * @param {string} [options.auditPath] - audit log path
 * @returns {{ stdout: string|null, stderr: string|null }}
 */
function main(inputStr, options) {
    const opts = options || {};

    // Parse stdin
    if (!inputStr || !inputStr.trim()) {
        return { stdout: null, stderr: null };
    }

    let input;
    try {
        input = JSON.parse(inputStr);
    } catch (e) {
        return { stdout: null, stderr: null };
    }

    if (!input || !input.tool_name) {
        return { stdout: null, stderr: null };
    }

    const toolName = input.tool_name;
    const toolInput = input.tool_input || {};

    // Resolve paths
    const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const configPath = opts.configPath || path.join(projectDir, 'src', 'claude', 'hooks', 'config', 'tool-routing.json');
    const manifestPath = opts.manifestPath || path.join(projectDir, 'docs', 'isdlc', 'external-skills-manifest.json');
    const settingsPath = opts.settingsPath || path.join(projectDir, '.claude', 'settings.json');
    const auditPath = opts.auditPath || path.join(projectDir, AUDIT_LOG_RELATIVE);

    // Load rules (fail-open: empty array on error)
    let rules;
    try {
        rules = loadRoutingRules(configPath, manifestPath, settingsPath);
    } catch (e) {
        return { stdout: null, stderr: null };
    }

    if (!rules || rules.length === 0) {
        return { stdout: null, stderr: null };
    }

    // Filter rules for this tool
    const matchingRules = rules.filter(r => r.intercept_tool === toolName);
    if (matchingRules.length === 0) {
        return { stdout: null, stderr: null };
    }

    // Evaluate each matching rule (first actionable rule wins)
    for (const rule of matchingRules) {
        const result = evaluateRule(rule, toolInput, toolName, settingsPath);

        // Build audit entry
        const auditEntry = {
            ts: new Date().toISOString(),
            tool: toolName,
            preferred: rule.preferred_tool,
            enforcement: rule.enforcement,
            decision: result.decision,
            exemption: result.exemption ? (result.exemption.condition || result.exemption.regex || null) : null,
            rule_id: rule.id || 'unknown',
            rule_source: rule.source || 'unknown'
        };
        appendAuditEntry(auditEntry, auditPath);

        if (result.decision === 'skip') {
            // MCP unavailable: skip this rule, try next
            continue;
        }

        if (result.decision === 'exempt') {
            // Exempted: allow through
            return { stdout: null, stderr: null };
        }

        if (result.decision === 'block') {
            return { stdout: formatBlockMessage(rule, toolInput), stderr: null };
        }

        if (result.decision === 'warn') {
            return { stdout: null, stderr: formatWarnMessage(rule, toolInput, configPath) };
        }

        // 'allow' or unknown: pass through
        return { stdout: null, stderr: null };
    }

    // No actionable rules matched
    return { stdout: null, stderr: null };
}

// ---------------------------------------------------------------------------
// Exports (for testing)
// ---------------------------------------------------------------------------

module.exports = {
    main,
    loadRoutingRules,
    inferEnvironmentRules,
    evaluateRule,
    checkExemptions,
    matchContextCondition,
    probeMcpAvailability,
    probeMcpServers,
    formatBlockMessage,
    formatWarnMessage,
    appendAuditEntry,
    isValidRule,
    mergeRules,
    getNestedField,
    SOURCE_PRIORITY,
    AUDIT_LOG_RELATIVE
};

// ---------------------------------------------------------------------------
// Standalone execution (PreToolUse hook protocol)
// ---------------------------------------------------------------------------

if (require.main === module) {
    (async () => {
        try {
            // Read stdin
            let inputStr = '';
            process.stdin.setEncoding('utf8');
            for await (const chunk of process.stdin) {
                inputStr += chunk;
            }

            const result = main(inputStr);

            if (result.stderr) {
                process.stderr.write(result.stderr + '\n');
            }

            if (result.stdout) {
                process.stdout.write(result.stdout + '\n');
            }

            process.exit(0);
        } catch (e) {
            // FR-008: Fail-open on any unhandled error
            try { process.stderr.write(`tool-router: unhandled error: ${e.message}\n`); } catch (_) { /* ignore */ }
            process.exit(0);
        }
    })();
}
