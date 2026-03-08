#!/usr/bin/env node
/**
 * iSDLC Antigravity - Analyze Item CLI
 * ======================================
 * Handles the mechanical parts of the analyze verb:
 * - Input type detection (GitHub #N, Jira PROJECT-N, slug, description)
 * - Folder resolution (search existing docs/requirements/)
 * - Auto-add (create folder, draft.md, meta.json if not found)
 * - GitHub issue fetch (via `gh` CLI)
 * - Staleness check (codebase hash comparison)
 *
 * Usage:
 *   node src/antigravity/analyze-item.cjs --input "#42"
 *   node src/antigravity/analyze-item.cjs --input "payment-processing"
 *   node src/antigravity/analyze-item.cjs --input "JIRA-1250"
 *   node src/antigravity/analyze-item.cjs --input "#42" --light
 *
 * Output (JSON to stdout):
 *   { "result": "READY", "slug": "...", "folder": "...", "meta": {...}, ... }
 *   { "result": "ALREADY_COMPLETE", ... }
 *   { "result": "STALE", ... }
 *   { "result": "NOT_FOUND", ... }
 *   { "result": "ERROR", "message": "..." }
 *
 * Exit codes:
 *   0 = Success (READY, ALREADY_COMPLETE, STALE)
 *   1 = NOT_FOUND (no match, needs user confirmation)
 *   2 = ERROR
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { getProjectRoot } = require('../claude/hooks/lib/common.cjs');

// --- Argument parsing ---

function parseArgs() {
    const args = process.argv.slice(2);
    const result = { input: null, light: false, verbose: false, silent: false, personas: null, noRoundtable: false };
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--input' && args[i + 1]) {
            result.input = args[i + 1];
            i++;
        }
        if (args[i] === '--light') {
            result.light = true;
        }
        if (args[i] === '--verbose') {
            result.verbose = true;
        }
        if (args[i] === '--silent') {
            result.silent = true;
        }
        if (args[i] === '--personas' && args[i + 1]) {
            result.personas = args[i + 1];
            i++;
        }
        // REQ-0050 FR-001: --no-roundtable flag for no-persona analysis mode
        if (args[i] === '--no-roundtable') {
            result.noRoundtable = true;
        }
    }
    return result;
}

// --- Input type detection ---

function detectInputType(input) {
    // GitHub issue: #42
    const ghMatch = input.match(/^#(\d+)$/);
    if (ghMatch) return { type: 'github', id: ghMatch[1], source: 'github', source_id: `GH-${ghMatch[1]}` };

    // Jira ticket: PROJECT-123
    const jiraMatch = input.match(/^([A-Z][A-Z0-9]+-\d+)$/);
    if (jiraMatch) return { type: 'jira', id: jiraMatch[1], source: 'jira', source_id: jiraMatch[1] };

    // Item number from backlog: "3.2"
    const itemMatch = input.match(/^(\d+\.\d+)$/);
    if (itemMatch) return { type: 'item_number', id: itemMatch[1], source: 'backlog', source_id: itemMatch[1] };

    // Slug or description
    return { type: 'slug', id: input, source: 'manual', source_id: null };
}

// --- Slug generation ---

function generateSlug(text) {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 50);
}

// --- Folder scanning ---

function scanRequirementFolders(projectRoot) {
    const reqDir = path.join(projectRoot, 'docs', 'requirements');
    if (!fs.existsSync(reqDir)) return [];
    return fs.readdirSync(reqDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);
}

function findExistingFolder(projectRoot, inputType) {
    const reqDir = path.join(projectRoot, 'docs', 'requirements');
    const folders = scanRequirementFolders(projectRoot);

    // Search by source_id in meta.json
    if (inputType.source_id) {
        for (const folder of folders) {
            const metaPath = path.join(reqDir, folder, 'meta.json');
            if (fs.existsSync(metaPath)) {
                try {
                    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                    if (meta.source_id === inputType.source_id) {
                        return { folder, meta, metaPath };
                    }
                } catch (e) { /* skip */ }
            }
        }
    }

    // Search by slug match in folder name
    if (inputType.type === 'slug') {
        const slug = generateSlug(inputType.id);
        for (const folder of folders) {
            // Match the slug portion after the prefix (e.g., REQ-0042-payment-processing → payment-processing)
            const slugPart = folder.replace(/^(REQ|BUG)-\d+-/, '');
            if (slugPart === slug || folder.includes(slug)) {
                const metaPath = path.join(reqDir, folder, 'meta.json');
                let meta = null;
                if (fs.existsSync(metaPath)) {
                    try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch (e) { /* skip */ }
                }
                return { folder, meta, metaPath };
            }
        }
    }

    return null;
}

// --- Sequence number ---

