/**
 * iSDLC Version Checker, Update Notifier & In-Place Updater
 *
 * Checks npm registry for newer versions and displays notifications.
 * Uses a 24-hour cache to avoid excessive network requests.
 * Also provides in-place update of framework files while preserving user artifacts.
 *
 * REQ-0089: Refactored to compose core + provider modules.
 * - Core (provider-neutral) logic: src/core/installer/index.js
 * - Claude provider logic: src/providers/claude/installer.js
 */

import https from 'https';
import path from 'path';
import os from 'os';
import { lstat } from 'node:fs/promises';
import semver from 'semver';
import {
  readJson,
  writeJson,
  exists,
  ensureDir,
  copyDir,
  copy,
  readFile,
  remove,
  isFile,
  findFiles,
  getFrameworkDir,
  deepMerge,
  convertYamlToJson,
  symlink,
} from './utils/fs-helpers.js';
import logger from './utils/logger.js';
import { confirm } from './utils/prompts.js';
import { detectExistingIsdlc } from './project-detector.js';
import { setupSearchCapabilities } from './setup-search.js';
import { fileURLToPath } from 'url';

// REQ-0089: Provider-aware composition imports
import { updateCore } from '../src/core/installer/index.js';
import { updateClaude } from '../src/providers/claude/installer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cache file location (in user's home directory)
const CACHE_FILE = path.join(os.homedir(), '.isdlc-update-check.json');

// Cache duration: 24 hours
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000;

/**
 * Get current installed version from package.json
 * @returns {Promise<string>} Current version
 */
async function getCurrentVersion() {
  const packagePath = path.resolve(__dirname, '..', 'package.json');
  try {
    const pkg = await readJson(packagePath);
    return pkg.version;
  } catch {
    return '0.0.0';
  }
}

/**
 * Fetch latest version from npm registry
 * @param {string} packageName - Package name
 * @returns {Promise<string|null>} Latest version or null on error
 */
function fetchLatestVersion(packageName) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'registry.npmjs.org',
      path: `/${packageName}/latest`,
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      timeout: 5000, // 5 second timeout
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.version || null);
        } catch {
          resolve(null);
        }
      });
    });

    req.on('error', () => {
      resolve(null);
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });

    req.end();
  });
}

/**
 * Check if cache is still valid
 * @returns {Promise<{valid: boolean, data: object|null}>}
 */
async function checkCache() {
  try {
    if (!(await exists(CACHE_FILE))) {
      return { valid: false, data: null };
    }

    const cache = await readJson(CACHE_FILE);
    const now = Date.now();

    if (cache.timestamp && now - cache.timestamp < CACHE_DURATION_MS) {
      return { valid: true, data: cache };
    }

    return { valid: false, data: null };
  } catch {
    return { valid: false, data: null };
  }
}

/**
 * Update the cache file
 * @param {string} currentVersion - Current installed version
 * @param {string} latestVersion - Latest available version
 */
async function updateCache(currentVersion, latestVersion) {
  try {
    await writeJson(CACHE_FILE, {
      timestamp: Date.now(),
      currentVersion,
      latestVersion,
    });
  } catch {
    // Ignore cache write errors
  }
}

/**
 * Check for available updates
 * @returns {Promise<{current: string, latest: string}|null>}
 *          Returns update info if newer version available, null otherwise
 */
