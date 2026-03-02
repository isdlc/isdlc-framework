#!/usr/bin/env node
/**
 * iSDLC Antigravity - Session Prime CLI
 * ======================================
 * Rebuilds the session cache and outputs its content.
 * Thin CLI wrapper around the existing prime.cjs logic.
 *
 * Usage:
 *   node src/antigravity/prime-session.cjs
 *
 * Output (JSON to stdout):
 *   { "result": "OK", "cache_path": "...", "sections": [...] }
 *   { "result": "ERROR", "message": "..." }
 *
 * Exit codes:
 *   0 = Session primed successfully
 *   1 = Error during priming
 */

'use strict';

const fs = require('fs');
const path = require('path');

const {
    getProjectRoot,
    rebuildSessionCache
} = require('../claude/hooks/lib/common.cjs');

function output(obj) {
    console.log(JSON.stringify(obj, null, 2));
}

function main() {
    try {
        const projectRoot = getProjectRoot();

        // Rebuild the session cache
        const result = rebuildSessionCache({ verbose: false });

        const cachePath = path.join(projectRoot, '.isdlc', 'session-cache.md');
        if (!fs.existsSync(cachePath)) {
            output({ result: 'ERROR', message: 'Session cache file not found after rebuild' });
            process.exit(1);
        }

        const content = fs.readFileSync(cachePath, 'utf8');

        // Extract section headers for a summary
        const sections = content
            .split('\n')
            .filter(line => line.startsWith('## ') || line.startsWith('# '))
            .map(line => line.replace(/^#+\s*/, ''));

        output({
            result: 'OK',
            cache_path: cachePath,
            sections,
            size_bytes: Buffer.byteLength(content, 'utf8'),
            content
        });
        process.exit(0);

    } catch (error) {
        output({ result: 'ERROR', message: error.message });
        process.exit(1);
    }
}

main();