function getNextSequenceNumber(projectRoot, type) {
    const folders = scanRequirementFolders(projectRoot);
    const prefix = type === 'bug' ? 'BUG' : 'REQ';
    let maxNum = 0;
    for (const folder of folders) {
        const match = folder.match(new RegExp(`^${prefix}-(\\d+)-`));
        if (match) {
            const num = parseInt(match[1], 10);
            if (num > maxNum) maxNum = num;
        }
    }
    return String(maxNum + 1).padStart(4, '0');
}

// --- GitHub issue fetch ---

function fetchGitHubIssue(issueNumber) {
    try {
        const result = execSync(
            `gh issue view ${issueNumber} --json title,labels,body`,
            { encoding: 'utf8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'] }
        );
        return JSON.parse(result);
    } catch (e) {
        return null;
    }
}

// --- Git HEAD hash ---

function getGitHead(projectRoot) {
    try {
        return execSync('git rev-parse --short HEAD', { cwd: projectRoot, encoding: 'utf8' }).trim();
    } catch (e) {
        return null;
    }
}

// --- Auto-add (create folder, draft, meta) ---

function autoAdd(projectRoot, inputType, issueData) {
    const reqDir = path.join(projectRoot, 'docs', 'requirements');
    if (!fs.existsSync(reqDir)) fs.mkdirSync(reqDir, { recursive: true });

    const type = 'REQ';  // analyze always creates REQ folders
    const seqNum = getNextSequenceNumber(projectRoot, 'feature');
    const title = issueData?.title || inputType.id;
    const slug = generateSlug(title);
    const folderName = `${type}-${seqNum}-${slug}`;
    const folderPath = path.join(reqDir, folderName);

    fs.mkdirSync(folderPath, { recursive: true });

    // Create draft.md
    const draftContent = buildDraftContent(inputType, issueData);
    fs.writeFileSync(path.join(folderPath, 'draft.md'), draftContent, 'utf8');

    // Create meta.json
    const meta = {
        source: inputType.source,
        source_id: inputType.source_id,
        slug: slug,
        created_at: new Date().toISOString(),
        analysis_status: 'raw',
        phases_completed: [],
        topics_covered: [],
        codebase_hash: getGitHead(projectRoot)
    };
    const metaPath = path.join(folderPath, 'meta.json');
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');

    // Update BACKLOG.md
    updateBacklog(projectRoot, folderName, title, inputType);

    return { folder: folderName, meta, metaPath, draftContent };
}

function buildDraftContent(inputType, issueData) {
    const lines = [];
    if (issueData) {
        lines.push(`# ${issueData.title || inputType.id}`);
        lines.push('');
        if (issueData.body) {
            lines.push(issueData.body);
        }
        if (issueData.labels && issueData.labels.length > 0) {
            lines.push('');
            lines.push(`**Labels**: ${issueData.labels.map(l => l.name || l).join(', ')}`);
        }
    } else {
        lines.push(`# ${inputType.id}`);
        lines.push('');
        lines.push('(No external source data available)');
    }
    return lines.join('\n');
}

function updateBacklog(projectRoot, folderName, title, inputType) {
    const backlogPath = path.join(projectRoot, 'BACKLOG.md');
    if (!fs.existsSync(backlogPath)) return; // Skip if no BACKLOG.md

    try {
        let content = fs.readFileSync(backlogPath, 'utf8');
        const sourceRef = inputType.source_id ? ` [${inputType.source}: ${inputType.source_id}]` : '';
        const entry = `- [ ] ${title}${sourceRef} → \`${folderName}/\``;

        // Insert after "## Open" header
        const openIdx = content.indexOf('## Open');
        if (openIdx !== -1) {
            const insertIdx = content.indexOf('\n', openIdx) + 1;
            content = content.slice(0, insertIdx) + entry + '\n' + content.slice(insertIdx);
            fs.writeFileSync(backlogPath, content, 'utf8');
        }
    } catch (e) { /* non-critical, skip */ }
}

// --- Persona and topic file paths ---

const personaLoader = require('../claude/hooks/lib/persona-loader.cjs');
const roundtableConfig = require('../claude/hooks/lib/roundtable-config.cjs');
const { parseModeFlags } = require('./mode-selection.cjs');

function getPersonaPaths(projectRoot) {
    return personaLoader.getPersonaPaths(projectRoot);
}

function getTopicPaths(projectRoot) {
    const topicsDir = path.join(projectRoot, 'src', 'claude', 'skills', 'analysis-topics');
    if (!fs.existsSync(topicsDir)) return [];
    const results = [];
    function walk(dir) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.name.endsWith('.md')) results.push(full);
        }
    }
    walk(topicsDir);
    return results;
}

// --- Main ---

