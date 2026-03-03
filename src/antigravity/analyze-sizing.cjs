#!/usr/bin/env node
/**
 * iSDLC Antigravity - Analyze Sizing CLI
 * ========================================
 * Post-analysis sizing based on impact analysis metrics.
 * Wraps parseSizingFromImpactAnalysis from common.cjs.
 *
 * Usage:
 *   node src/antigravity/analyze-sizing.cjs --slug "payment-processing"
 *   node src/antigravity/analyze-sizing.cjs --slug "payment-processing" --light
 *
 * Output (JSON to stdout):
 *   { "result": "SIZED", "intensity": "standard", "metrics": {...} }
 *   { "result": "NO_IMPACT_ANALYSIS", ... }
 *   { "result": "ALREADY_SIZED", ... }
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { getProjectRoot, parseSizingFromImpactAnalysis } = require('../claude/hooks/lib/common.cjs');

function parseArgs() {
    const args = process.argv.slice(2);
    const result = { slug: null, light: false };
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--slug' && args[i + 1]) { result.slug = args[i + 1]; i++; }
        if (args[i] === '--light') result.light = true;
    }
    return result;
}

function output(obj) {
    console.log(JSON.stringify(obj, null, 2));
}

function findFolder(projectRoot, slug) {
    const reqDir = path.join(projectRoot, 'docs', 'requirements');
    if (!fs.existsSync(reqDir)) return null;
    for (const d of fs.readdirSync(reqDir, { withFileTypes: true })) {
        if (d.isDirectory() && d.name.includes(slug)) return d.name;
    }
    return null;
}

function main() {
    try {
        const args = parseArgs();
        if (!args.slug) { output({ result: 'ERROR', message: 'Missing --slug argument' }); process.exit(2); }

        const projectRoot = getProjectRoot();
        const folder = findFolder(projectRoot, args.slug);
        if (!folder) { output({ result: 'ERROR', message: `No folder found matching slug '${args.slug}'` }); process.exit(2); }

        const folderPath = path.join(projectRoot, 'docs', 'requirements', folder);
        const metaPath = path.join(folderPath, 'meta.json');

        let meta = {};
        if (fs.existsSync(metaPath)) {
            try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch (e) { /* skip */ }
        }

        // Check if already sized
        if (meta.sizing_decision) {
            output({ result: 'ALREADY_SIZED', sizing_decision: meta.sizing_decision, folder });
            process.exit(0);
        }

        // Light flag shortcut
        if (args.light) {
            const sizing = {
                intensity: 'light', effective_intensity: 'light', recommended_intensity: null,
                decided_at: new Date().toISOString(), reason: 'light_flag',
                user_prompted: false, forced_by_flag: true, overridden: false,
                light_skip_phases: ['03-architecture', '04-design'], context: 'analyze'
            };
            meta.sizing_decision = sizing;
            fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');
            output({ result: 'SIZED', sizing_decision: sizing, folder });
            process.exit(0);
        }

        // Read impact analysis
        const iaPath = path.join(folderPath, 'impact-analysis.md');
        if (!fs.existsSync(iaPath)) {
            output({ result: 'NO_IMPACT_ANALYSIS', message: 'impact-analysis.md not found. Complete analysis first.', folder });
            process.exit(1);
        }

        const iaContent = fs.readFileSync(iaPath, 'utf8');
        const metrics = parseSizingFromImpactAnalysis(iaContent);

        if (!metrics) {
            output({ result: 'PARSE_FAILED', message: 'Could not extract sizing metrics from impact-analysis.md', folder });
            process.exit(1);
        }

        // Compute recommendation
        const thresholds = { light_max_files: 5, epic_min_files: 20 };
        let recommended = 'standard';
        if (metrics.file_count <= thresholds.light_max_files) recommended = 'light';
        else if (metrics.file_count >= thresholds.epic_min_files) recommended = 'epic';

        output({
            result: 'RECOMMENDATION',
            recommended_intensity: recommended,
            metrics,
            thresholds,
            folder,
            message: `Recommended sizing: ${recommended} (${metrics.file_count} files, ${metrics.module_count || '?'} modules)`
        });
        process.exit(0);

    } catch (error) {
        output({ result: 'ERROR', message: error.message });
        process.exit(2);
    }
}

main();
