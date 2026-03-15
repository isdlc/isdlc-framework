#!/usr/bin/env node

/**
 * CLI: rebuild-cache.js
 *
 * Manual cache rebuild escape hatch. Calls rebuildSessionCache() from
 * common.cjs and reports results to stdout.
 *
 * ESM/CJS boundary handled via createRequire() (ADR-0030).
 *
 * Usage: node bin/rebuild-cache.js [--verbose]
 *
 * Traces to: FR-004, AC-004-01 through AC-004-03, REQ-0067 FR-008
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load common.cjs via createRequire bridge
const common = require(path.join(__dirname, '..', 'src', 'claude', 'hooks', 'lib', 'common.cjs'));
const { rebuildSessionCache } = common;

// Parse flags
const verbose = process.argv.includes('--verbose') || process.argv.includes('-v');

try {
    const result = rebuildSessionCache({ verbose });
    console.log(`Session cache rebuilt successfully.`);
    console.log(`  Path: ${result.path}`);
    console.log(`  Size: ${result.size} characters`);
    console.log(`  Hash: ${result.hash}`);
    console.log(`  Sections: ${result.sections.join(', ')}`);
    if (result.skipped.length > 0) {
        console.log(`  Skipped: ${result.skipped.join(', ')}`);
    }
    // REQ-0067 FR-008: Budget usage reporting (AC-008-01, AC-008-02)
    if (typeof result.usedTokens === 'number' && typeof result.budgetTokens === 'number') {
        const percent = Math.round((result.usedTokens / result.budgetTokens) * 100);
        console.log(`  Budget: ${result.usedTokens}/${result.budgetTokens} tokens (${percent}%)`);
        console.log(`  Sections: ${result.sections.length}/${result.sections.length + result.skipped.length} included`);
        if (result.skipped.length > 0) {
            console.log(`  Skipped: ${result.skipped.join(', ')}`);
        }
    }
    process.exit(0);
} catch (err) {
    console.error(`Failed to rebuild session cache: ${err.message}`);
    process.exit(1);
}