function main() {
    try {
        const args = parseArgs();
        if (!args.input) {
            console.log(JSON.stringify({ result: 'ERROR', message: 'Missing --input argument' }, null, 2));
            process.exit(2);
        }

        const projectRoot = getProjectRoot();
        const inputType = detectInputType(args.input);

        // Step 1: Fetch issue data if external ref
        let issueData = null;
        if (inputType.type === 'github') {
            issueData = fetchGitHubIssue(inputType.id);
            if (!issueData) {
                console.log(JSON.stringify({
                    result: 'ERROR',
                    message: `Could not fetch GitHub issue #${inputType.id}. Is 'gh' CLI authenticated?`
                }, null, 2));
                process.exit(2);
            }
        }

        // Step 2: Search for existing folder
        const existing = findExistingFolder(projectRoot, inputType);

        let folder, meta, draftContent;

        if (existing) {
            folder = existing.folder;
            meta = existing.meta || { analysis_status: 'raw', phases_completed: [] };

            // Read draft
            const draftPath = path.join(projectRoot, 'docs', 'requirements', folder, 'draft.md');
            draftContent = fs.existsSync(draftPath) ? fs.readFileSync(draftPath, 'utf8') : '(No draft available)';
        } else if (inputType.type === 'github' || inputType.type === 'jira') {
            // Auto-add for external refs (unambiguous intent)
            const added = autoAdd(projectRoot, inputType, issueData);
            folder = added.folder;
            meta = added.meta;
            draftContent = added.draftContent;
        } else {
            // Non-external ref with no match — need user confirmation
            console.log(JSON.stringify({
                result: 'NOT_FOUND',
                input: args.input,
                input_type: inputType.type,
                message: `No matching item found for "${args.input}". Add to backlog first?`,
                suggestion: `node src/antigravity/analyze-item.cjs --input "${args.input}" --force-add`
            }, null, 2));
            process.exit(1);
        }

        // Step 3: Check for completed analysis
        const currentHash = getGitHead(projectRoot);
        if (meta.phases_completed && meta.phases_completed.length >= 5) {
            if (meta.codebase_hash === currentHash) {
                console.log(JSON.stringify({
                    result: 'ALREADY_COMPLETE',
                    slug: folder.replace(/^(REQ|BUG)-\d+-/, ''),
                    folder: `docs/requirements/${folder}`,
                    meta,
                    message: 'Analysis is already complete and current. Nothing to do.'
                }, null, 2));
                process.exit(0);
            } else {
                console.log(JSON.stringify({
                    result: 'STALE',
                    slug: folder.replace(/^(REQ|BUG)-\d+-/, ''),
                    folder: `docs/requirements/${folder}`,
                    meta,
                    codebase_hash_current: currentHash,
                    codebase_hash_analysis: meta.codebase_hash,
                    message: 'Codebase has changed since analysis. Re-run analysis?'
                }, null, 2));
                process.exit(0);
            }
        }

        // Step 4: Return READY with all context

        // REQ-0050 FR-001: Parse mode selection flags
        const modeFlags = parseModeFlags({
            noRoundtable: args.noRoundtable,
            silent: args.silent,
            verbose: args.verbose,
            personas: args.personas,
            light: args.light
        });

        // Read roundtable config with per-analysis overrides (FR-005, FR-011)
        const rtConfig = roundtableConfig.readRoundtableConfig(projectRoot, {
            verbose: args.verbose,
            silent: args.silent
        });

        // REQ-0050 FR-004: In no-personas mode, skip persona file loading (AC-004-01)
        let personaResult;
        if (modeFlags.mode === 'no-personas') {
            personaResult = { paths: [], driftWarnings: [], skippedFiles: [] };
        } else {
            personaResult = getPersonaPaths(projectRoot);
        }
        const topicPaths = getTopicPaths(projectRoot);

        const output = {
            result: 'READY',
            slug: folder.replace(/^(REQ|BUG)-\d+-/, ''),
            folder: `docs/requirements/${folder}`,
            folder_absolute: path.join(projectRoot, 'docs', 'requirements', folder),
            meta,
            draft_content: draftContent,
            analysis_status: meta.analysis_status || 'raw',
            light: args.light,
            persona_paths: personaResult.paths,
            drift_warnings: personaResult.driftWarnings,
            skipped_files: personaResult.skippedFiles,
            roundtable_config: rtConfig,
            topic_paths: topicPaths,
            codebase_hash: currentHash,
            issue_data: issueData
        };

        // REQ-0050: Add analysis_mode field when mode is determined by flags (AC-001-07, AC-001-05)
        if (modeFlags.mode) {
            output.analysis_mode = modeFlags.mode;
        }

        // Per-analysis persona pre-selection (FR-011 AC-011-03)
        if (args.personas) {
            output.preselected_personas = args.personas.split(',').map(p => p.trim());
        }

        console.log(JSON.stringify(output, null, 2));
        process.exit(0);

    } catch (error) {
        console.log(JSON.stringify({ result: 'ERROR', message: error.message }, null, 2));
        process.exit(2);
    }
}

main();
