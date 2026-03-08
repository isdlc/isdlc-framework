'use strict';

/**
 * iSDLC Profile Loader
 * ====================
 * Discovers, loads, validates, and resolves gate profiles from three tiers:
 *   1. Built-in  (src/claude/hooks/config/profiles/*.json)
 *   2. Project   (.isdlc/profiles/*.json)
 *   3. Personal  (~/.isdlc/profiles/*.json)
 *
 * Higher tiers override lower tiers (personal > project > built-in).
 *
 * REQ-0049: Gate profiles — configurable strictness levels
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Known phase keys for validation
const KNOWN_PHASE_KEYS = [
    '00-quick-scan', '01-requirements', '02-impact-analysis', '02-tracing',
    '03-architecture', '04-design', '05-test-strategy', '06-implementation',
    '07-testing', '08-code-review', '09-validation', '10-cicd',
    '11-local-testing', '12-remote-build', '12-test-deploy', '13-production',
    '14-operations', '15-upgrade-plan', '15-upgrade-execute', '15-upgrade',
    '16-quality-loop'
];

// Known override requirement keys
const KNOWN_OVERRIDE_KEYS = [
    'test_iteration', 'constitutional_validation', 'interactive_elicitation',
    'agent_delegation_validation', 'artifact_validation'
];

// ---------------------------------------------------------------------------
// Levenshtein distance (for typo detection)
// ---------------------------------------------------------------------------

function levenshtein(a, b) {
    const m = a.length;
    const n = b.length;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            dp[i][j] = a[i - 1] === b[j - 1]
                ? dp[i - 1][j - 1]
                : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
    }
    return dp[m][n];
}

function findClosestMatch(input, candidates, maxDistance) {
    let best = null;
    let bestDist = maxDistance + 1;
    for (const c of candidates) {
        const d = levenshtein(input.toLowerCase(), c.toLowerCase());
        if (d < bestDist) {
            bestDist = d;
            best = c;
        }
    }
    return bestDist <= maxDistance ? best : null;
}

// ---------------------------------------------------------------------------
// Profile tier directories
// ---------------------------------------------------------------------------

function getBuiltinProfilesDir() {
    return path.resolve(__dirname, '..', 'config', 'profiles');
}

function getProjectProfilesDir(projectRoot) {
    return path.join(projectRoot || getProjectRootSafe(), '.isdlc', 'profiles');
}

function getPersonalProfilesDir() {
    return path.join(os.homedir(), '.isdlc', 'profiles');
}

function getProjectRootSafe() {
    try {
        if (process.env.CLAUDE_PROJECT_DIR) return process.env.CLAUDE_PROJECT_DIR;
        return process.cwd();
    } catch {
        return process.cwd();
    }
}

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

function discoverProfileFiles(dir) {
    try {
        if (!fs.existsSync(dir)) return [];
        const entries = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
        return entries.map(f => path.join(dir, f));
    } catch {
        return [];
    }
}

// ---------------------------------------------------------------------------
// validateProfile
// ---------------------------------------------------------------------------

/**
 * Validates a single profile file against the schema.
 * @param {string} filePath - Absolute path to profile JSON file
 * @returns {ValidationResult}
 */
