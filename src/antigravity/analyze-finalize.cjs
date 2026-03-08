#!/usr/bin/env node
/**
 * iSDLC Antigravity - Analyze Finalize CLI
 * ==========================================
 * Post-analysis finalization: updates BACKLOG.md and comments on GitHub issue.
 * Run after roundtable completes (ROUNDTABLE_COMPLETE emitted).
 *
 * Usage:
 *   node src/antigravity/analyze-finalize.cjs --folder "docs/requirements/REQ-0050-full-persona-override"
 *
 * Output (JSON to stdout):
 *   { "result": "OK", "backlog_updated": true, "github_commented": true }
 *   { "result": "OK", "backlog_updated": true, "github_commented": false, "reason": "no GitHub source" }
 *   { "result": "ERROR", "message": "..." }
 *
 * Exit codes:
 *   0 = Success
 *   2 = ERROR
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { getProjectRoot } = require('../claude/hooks/lib/common.cjs');

function parseArgs() {
    const args = process.argv.slice(2);
    const result = { folder: null };
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--folder' && args[i + 1]) {
            result.folder = args[i + 1];
            i++;
        }
    }
    return result;
}

function readMeta(folderPath) {
    const metaPath = path.join(folderPath, 'meta.json');
    if (!fs.existsSync(metaPath)) return null;
    try {
        return JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    } catch (_) {
        return null;
    }
}

function extractGitHubIssueNumber(sourceId) {
    if (!sourceId) return null;
    // Match #N, GH-N, or gh-N
    const match = sourceId.match(/^#(\d+)$/) || sourceId.match(/^GH-(\d+)$/i);
    return match ? match[1] : null;
}

function buildAnalysisSummary(meta, folderRelative) {
    const lines = [];
    lines.push('## Analysis Complete');
    lines.push('');

    if (meta.sizing_decision) {
        const s = meta.sizing_decision;
        lines.push(`**Scope**: ~${s.estimated_files || '?'} files, ${s.effective_intensity || 'standard'} tier`);
    }

    if (meta.topics_covered && meta.topics_covered.length > 0) {
        lines.push(`**Topics covered**: ${meta.topics_covered.join(', ')}`);
    }

    if (meta.phases_completed && meta.phases_completed.length > 0) {
        lines.push(`**Phases completed**: ${meta.phases_completed.join(', ')}`);
    }

    lines.push('');
    lines.push('### Artifacts');

    // List artifacts that exist in the folder
    const artifactNames = [
        'requirements-spec.md',
        'impact-analysis.md',
        'architecture-overview.md',
        'module-design.md',
        'user-stories.json'
    ];

    for (const name of artifactNames) {
        lines.push(`- [\`${name}\`](${folderRelative}/${name})`);
    }

    return lines.join('\n');
}

function updateBacklog(projectRoot, folderName, meta) {
    const backlogPath = path.join(projectRoot, 'BACKLOG.md');
    if (!fs.existsSync(backlogPath)) return false;

    try {
        let content = fs.readFileSync(backlogPath, 'utf8');
        const sourceId = meta.source_id || '';

        // Find the line that references this item by source_id or folder name
        const lines = content.split('\n');
        let updated = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Match by source_id (e.g., "#108b", "GH-42")
            const matchesSource = sourceId && line.includes(sourceId);
            // Match by folder name
            const matchesFolder = line.includes(folderName);

            if ((matchesSource || matchesFolder) && line.includes('[ ]')) {
                // Already has requirements link and Analyzed tag — skip
                if (line.includes('**Analyzed**') || line.includes('**analyzed**')) {
                    updated = true;
                    break;
                }

                // Add requirements link and Analyzed tag if not present
                if (!line.includes('-> [requirements]')) {
                    // Insert before any trailing content
                    const reqLink = ` -> [requirements](docs/requirements/${folderName}/) **Analyzed**`;
                    // If line already has a link, just add the Analyzed tag
                    if (line.includes(`docs/requirements/${folderName}`)) {
                        lines[i] = line.replace(/(\s*)$/, ' **Analyzed**$1');
                    } else {
                        // Append link before any line-ending whitespace
                        lines[i] = line.trimEnd() + reqLink;
                    }
                } else if (!line.includes('**Analyzed**')) {
                    lines[i] = line.trimEnd() + ' **Analyzed**';
                }

                updated = true;
                break;
            }
        }

        if (updated) {
            fs.writeFileSync(backlogPath, lines.join('\n'), 'utf8');
        }
        return updated;
    } catch (_) {
        return false;
    }
}

function commentOnGitHub(issueNumber, summary) {
    try {
        execSync(
            `gh issue comment ${issueNumber} --body ${JSON.stringify(summary)}`,
            { encoding: 'utf8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'] }
        );
        return true;
    } catch (_) {
        return false;
    }
}

function main() {
    try {
        const args = parseArgs();
        if (!args.folder) {
            console.log(JSON.stringify({ result: 'ERROR', message: 'Missing --folder argument' }, null, 2));
            process.exit(2);
        }

        const projectRoot = getProjectRoot();
        const folderAbsolute = path.isAbsolute(args.folder)
            ? args.folder
            : path.join(projectRoot, args.folder);

        if (!fs.existsSync(folderAbsolute)) {
            console.log(JSON.stringify({ result: 'ERROR', message: `Folder not found: ${args.folder}` }, null, 2));
            process.exit(2);
        }

        const meta = readMeta(folderAbsolute);
        if (!meta) {
            console.log(JSON.stringify({ result: 'ERROR', message: 'Could not read meta.json from folder' }, null, 2));
            process.exit(2);
        }

        // Extract folder name (last segment of path)
        const folderName = path.basename(folderAbsolute);
        const folderRelative = `docs/requirements/${folderName}`;

        // Step 1: Update BACKLOG.md
        const backlogUpdated = updateBacklog(projectRoot, folderName, meta);

        // Step 2: Comment on GitHub issue if applicable
        const issueNumber = extractGitHubIssueNumber(meta.source_id);
        let githubCommented = false;
        let githubReason = null;

        if (issueNumber) {
            const summary = buildAnalysisSummary(meta, folderRelative);
            githubCommented = commentOnGitHub(issueNumber, summary);
            if (!githubCommented) {
                githubReason = 'gh CLI comment failed (auth or network issue)';
            }
        } else {
            githubReason = 'no GitHub source_id in meta.json';
        }

        const output = {
            result: 'OK',
            backlog_updated: backlogUpdated,
            github_commented: githubCommented
        };
        if (githubReason) output.github_reason = githubReason;

        console.log(JSON.stringify(output, null, 2));
        process.exit(0);

    } catch (error) {
        console.log(JSON.stringify({ result: 'ERROR', message: error.message }, null, 2));
        process.exit(2);
    }
}

main();
