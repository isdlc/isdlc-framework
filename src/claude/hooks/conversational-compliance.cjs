#!/usr/bin/env node
'use strict';

/**
 * iSDLC Conversational Compliance - Stop Hook
 * ==============================================
 * Validates Claude's response text against active conversational rules
 * during roundtable analysis. Returns block + corrective guidance on
 * violations so Claude regenerates autonomously.
 *
 * REQ-0140: Conversational enforcement via Stop hook
 * Covers: FR-003 (Stop Hook Integration), FR-004 (Auto-Retry)
 *
 * Hook contract:
 *   stdin: JSON with { hook_event_name, last_assistant_message, ... }
 *   stdout: { "decision": "block", "reason": "..." } to reject
 *           or empty/no output to allow
 *
 * Fail-open: Any error -> exit 0, no output (response allowed through).
 *
 * Version: 1.0.0
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Retry tracking (in-memory, per-process lifetime) (AD-05)
// ---------------------------------------------------------------------------

const retryCounters = new Map(); // rule_id -> count
const MAX_RETRIES = 3;

// ---------------------------------------------------------------------------
// Resolve project root
// ---------------------------------------------------------------------------

function getProjectRoot() {
    return process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

// ---------------------------------------------------------------------------
// Read stdin
// ---------------------------------------------------------------------------

function readStdin() {
    return new Promise((resolve) => {
        let data = '';
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', (chunk) => { data += chunk; });
        process.stdin.on('end', () => { resolve(data); });
        process.stdin.on('error', () => { resolve(''); });
    });
}

// ---------------------------------------------------------------------------
// Load compliance engine
// ---------------------------------------------------------------------------

function loadEngine(projectRoot) {
    // Try the canonical location first
    const paths = [
        path.join(projectRoot, 'src', 'core', 'compliance', 'engine.cjs'),
        path.join(path.dirname(__filename), '..', '..', 'core', 'compliance', 'engine.cjs'),
        path.join(__dirname, 'compliance', 'engine.cjs') // Test environment fallback
    ];

    for (const p of paths) {
        try {
            if (fs.existsSync(p)) {
                return require(p);
            }
        } catch (e) {
            // Try next path
        }
    }

    return null;
}

// ---------------------------------------------------------------------------
// Read roundtable config (verbosity)
// ---------------------------------------------------------------------------

function readRoundtableConfig(projectRoot) {
    try {
        const yamlPath = path.join(projectRoot, '.isdlc', 'roundtable.yaml');
        if (!fs.existsSync(yamlPath)) return {};

        const content = fs.readFileSync(yamlPath, 'utf8');
        // Simple YAML parsing for key: value pairs (no external deps)
        const config = {};
        for (const line of content.split('\n')) {
            const match = line.match(/^(\w+):\s*(.+)$/);
            if (match) {
                config[match[1]] = match[2].trim();
            }
        }
        return config;
    } catch (e) {
        return {};
    }
}

// ---------------------------------------------------------------------------
// Read roundtable state sidecar (AD-07)
// ---------------------------------------------------------------------------

function readRoundtableState(projectRoot) {
    try {
        const statePath = path.join(projectRoot, '.isdlc', 'roundtable-state.json');
        if (!fs.existsSync(statePath)) return null;

        const content = fs.readFileSync(statePath, 'utf8');
        return JSON.parse(content);
    } catch (e) {
        // Unparseable or missing -- fail-open
        return null;
    }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
    try {
        const inputStr = await readStdin();

        if (!inputStr || !inputStr.trim()) {
            process.exit(0);
        }

        let input;
        try {
            input = JSON.parse(inputStr);
        } catch (e) {
            // Malformed JSON -- fail-open
            process.exit(0);
        }

        // Extract assistant message
        const response = input.last_assistant_message;
        if (!response || typeof response !== 'string' || response.trim().length === 0) {
            process.exit(0);
        }

        const projectRoot = getProjectRoot();

        // Load compliance engine (fail-open if unavailable)
        const engine = loadEngine(projectRoot);
        if (!engine) {
            process.exit(0);
        }

        // Load rules (fail-open if missing)
        const rulesPath = path.join(projectRoot, '.isdlc', 'config', 'conversational-rules.json');
        const rules = engine.loadRules(rulesPath);
        if (rules.length === 0) {
            process.exit(0);
        }

        // Read config and state
        const config = readRoundtableConfig(projectRoot);
        const roundtableState = readRoundtableState(projectRoot);

        // Evaluate rules
        const verdict = engine.evaluateRules(response, rules, config, roundtableState, 'claude');

        if (!verdict.violation) {
            // No violations -- clear retry counters and allow through
            retryCounters.clear();
            process.exit(0);
        }

        if (verdict.severity === 'warn') {
            // Warn severity -- log but allow through (AC-003-03)
            process.exit(0);
        }

        // Block severity (AC-003-02)
        const ruleId = verdict.rule_id;
        const currentRetries = retryCounters.get(ruleId) || 0;

        if (currentRetries >= MAX_RETRIES) {
            // Escalation: allow through after max retries (AC-004-05)
            retryCounters.delete(ruleId);
            process.exit(0);
        }

        // Increment retry counter
        retryCounters.set(ruleId, currentRetries + 1);

        // Return block decision with corrective guidance (AC-004-01)
        console.log(JSON.stringify({
            decision: 'block',
            reason: verdict.corrective_guidance
        }));

        process.exit(0);

    } catch (error) {
        // Fail-open: any error allows the response through
        process.exit(0);
    }
}

main();