export async function checkForUpdates() {
  try {
    // Check cache first
    const { valid, data } = await checkCache();
    const currentVersion = await getCurrentVersion();

    if (valid && data) {
      // Use cached result
      if (semver.gt(data.latestVersion, currentVersion)) {
        return { current: currentVersion, latest: data.latestVersion };
      }
      return null;
    }

    // Fetch from npm registry
    const latestVersion = await fetchLatestVersion('isdlc');

    if (!latestVersion) {
      return null;
    }

    // Update cache
    await updateCache(currentVersion, latestVersion);

    // Compare versions
    if (semver.gt(latestVersion, currentVersion)) {
      return { current: currentVersion, latest: latestVersion };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Display update notification to user
 * @param {string} currentVersion - Current installed version
 * @param {string} latestVersion - Latest available version
 */
export function displayUpdateNotification(currentVersion, latestVersion) {
  logger.box([
    `Update available: ${currentVersion} → ${latestVersion}`,
    '',
    'Run one of the following to update:',
    '  npm update -g isdlc',
    '  npx isdlc@latest init',
  ]);
}

/**
 * Get version from package.json (for external use)
 * @returns {Promise<string>} Current version
 */
export async function getVersion() {
  return getCurrentVersion();
}

/**
 * Track files in a directory for the manifest
 * @param {string} dirPath - Directory to track
 * @param {string} projectRoot - Project root for relative paths
 * @returns {Promise<string[]>} Array of relative file paths
 */
async function trackFiles(dirPath, projectRoot) {
  const files = await findFiles(dirPath, () => true);
  return files.map((f) => path.relative(projectRoot, f));
}

/**
 * Perform an in-place update of framework files in an existing installation.
 * Overwrites framework files (agents, skills, commands, hooks, .isdlc config)
 * while preserving all user artifacts (state.json, constitution, providers.yaml, CLAUDE.md).
 *
 * @param {string} projectRoot - Target project directory
 * @param {object} options - Update options
 * @param {boolean} options.force - Skip confirmation and version check
 * @param {boolean} options.dryRun - Show what would change without making changes
 * @param {boolean} options.backup - Create backup before updating
 */
export async function update(projectRoot, options = {}) {
  const { force = false, dryRun = false, backup = false, noSearchSetup = false } = options;

  logger.header('iSDLC Framework - Update');
  logger.labeled('Project Directory', projectRoot);
  logger.newline();

  // Step 1: Verify installation exists
  logger.step('1/8', 'Verifying existing installation...');
  const existing = await detectExistingIsdlc(projectRoot);

  if (!existing.installed) {
    throw new Error(
      'No iSDLC installation found. Run `isdlc init` first.'
    );
  }

  const installedVersion = existing.version || '0.0.0';
  logger.success(`Existing installation found (v${installedVersion})`);

  // Step 2: Compare versions
  logger.newline();
  logger.step('2/8', 'Comparing versions...');
  const newVersion = await getCurrentVersion();

  logger.labeled('Installed', installedVersion);
  logger.labeled('Available', newVersion);

  if (installedVersion === newVersion && !force) {
    logger.newline();
    logger.success('Already up to date!');
    logger.info('Use --force to reinstall the current version.');
    return;
  }

  if (semver.valid(installedVersion) && semver.valid(newVersion)) {
    if (semver.gt(installedVersion, newVersion) && !force) {
      logger.warning(`Installed version is newer than the package version.`);
      logger.info('Use --force to downgrade.');
      return;
    }
  }

  // Step 3: Confirm
  if (!force) {
    logger.newline();
    logger.info('This will update framework files:');
    logger.listItem('.claude/agents/, skills/, commands/, hooks/');
    logger.listItem('.claude/settings.json (deep-merged)');
    logger.listItem('.isdlc/config/, templates/, scripts/, checklists/');
    logger.newline();
    logger.info('User artifacts will NOT be changed:');
    logger.listItem('.isdlc/state.json, providers.yaml, monorepo.json');
    logger.listItem('docs/isdlc/constitution.md, CLAUDE.md');
    logger.listItem('.claude/settings.local.json');
    logger.newline();

    const proceed = await confirm(`Update ${installedVersion} → ${newVersion}?`, true);
    if (!proceed) {
      logger.info('Update cancelled.');
      return;
    }
  }

  // Step 4: Backup (if requested)
  if (backup) {
    logger.newline();
    logger.step('4/8', 'Creating backup...');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupDir = path.join(projectRoot, `isdlc-backup-${timestamp}`);

    if (!dryRun) {
      await ensureDir(backupDir);
      const claudeDir = path.join(projectRoot, '.claude');
      const isdlcDir = path.join(projectRoot, '.isdlc');

      if (await exists(claudeDir)) {
        await copyDir(claudeDir, path.join(backupDir, '.claude'));
      }
      if (await exists(isdlcDir)) {
        await copyDir(isdlcDir, path.join(backupDir, '.isdlc'));
      }
    }

    logger.success(dryRun ? `[dry-run] Would create backup at ${backupDir}` : `Backup created: ${backupDir}`);
  } else {
    logger.newline();
    logger.step('4/8', 'Skipping backup (use --backup to enable)');
  }

  // Step 5: Load old manifest for change tracking
  logger.newline();
  logger.step('5/8', 'Loading installation manifest...');

  const manifestPath = path.join(projectRoot, '.isdlc', 'installed-files.json');
  let oldManifestFiles = [];

  if (await exists(manifestPath)) {
    try {
      const manifest = await readJson(manifestPath);
      oldManifestFiles = manifest.files || [];
      logger.success(`Old manifest loaded (${oldManifestFiles.length} files tracked)`);
    } catch {
      logger.warning('Could not parse old manifest — skipping removed-files cleanup');
    }
  } else {
    logger.warning('No installation manifest found (legacy install) — skipping removed-files cleanup');
  }

  // Step 6: Copy framework files
  logger.newline();
  logger.step('6/8', 'Copying framework files...');

  const frameworkDir = getFrameworkDir();
  const claudeSource = path.join(frameworkDir, 'claude');
  const isdlcSource = path.join(frameworkDir, 'isdlc');

  if (!(await exists(claudeSource))) {
    throw new Error(`Framework not found at ${claudeSource}. Installation may be corrupted.`);
  }

  const installedFiles = [];
  const claudeTarget = path.join(projectRoot, '.claude');
  const isdlcTarget = path.join(projectRoot, '.isdlc');

  // Copy .claude framework directories
  for (const dir of ['agents', 'commands', 'skills', 'hooks']) {
    const src = path.join(claudeSource, dir);
    if (await exists(src)) {
      const dest = path.join(claudeTarget, dir);
      if (!dryRun) {
        await copyDir(src, dest);
        installedFiles.push(...(await trackFiles(dest, projectRoot)));
      } else {
        // Track from source for accurate dry-run summary
        const srcFiles = await findFiles(src, () => true);
        installedFiles.push(...srcFiles.map((f) => path.join('.claude', dir, path.relative(src, f))));
      }
      logger.success(`Updated ${dir}/`);
    }
  }

  // Merge settings.json (preserve user keys, update framework keys)
  const settingsSource = path.join(claudeSource, 'settings.json');
  const settingsTarget = path.join(claudeTarget, 'settings.json');

  if (await exists(settingsSource)) {
    if (!dryRun) {
      if (await exists(settingsTarget)) {
        const existingSettings = await readJson(settingsTarget).catch(() => ({}));
        const frameworkSettings = await readJson(settingsSource);
        const merged = deepMerge(existingSettings, frameworkSettings);
        await writeJson(settingsTarget, merged);
        logger.success('Merged settings.json');
      } else {
        await copy(settingsSource, settingsTarget);
        logger.success('Copied settings.json');
      }
    } else {
      logger.success('[dry-run] Would merge settings.json');
    }
    installedFiles.push('.claude/settings.json');
  }

  // Merge settings.local.json (preserve user overrides, update framework defaults)
  const settingsLocalSource = path.join(claudeSource, 'settings.local.json');
  const settingsLocalTarget = path.join(claudeTarget, 'settings.local.json');

  if (await exists(settingsLocalSource)) {
    if (!dryRun) {
      if (await exists(settingsLocalTarget)) {
        const existingLocal = await readJson(settingsLocalTarget).catch(() => ({}));
        const frameworkLocal = await readJson(settingsLocalSource);
        const mergedLocal = deepMerge(existingLocal, frameworkLocal);
        await writeJson(settingsLocalTarget, mergedLocal);
        logger.success('Merged settings.local.json');
      } else {
        await copy(settingsLocalSource, settingsLocalTarget);
        logger.success('Copied settings.local.json');
      }
    } else {
      logger.success('[dry-run] Would merge settings.local.json');
    }
    installedFiles.push('.claude/settings.local.json');
  }

  // Copy .isdlc framework directories (config, checklists, templates, scripts)
  for (const dir of ['config', 'checklists', 'templates', 'scripts']) {
    const src = path.join(isdlcSource, dir);
    if (await exists(src)) {
      if (!dryRun) {
        await copyDir(src, path.join(isdlcTarget, dir));
      }
      logger.success(`Updated .isdlc/${dir}/`);
    }
  }

  // Copy skills manifest to hooks config
  const skillsManifestSource = path.join(isdlcSource, 'config', 'skills-manifest.yaml');
  const hooksConfigDir = path.join(claudeTarget, 'hooks', 'config');

  if (await exists(skillsManifestSource)) {
    if (!dryRun) {
      await ensureDir(hooksConfigDir);
      await copy(skillsManifestSource, path.join(hooksConfigDir, 'skills-manifest.yaml'));

      // Convert YAML to JSON for runtime hooks (yq → python3 fallback)
      const jsonTarget = path.join(hooksConfigDir, 'skills-manifest.json');
      const jsonManifestSource = path.join(isdlcSource, 'config', 'skills-manifest.json');
      if (await exists(jsonManifestSource)) {
        await copy(jsonManifestSource, jsonTarget);
      } else if (!convertYamlToJson(skillsManifestSource, jsonTarget)) {
        logger.warning('Could not convert manifest YAML to JSON. Install yq or python3+PyYAML.');
      }
    }
    logger.success('Updated skills manifest in hooks/config/');
  }

  // Copy workflows.json
  const workflowsSource = path.join(isdlcSource, 'config', 'workflows.json');
  if (await exists(workflowsSource)) {
    if (!dryRun) {
      await copy(workflowsSource, path.join(isdlcTarget, 'config', 'workflows.json'));
      await copy(workflowsSource, path.join(hooksConfigDir, 'workflows.json'));
    }
    logger.success('Updated workflow definitions');
  }

  // Copy phase-ordering.json
  const phaseOrderingSource = path.join(isdlcSource, 'config', 'phase-ordering.json');
  if (await exists(phaseOrderingSource)) {
    if (!dryRun) {
      await copy(phaseOrderingSource, path.join(isdlcTarget, 'config', 'phase-ordering.json'));
      await copy(phaseOrderingSource, path.join(hooksConfigDir, 'phase-ordering.json'));
    }
    logger.success('Updated phase ordering config');
  }

  // Copy roundtable.yaml default (only if not already present — preserve user customizations)
  const roundtableSource = path.join(isdlcSource, 'config', 'roundtable.yaml');
  const roundtableTarget = path.join(isdlcTarget, 'roundtable.yaml');
  if (await exists(roundtableSource) && !(await exists(roundtableTarget))) {
    if (!dryRun) {
      await copy(roundtableSource, roundtableTarget);
    }
    logger.success('Created default roundtable.yaml');
  }

  // Step 7: Clean removed files (old manifest entries no longer in new file set)
  logger.newline();
  logger.step('7/8', 'Cleaning removed files...');

  if (oldManifestFiles.length > 0 && !dryRun) {
    const newFileSet = new Set(installedFiles);
    let removedCount = 0;

    for (const oldFile of oldManifestFiles) {
      if (!newFileSet.has(oldFile)) {
        const fullPath = path.join(projectRoot, oldFile);
        if (await isFile(fullPath)) {
          await remove(fullPath);
          removedCount++;
        }
      }
    }

    if (removedCount > 0) {
      logger.success(`Removed ${removedCount} obsolete files`);
    } else {
      logger.success('No obsolete files to remove');
    }
  } else if (dryRun) {
    logger.info('[dry-run] Would check for obsolete files');
  } else {
    logger.info('Skipped (no old manifest)');
  }

  // Step 8: Finalize — regenerate manifest, bump state, update monorepo
  logger.newline();
  logger.step('8/8', 'Finalizing update...');

  const timestamp = new Date().toISOString();

  if (!dryRun) {
    // Regenerate installed-files.json
    const newManifest = {
      version: '1.0.0',
      created: timestamp,
      framework_version: newVersion,
      files: installedFiles,
    };
    await writeJson(manifestPath, newManifest);
    logger.success(`Regenerated manifest (${installedFiles.length} files tracked)`);

    // Update state.json — bump framework_version, add history entry
    const statePath = path.join(isdlcTarget, 'state.json');
    if (await exists(statePath)) {
      try {
        const state = await readJson(statePath);
        state.framework_version = newVersion;
        if (!Array.isArray(state.history)) state.history = [];
        state.history.push({
          timestamp,
          agent: 'npm-updater',
          action: `Framework updated from ${installedVersion} to ${newVersion}`,
        });
        await writeJson(statePath, state);
        logger.success(`Updated state.json (${installedVersion} → ${newVersion})`);
      } catch {
        logger.warning('Could not update state.json');
      }
    }

    // Update monorepo per-project states if present
    const monorepoPath = path.join(isdlcTarget, 'monorepo.json');
    if (await exists(monorepoPath)) {
      try {
        const monorepo = await readJson(monorepoPath);
        const projects = monorepo.projects || {};
        for (const projId of Object.keys(projects)) {
          const projStatePath = path.join(isdlcTarget, 'projects', projId, 'state.json');
          if (await exists(projStatePath)) {
            const projState = await readJson(projStatePath);
            projState.framework_version = newVersion;
            if (!Array.isArray(projState.history)) projState.history = [];
            projState.history.push({
              timestamp,
              agent: 'npm-updater',
              action: `Framework updated from ${installedVersion} to ${newVersion}`,
            });
            await writeJson(projStatePath, projState);
          }
        }
        logger.success('Updated monorepo project states');
      } catch {
        logger.warning('Could not update monorepo project states');
      }
    }
  } else {
    logger.info('[dry-run] Would regenerate manifest and update state.json');
  }

  // Sync .antigravity symlinks (REQ-0032 Bridge)
  const antigravityTarget = path.join(projectRoot, '.antigravity');
  if (!dryRun) {
    await ensureDir(antigravityTarget);
    const linkMap = {
      agents: '../src/claude/agents',
      skills: '../src/claude/skills',
      hooks: '../src/claude/hooks',
      commands: '../src/claude/commands',
    };

    for (const [name, target] of Object.entries(linkMap)) {
      const linkPath = path.join(antigravityTarget, name);
      // BUG-0053 FR-002: Use lstat+remove to handle pre-existing/broken symlinks
      try { await lstat(linkPath); await remove(linkPath); } catch { /* doesn't exist, ok */ }
      await symlink(target, linkPath);
      logger.success(`Linked .antigravity/${name} -> ${target}`);
    }

    // Update ANTIGRAVITY.md.template in .antigravity/
    const agTemplateSource = path.join(frameworkDir, 'antigravity', 'ANTIGRAVITY.md.template');
    const agTemplateTarget = path.join(antigravityTarget, 'ANTIGRAVITY.md.template');
    if (await exists(agTemplateSource)) {
      await copy(agTemplateSource, agTemplateTarget);
      logger.success('Updated ANTIGRAVITY.md.template');
    }

    // Seed ANTIGRAVITY.md in root if missing
    const agMdPath = path.join(projectRoot, 'ANTIGRAVITY.md');
    if (!(await exists(agMdPath)) && (await exists(agTemplateTarget))) {
      let content = await readFile(agTemplateTarget, 'utf8');
      // We don't have the easy access to issue tracker config here without re-reading state
      // but we can at least seed the file.
      await writeFile(agMdPath, content);
      logger.warning('ANTIGRAVITY.md was missing - seeded from template');
    }
  }

  // REQ-0032 FR-006 AC-006-02: Warn if Issue Tracker Configuration section is missing
  const claudeMdPath = path.join(projectRoot, 'CLAUDE.md');
  if (await exists(claudeMdPath)) {
    try {
      const claudeContent = await readFile(claudeMdPath, 'utf8');
      if (!claudeContent.includes('## Issue Tracker Configuration')) {
        logger.warning('CLAUDE.md is missing the "## Issue Tracker Configuration" section.');
        logger.info('Run `isdlc init` or add it manually to enable issue tracker preferences.');
      }
    } catch {
      // Non-blocking: warn but do not fail
    }
  }

  // Rebuild session cache (REQ-0001, FR-007)
  if (!dryRun) {
    try {
      const commonPath = path.join(projectRoot, 'src', 'claude', 'hooks', 'lib', 'common.cjs');
      if (fs.existsSync(commonPath)) {
        const { createRequire: cr } = await import('module');
        const req = cr(import.meta.url);
        const common = req(commonPath);
        if (typeof common.rebuildSessionCache === 'function') {
          const cacheResult = common.rebuildSessionCache({ projectRoot });
          logger.success(`Session cache rebuilt (${cacheResult.size} chars, ${cacheResult.sections.length} sections)`);
        }
      }
    } catch (cacheErr) {
      logger.warning(`Session cache rebuild skipped: ${cacheErr.message}`);
    }
  }

  // Search setup (REQ-0042: detect/configure search tools during update)
  if (!noSearchSetup && !dryRun) {
    try {
      logger.newline();
      await setupSearchCapabilities(projectRoot, { force, dryRun });
    } catch (err) {
      logger.warning(`Search setup skipped: ${err.message}`);
    }
  }

  // BUG-0056 / FR-006: Model version check and re-download
  if (!dryRun) {
    try {
      const { downloadModel, getExpectedModelVersion, getInstalledModelVersion } = await import('./embedding/installer/model-downloader.js');
      const expected = getExpectedModelVersion();
      const installed = await getInstalledModelVersion(projectRoot);

      if (installed !== expected) {
        // AC-006-01: Version differs — re-download
        logger.newline();
        logger.step('Model', installed ? `Model version changed (${installed} → ${expected}), re-downloading...` : 'Model not installed, downloading...');
        // Remove existing model first for clean re-download
        const modelDir = path.join(projectRoot, '.isdlc', 'models', 'codebert-base');
        const { remove: rmDir } = await import('./utils/fs-helpers.js');
        try { await rmDir(modelDir); } catch { /* may not exist */ }

        const dlResult = await downloadModel(projectRoot);
        if (dlResult.ready) {
          logger.success('CodeBERT model updated');
        } else {
          // AC-006-03: Non-blocking on failure
          logger.warning(`Model update skipped: ${dlResult.reason || 'download failed'}`);
        }
      } else {
        // AC-006-02: Version matches — skip
        logger.success('CodeBERT model version current');
      }
    } catch (modelErr) {
      // AC-006-03: Non-blocking on failure
      logger.warning(`Model version check skipped: ${modelErr.message}`);
    }
  }

  // Summary
  logger.newline();
  logger.header(dryRun ? 'Dry Run Complete' : 'Update Complete!');

  logger.labeled('Previous version', installedVersion);
  logger.labeled('New version', newVersion);
  logger.labeled('Files tracked', String(installedFiles.length));
  logger.newline();

  logger.success('Framework files updated');
  logger.success('User artifacts preserved');

  if (dryRun) {
    logger.newline();
    logger.warning('(Dry run — no changes were made)');
  }

  logger.newline();
  logger.info('Run `isdlc doctor` to verify installation health.');
  logger.info('Run `isdlc setup-knowledge` to set up or rebuild semantic search embeddings.');
}

export default {
  checkForUpdates,
  displayUpdateNotification,
  getVersion,
  update,
};