function validateProfile(filePath) {
    const errors = [];
    const suggestions = [];

    let content;
    try {
        content = fs.readFileSync(filePath, 'utf8');
    } catch (e) {
        return { valid: false, errors: [{ field: '_file', message: `Cannot read file: ${e.message}`, value: null }], suggestions: [] };
    }

    if (!content.trim()) {
        return { valid: false, errors: [{ field: '_file', message: `Profile file is empty`, value: '' }], suggestions: [] };
    }

    let parsed;
    try {
        parsed = JSON.parse(content);
    } catch (e) {
        return { valid: false, errors: [{ field: '_file', message: `Invalid JSON: ${e.message}`, value: content }], suggestions: [] };
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return { valid: false, errors: [{ field: '_root', message: `Root must be a JSON object, got ${Array.isArray(parsed) ? 'array' : typeof parsed}`, value: parsed }], suggestions: [] };
    }

    // Required fields
    if (!parsed.name || typeof parsed.name !== 'string') {
        errors.push({ field: 'name', message: 'Missing or invalid required field: name', value: parsed.name, expected_type: 'string' });
    }
    if (!parsed.description || typeof parsed.description !== 'string') {
        errors.push({ field: 'description', message: 'Missing or invalid required field: description', value: parsed.description, expected_type: 'string' });
    }
    if (!Array.isArray(parsed.triggers) || parsed.triggers.length === 0) {
        errors.push({ field: 'triggers', message: 'Missing or invalid required field: triggers (must be non-empty array of strings)', value: parsed.triggers, expected_type: 'string[]' });
    } else if (parsed.triggers.some(t => typeof t !== 'string')) {
        errors.push({ field: 'triggers', message: 'All triggers must be strings', value: parsed.triggers, expected_type: 'string[]' });
    }

    // Check for unknown top-level fields
    const knownTopLevel = ['name', 'description', 'triggers', 'overrides', 'global_overrides'];
    for (const key of Object.keys(parsed)) {
        if (!knownTopLevel.includes(key)) {
            const match = findClosestMatch(key, knownTopLevel, 3);
            if (match) {
                suggestions.push({ field: key, original: key, suggested: match, confidence: levenshtein(key, match) < 2 ? 'high' : 'medium' });
            }
            errors.push({ field: key, message: `Unknown field '${key}'${match ? `. Did you mean '${match}'?` : ' — will be ignored'}`, value: parsed[key] });
        }
    }

    // Validate overrides (per-phase)
    if (parsed.overrides && typeof parsed.overrides === 'object') {
        for (const phaseKey of Object.keys(parsed.overrides)) {
            if (!KNOWN_PHASE_KEYS.includes(phaseKey)) {
                const match = findClosestMatch(phaseKey, KNOWN_PHASE_KEYS, 3);
                if (match) {
                    suggestions.push({ field: `overrides.${phaseKey}`, original: phaseKey, suggested: match, confidence: levenshtein(phaseKey, match) < 2 ? 'high' : 'medium' });
                }
                errors.push({ field: `overrides.${phaseKey}`, message: `Unknown phase key '${phaseKey}'${match ? `. Did you mean '${match}'?` : ''}`, value: parsed.overrides[phaseKey] });
            } else {
                validateOverrideBlock(parsed.overrides[phaseKey], `overrides.${phaseKey}`, errors, suggestions);
            }
        }
    }

    // Validate global_overrides
    if (parsed.global_overrides && typeof parsed.global_overrides === 'object') {
        validateOverrideBlock(parsed.global_overrides, 'global_overrides', errors, suggestions);
    }

    return { valid: errors.length === 0, errors, suggestions };
}

function validateOverrideBlock(block, prefix, errors, suggestions) {
    if (typeof block !== 'object' || block === null) return;
    for (const key of Object.keys(block)) {
        if (!KNOWN_OVERRIDE_KEYS.includes(key)) {
            const match = findClosestMatch(key, KNOWN_OVERRIDE_KEYS, 3);
            if (match) {
                suggestions.push({ field: `${prefix}.${key}`, original: key, suggested: match, confidence: levenshtein(key, match) < 2 ? 'high' : 'medium' });
            }
            errors.push({ field: `${prefix}.${key}`, message: `Unknown override key '${key}'${match ? `. Did you mean '${match}'?` : ''}`, value: block[key] });
        }
    }
}

// ---------------------------------------------------------------------------
// healProfile
// ---------------------------------------------------------------------------

/**
 * Applies suggested fixes to a profile file.
 * @param {string} filePath - Absolute path to profile JSON file
 * @param {SuggestedFix[]} fixes - Fixes to apply
 * @returns {boolean} true if successful
 */
