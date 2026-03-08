'use strict';

/**
 * Persona Loader Module (M1) -- REQ-0047
 * =======================================
 * Discovers, validates, and resolves persona files with override-by-copy
 * and version drift detection.
 *
 * Exported functions:
 * - getPersonaPaths(projectRoot) -> { paths, driftWarnings, skippedFiles }
 * - parseFrontmatter(content) -> object|null
 * - validatePersona(frontmatter, filename, source) -> { valid, reason }
 *
 * @module persona-loader
 * @traces FR-001, FR-002, FR-009, FR-010
 */

const fs = require('fs');
const path = require('path');

// Primary persona filenames -- REQ-0050: no longer force-included, kept as
// recommended defaults for roster proposals. See filterByRoster() for
// dynamic roster filtering.
const PRIMARY_PERSONAS = [
    'persona-business-analyst.md',
    'persona-solutions-architect.md',
    'persona-system-designer.md'
];

/**
 * Parse YAML frontmatter from markdown content.
 * Returns null if no frontmatter block found or YAML is malformed.
 *
 * @param {string} content - Full file content
 * @returns {object|null} Parsed frontmatter key-value pairs
 */
function parseFrontmatter(content) {
    if (!content || typeof content !== 'string') return null;
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return null;

    try {
        const yaml = {};
        const lines = match[1].split('\n');
        let currentKey = null;
        let currentArray = null;

        for (const line of lines) {
            // Key-value line
            const kvMatch = line.match(/^([\w][\w_-]*):\s*(.*)$/);
            if (kvMatch) {
                const [, key, value] = kvMatch;
                const trimmed = value.trim();
                if (trimmed === '' || trimmed === '[]') {
                    if (trimmed === '[]') {
                        yaml[key] = [];
                        currentKey = null;
                        currentArray = null;
                    } else {
                        // Could be start of array or empty value
                        yaml[key] = '';
                        currentKey = key;
                        currentArray = [];
                    }
                } else if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
                    // Inline array: [a, b, c]
                    yaml[key] = trimmed.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
                    currentKey = null;
                    currentArray = null;
                } else {
                    yaml[key] = trimmed.replace(/^["']|["']$/g, '');
                    currentKey = null;
                    currentArray = null;
                }
            } else if (currentKey && line.match(/^\s+-\s+/)) {
                // Array item
                const item = line.replace(/^\s+-\s+/, '').replace(/^["']|["']$/g, '').trim();
                currentArray.push(item);
                yaml[currentKey] = currentArray;
            } else if (currentKey && line.match(/^\s+-\s*/)) {
                // Array item with dash only or minimal spacing
                const item = line.replace(/^\s+-\s*/, '').replace(/^["']|["']$/g, '').trim();
                if (item) {
                    currentArray.push(item);
                    yaml[currentKey] = currentArray;
                }
            } else if (line.match(/^\s+#/)) {
                // Comment line inside frontmatter, skip
            } else if (line.trim() === '') {
                // Empty line, reset current array context
                if (currentKey && currentArray && currentArray.length > 0) {
                    yaml[currentKey] = currentArray;
                }
                currentKey = null;
                currentArray = null;
            }
        }

        // Final flush for arrays
        if (currentKey && currentArray && currentArray.length > 0) {
            yaml[currentKey] = currentArray;
        } else if (currentKey && yaml[currentKey] === '') {
            yaml[currentKey] = '';
        }

        return yaml;
    } catch (_) {
        return null;
    }
}

/**
 * Validate persona frontmatter.
 * Minimum requirement: `name` field must exist.
 *
 * @param {object|null} frontmatter - Parsed frontmatter
 * @param {string} filename - File basename
 * @param {'built-in'|'user'} source - Where the file was found
 * @returns {{ valid: boolean, reason?: string }}
 * @traces FR-001 AC-001-02
 */
function validatePersona(frontmatter, filename, source) {
    if (!frontmatter) {
        return { valid: false, reason: 'missing or malformed YAML frontmatter' };
    }
    if (!frontmatter.name) {
        return { valid: false, reason: 'missing name field in frontmatter' };
    }
    return { valid: true };
}

/**
 * Check for path traversal attempts in filenames.
 * @param {string} filename
 * @returns {boolean} true if safe
 */
function isSafeFilename(filename) {
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return false;
    }
    return true;
}

/**
 * Compare semver strings. Returns:
 *  1 if a > b, -1 if a < b, 0 if equal, null if either is invalid
 * @param {string} a
 * @param {string} b
 * @returns {number|null}
 */
function compareSemver(a, b) {
    if (!a || !b) return null;
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    if (pa.some(isNaN) || pb.some(isNaN)) return null;
    for (let i = 0; i < 3; i++) {
        const va = pa[i] || 0;
        const vb = pb[i] || 0;
        if (va > vb) return 1;
        if (va < vb) return -1;
    }
    return 0;
}

/**
 * Derive domain name from persona filename.
 * e.g., "persona-security-reviewer.md" -> "security reviewer"
 *
 * @param {string} filename
 * @returns {string}
 */
function deriveDomain(filename) {
    return filename
        .replace(/^persona-/, '')
        .replace(/\.md$/, '')
        .replace(/-/g, ' ');
}

/**
 * Discover, validate, and resolve persona files.
 *
 * Scans built-in personas from `src/claude/agents/persona-*.md` and
 * user personas from `.isdlc/personas/*.md`. Applies override-by-copy
 * (same filename in user dir wins) and detects version drift.
 *
 * @param {string} projectRoot - Absolute path to project root
 * @returns {{ paths: string[], driftWarnings: DriftWarning[], skippedFiles: SkippedFile[] }}
 * @traces FR-001, FR-009, FR-010
 */
function getPersonaPaths(projectRoot) {
    const agentsDir = path.join(projectRoot, 'src', 'claude', 'agents');
    const userDir = path.join(projectRoot, '.isdlc', 'personas');

    /** @type {Map<string, string>} filename -> fullPath */
    const builtInMap = new Map();
    /** @type {Map<string, string>} filename -> fullPath */
    const userMap = new Map();
    /** @type {Map<string, object>} filename -> parsed frontmatter */
    const builtInFrontmatter = new Map();
    /** @type {Map<string, object>} filename -> parsed frontmatter */
    const userFrontmatter = new Map();
    /** @type {DriftWarning[]} */
    const driftWarnings = [];
    /** @type {SkippedFile[]} */
    const skippedFiles = [];

    // Step 1: Scan built-in personas (src/claude/agents/persona-*.md)
    try {
        if (fs.existsSync(agentsDir)) {
            const entries = fs.readdirSync(agentsDir).filter(f =>
                f.startsWith('persona-') && f.endsWith('.md')
            );
            for (const filename of entries) {
                try {
                    const fullPath = path.join(agentsDir, filename);
                    const content = fs.readFileSync(fullPath, 'utf8');
                    const fm = parseFrontmatter(content);
                    const validation = validatePersona(fm, filename, 'built-in');
                    if (validation.valid) {
                        builtInMap.set(filename, fullPath);
                        builtInFrontmatter.set(filename, fm);
                    }
                    // Built-in files that fail validation are silently ignored
                    // (they should always be valid)
                } catch (_) {
                    // Skip unreadable built-in files
                }
            }
        }
    } catch (_) {
        // agentsDir doesn't exist or can't be read
    }

    // Step 2: Scan user personas (.isdlc/personas/*.md)
    try {
        if (fs.existsSync(userDir)) {
            const entries = fs.readdirSync(userDir).filter(f => f.endsWith('.md'));
            for (const filename of entries) {
                // Security: reject path traversal
                if (!isSafeFilename(filename)) {
                    skippedFiles.push({ filename, reason: 'unsafe filename (path traversal)' });
                    continue;
                }

                try {
                    const fullPath = path.join(userDir, filename);
                    const content = fs.readFileSync(fullPath, 'utf8');
                    const fm = parseFrontmatter(content);
                    const validation = validatePersona(fm, filename, 'user');
                    if (validation.valid) {
                        userMap.set(filename, fullPath);
                        userFrontmatter.set(filename, fm);
                    } else {
                        skippedFiles.push({ filename, reason: validation.reason });
                    }
                } catch (err) {
                    skippedFiles.push({ filename, reason: `file read error: ${err.message}` });
                }
            }
        }
    } catch (_) {
        // userDir doesn't exist or can't be read -- return built-in only
    }

    // Step 3: Merge with override-by-copy
    const resolvedPaths = [];
    const processedFilenames = new Set();

    // Process all built-in personas
    for (const [filename, builtInPath] of builtInMap) {
        if (userMap.has(filename)) {
            // User override wins
            resolvedPaths.push(userMap.get(filename));

            // Version drift detection (FR-010)
            const builtInFm = builtInFrontmatter.get(filename);
            const userFm = userFrontmatter.get(filename);
            if (builtInFm && userFm && builtInFm.version && userFm.version) {
                const cmp = compareSemver(builtInFm.version, userFm.version);
                if (cmp === 1) {
                    // Shipped version is newer than user version
                    driftWarnings.push({
                        filename,
                        userVersion: userFm.version,
                        shippedVersion: builtInFm.version,
                        personaName: userFm.name || deriveDomain(filename)
                    });
                }
            }
        } else {
            // No override, use built-in
            resolvedPaths.push(builtInPath);
        }
        processedFilenames.add(filename);
    }

    // Add user-only personas (not overrides)
    for (const [filename, userPath] of userMap) {
        if (!processedFilenames.has(filename)) {
            resolvedPaths.push(userPath);
        }
    }

    return { paths: resolvedPaths, driftWarnings, skippedFiles };
}

/**
 * Filter persona paths by active roster names.
 * Roster names are matched against the derived name from the filename
 * (e.g., "security-reviewer" matches "persona-security-reviewer.md").
 *
 * @param {string[]} paths - All discovered persona paths
 * @param {string[]} roster - Active roster names (e.g., ['security-reviewer', 'devops-engineer'])
 * @returns {string[]} Filtered paths matching the roster
 * @traces FR-003, FR-005, AC-003-02, AC-003-05, AC-005-01
 */
function filterByRoster(paths, roster) {
    if (!roster || roster.length === 0) return [];
    const rosterSet = new Set(roster.map(r => r.toLowerCase().trim()));
    return paths.filter(p => {
        const basename = path.basename(p);
        const name = basename.replace(/^persona-/, '').replace(/\.md$/, '');
        return rosterSet.has(name.toLowerCase());
    });
}

/**
 * Match persona trigger keywords against issue content.
 * Returns categorized persona names: recommended (2+ hits),
 * uncertain (1 hit), and available (0 hits).
 *
 * @param {string[]} paths - All discovered persona paths
 * @param {string} issueContent - Issue title + body text to match against
 * @param {{ disabled?: string[] }} [opts] - Options including disabled persona list
 * @returns {{ recommended: string[], uncertain: string[], available: string[] }}
 * @traces FR-003, AC-003-03, AC-003-04, AC-003-07
 */
function matchTriggers(paths, issueContent, opts) {
    const disabled = new Set((opts && opts.disabled || []).map(d => d.toLowerCase()));
    const contentLower = (issueContent || '').toLowerCase();
    const recommended = [];
    const uncertain = [];
    const available = [];

    for (const p of paths) {
        const basename = path.basename(p);
        const name = basename.replace(/^persona-/, '').replace(/\.md$/, '');
        const nameLower = name.toLowerCase();

        // Read frontmatter to get triggers
        let triggers = [];
        try {
            const content = fs.readFileSync(p, 'utf8');
            const fm = parseFrontmatter(content);
            if (fm && Array.isArray(fm.triggers)) {
                triggers = fm.triggers;
            }
        } catch (_) {
            // If we can't read, treat as no triggers
        }

        // Count keyword hits
        let hits = 0;
        for (const trigger of triggers) {
            if (contentLower.includes(trigger.toLowerCase())) {
                hits++;
            }
        }

        if (disabled.has(nameLower)) {
            // AC-003-07: disabled personas excluded from recommendation but still available
            available.push(name);
        } else if (hits >= 2) {
            recommended.push(name);
        } else if (hits === 1) {
            uncertain.push(name);
        } else {
            available.push(name);
        }
    }

    return { recommended, uncertain, available };
}

module.exports = {
    getPersonaPaths,
    parseFrontmatter,
    validatePersona,
    isSafeFilename,
    compareSemver,
    deriveDomain,
    filterByRoster,
    matchTriggers,
    PRIMARY_PERSONAS
};