function healProfile(filePath, fixes) {
    try {
        let content = fs.readFileSync(filePath, 'utf8');
        let parsed = JSON.parse(content);

        for (const fix of fixes) {
            // Navigate to the parent of the field and rename the key
            const parts = fix.field.split('.');
            let target = parsed;
            for (let i = 0; i < parts.length - 1; i++) {
                target = target[parts[i]];
                if (!target) break;
            }
            if (target && parts.length > 0) {
                const oldKey = fix.original;
                const newKey = fix.suggested;
                if (target[oldKey] !== undefined) {
                    target[newKey] = target[oldKey];
                    delete target[oldKey];
                }
            }
        }

        fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2) + '\n');
        return true;
    } catch {
        return false;
    }
}

// ---------------------------------------------------------------------------
// loadAllProfiles
// ---------------------------------------------------------------------------

/**
 * Discovers and loads all profiles from all three tiers.
 * @param {string} [projectRoot] - Project root path
 * @returns {ProfileRegistry}
 */
function loadAllProfiles(projectRoot) {
    const registry = {
        profiles: new Map(),
        sources: { builtin: [], project: [], personal: [] }
    };

    // Load tiers in order: built-in first, then project, then personal (last wins)
    const tiers = [
        { dir: getBuiltinProfilesDir(), source: 'built-in', sourceKey: 'builtin' },
        { dir: getProjectProfilesDir(projectRoot), source: 'project', sourceKey: 'project' },
        { dir: getPersonalProfilesDir(), source: 'personal', sourceKey: 'personal' }
    ];

    for (const tier of tiers) {
        const files = discoverProfileFiles(tier.dir);
        for (const filePath of files) {
            const validation = validateProfile(filePath);
            if (!validation.valid) {
                // Skip invalid profiles; they are excluded from the registry
                continue;
            }

            try {
                const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                const result = {
                    profile: parsed,
                    source: tier.source,
                    source_path: filePath,
                    warnings: [],
                    was_healed: false
                };

                // Higher tier overwrites lower tier (Map.set replaces)
                registry.profiles.set(parsed.name, result);
                // Track which source provided it (if overwritten, update the source list)
                if (!registry.sources[tier.sourceKey].includes(parsed.name)) {
                    registry.sources[tier.sourceKey].push(parsed.name);
                }
            } catch {
                // JSON parse failure (shouldn't happen after validateProfile, but be safe)
            }
        }
    }

    return registry;
}

// ---------------------------------------------------------------------------
// resolveProfile
// ---------------------------------------------------------------------------

/**
 * Resolves a profile by name from the registry.
 * @param {string} name - Profile name to resolve
 * @param {ProfileRegistry} [registry] - Pre-loaded registry
 * @returns {ProfileResolutionResult|null}
 */
function resolveProfile(name, registry) {
    if (!name) return null;
    const reg = registry || loadAllProfiles();
    return reg.profiles.get(name) || null;
}

// ---------------------------------------------------------------------------
// matchProfileByTrigger
// ---------------------------------------------------------------------------

/**
 * Matches user natural language input against profile triggers.
 * @param {string} input - User's natural language input
 * @param {ProfileRegistry} [registry] - Pre-loaded registry
 * @returns {ProfileResolutionResult|null}
 */
function matchProfileByTrigger(input, registry) {
    if (!input) return null;
    const reg = registry || loadAllProfiles();
    const normalizedInput = input.toLowerCase().trim();

    const matches = [];
    for (const [, result] of reg.profiles) {
        for (const trigger of result.profile.triggers) {
            if (normalizedInput.includes(trigger.toLowerCase())) {
                matches.push(result);
                break; // Only count each profile once
            }
        }
    }

    if (matches.length === 1) return matches[0];
    return null; // No match or ambiguous
}

// ---------------------------------------------------------------------------
// resolveProfileOverrides
// ---------------------------------------------------------------------------

/**
 * Resolves the effective overrides for a profile and phase.
 * Merges global_overrides with phase-specific overrides (phase wins).
 *
 * @param {string} profileName - Profile name
 * @param {string} currentPhase - Current phase key
 * @param {ProfileRegistry} [registry] - Pre-loaded registry
 * @returns {object|null} Merged overrides or null
 */
function resolveProfileOverrides(profileName, currentPhase, registry) {
    const result = resolveProfile(profileName, registry);
    if (!result) return null;

    const profile = result.profile;
    const rawGlobal = profile.global_overrides;
    const rawPhase = profile.overrides?.[currentPhase];
    const globalOverrides = (rawGlobal && typeof rawGlobal === 'object' && Object.keys(rawGlobal).length > 0) ? rawGlobal : null;
    const phaseOverrides = (rawPhase && typeof rawPhase === 'object' && Object.keys(rawPhase).length > 0) ? rawPhase : null;

    if (!globalOverrides && !phaseOverrides) return null;
    if (!globalOverrides) return phaseOverrides;
    if (!phaseOverrides) return globalOverrides;

    // Merge: global first, phase-specific overrides win
    const merged = deepMerge(globalOverrides, phaseOverrides);
    return (merged && Object.keys(merged).length > 0) ? merged : null;
}

// ---------------------------------------------------------------------------
// checkThresholdWarnings
// ---------------------------------------------------------------------------

/**
 * Compares profile thresholds against recommended minimums.
 * @param {ProfileDefinition} profile - The profile to check
 * @param {object} baseRequirements - Base phase requirements from iteration-requirements.json
 * @returns {string[]} Array of warning strings
 */
function checkThresholdWarnings(profile, baseRequirements) {
    const warnings = [];
    const name = profile.name || 'unknown';

    // Check global_overrides for concerning settings
    const g = profile.global_overrides;
    if (g) {
        if (g.constitutional_validation?.enabled === false) {
            warnings.push(`Profile '${name}' disables constitutional validation`);
        }
        if (g.test_iteration?.enabled === false) {
            warnings.push(`Profile '${name}' disables test iteration`);
        }
        if (g.test_iteration?.success_criteria?.min_coverage_percent !== undefined &&
            g.test_iteration.success_criteria.min_coverage_percent < 80) {
            warnings.push(`Profile '${name}' sets coverage to ${g.test_iteration.success_criteria.min_coverage_percent}% (recommended: 80%)`);
        }
        if (g.test_iteration?.max_iterations !== undefined &&
            g.test_iteration.max_iterations < 5) {
            warnings.push(`Profile '${name}' reduces max iterations to ${g.test_iteration.max_iterations} (recommended: 5+)`);
        }

        // Check if all gates are disabled
        if (g.constitutional_validation?.enabled === false &&
            g.test_iteration?.enabled === false &&
            g.interactive_elicitation?.enabled === false &&
            g.agent_delegation_validation?.enabled === false &&
            g.artifact_validation?.enabled === false) {
            warnings.push(`Profile '${name}' disables all gate checks — no quality validation will run`);
        }
    }

    // Also check per-phase overrides
    if (profile.overrides) {
        for (const [phase, overrides] of Object.entries(profile.overrides)) {
            if (overrides.test_iteration?.success_criteria?.min_coverage_percent !== undefined &&
                overrides.test_iteration.success_criteria.min_coverage_percent < 80) {
                warnings.push(`Profile '${name}' sets coverage to ${overrides.test_iteration.success_criteria.min_coverage_percent}% for phase ${phase} (recommended: 80%)`);
            }
        }
    }

    return warnings;
}

// ---------------------------------------------------------------------------
// Deep merge (local copy - same semantics as mergeRequirements in gate-logic)
// ---------------------------------------------------------------------------

function deepMerge(base, overrides) {
    if (!base) return overrides;
    if (!overrides) return base;
    const merged = JSON.parse(JSON.stringify(base));
    for (const [key, value] of Object.entries(overrides)) {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            merged[key] = deepMerge(merged[key] || {}, value);
        } else {
            merged[key] = value;
        }
    }
    return merged;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
    loadAllProfiles,
    resolveProfile,
    matchProfileByTrigger,
    resolveProfileOverrides,
    validateProfile,
    healProfile,
    checkThresholdWarnings,
    // Exposed for testing
    levenshtein,
    findClosestMatch,
    getBuiltinProfilesDir,
    getProjectProfilesDir,
    getPersonalProfilesDir,
    KNOWN_PHASE_KEYS,
    KNOWN_OVERRIDE_KEYS
};
