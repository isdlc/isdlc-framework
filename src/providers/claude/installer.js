/**
 * Claude Provider Installer — Claude-Specific Installation Logic
 * ================================================================
 * REQ-0089: Provider-aware installer/updater/doctor/uninstaller
 *
 * Extracts Claude Code-specific installation logic:
 * - installClaude(projectRoot, options) — creates .claude/, hooks, settings.json, agents, skills
 * - updateClaude(projectRoot, options) — updates Claude-specific assets
 * - uninstallClaude(projectRoot, options) — removes .claude/ framework files, strips hooks
 * - doctorClaude(projectRoot) — checks: .claude/ exists, hooks registered, settings.json valid
 *
 * These functions only manage the .claude/ directory and Claude Code-specific files.
 * They do NOT touch .isdlc/, docs/, BACKLOG.md, or any shared core files.
 *
 * @module src/providers/claude/installer
 */

import path from 'path';
import {
  exists,
  ensureDir,
  copyDir,
  copy,
  readFile,
  readJson,
  writeJson,
  writeFile,
  remove,
  isDirectory,
  isFile,
  readdir,
  findFiles,
  getFrameworkDir,
  deepMerge,
  convertYamlToJson,
  symlink,
} from '../../../lib/utils/fs-helpers.js';
import { lstat } from 'node:fs/promises';

// ---------------------------------------------------------------------------
// installClaude
// ---------------------------------------------------------------------------

/**
 * Install Claude Code-specific framework files into a project.
 *
 * Creates .claude/ with agents, skills, commands, hooks, settings.json.
 * Also sets up .antigravity symlinks and copies skills manifest to hooks config.
 *
 * @param {string} projectRoot - Target project directory
 * @param {object} options - Installation options
 * @param {boolean} [options.force=false] - Skip confirmation prompts
 * @param {boolean} [options.dryRun=false] - Show what would change
 * @returns {Promise<{installedFiles: string[]}>} List of installed file paths (relative)
 */
export async function installClaude(projectRoot, options = {}) {
  const { dryRun = false } = options;

  const frameworkDir = getFrameworkDir();
  const claudeSource = path.join(frameworkDir, 'claude');
  const isdlcSource = path.join(frameworkDir, 'isdlc');
  const claudeTarget = path.join(projectRoot, '.claude');
  const installedFiles = [];

  if (!(await exists(claudeSource))) {
    throw new Error(`Framework not found at ${claudeSource}. Installation may be corrupted.`);
  }

  if (!dryRun) {
    await ensureDir(claudeTarget);
  }

  // Copy framework directories: agents, commands, skills, hooks
  for (const dir of ['agents', 'commands', 'skills', 'hooks']) {
    const src = path.join(claudeSource, dir);
    if (await exists(src)) {
      if (!dryRun) {
        await copyDir(src, path.join(claudeTarget, dir));
        const trackedFiles = await findFiles(path.join(claudeTarget, dir), () => true);
        installedFiles.push(...trackedFiles.map(f => path.relative(projectRoot, f)));
      }
    }
  }

  // Merge settings.json (preserve user keys, add framework keys)
  const settingsSource = path.join(claudeSource, 'settings.json');
  const settingsTarget = path.join(claudeTarget, 'settings.json');

  if (await exists(settingsSource)) {
    if (!dryRun) {
      if (await exists(settingsTarget)) {
        const existingSettings = await readJson(settingsTarget).catch(() => ({}));
        const frameworkSettings = await readJson(settingsSource);
        const merged = deepMerge(existingSettings, frameworkSettings);
        await writeJson(settingsTarget, merged);
      } else {
        await copy(settingsSource, settingsTarget);
      }
    }
    installedFiles.push('.claude/settings.json');
  }

  // Merge settings.local.json
  const settingsLocalSource = path.join(claudeSource, 'settings.local.json');
  const settingsLocalTarget = path.join(claudeTarget, 'settings.local.json');

  if (await exists(settingsLocalSource)) {
    if (!dryRun) {
      if (await exists(settingsLocalTarget)) {
        const existingLocal = await readJson(settingsLocalTarget).catch(() => ({}));
        const frameworkLocal = await readJson(settingsLocalSource);
        const mergedLocal = deepMerge(existingLocal, frameworkLocal);
        await writeJson(settingsLocalTarget, mergedLocal);
      } else {
        await copy(settingsLocalSource, settingsLocalTarget);
      }
    }
    installedFiles.push('.claude/settings.local.json');
  }

  // Copy CLAUDE.md.template
  const claudeTemplateSource = path.join(claudeSource, 'CLAUDE.md.template');
  if (await exists(claudeTemplateSource)) {
    if (!dryRun) {
      await copy(claudeTemplateSource, path.join(claudeTarget, 'CLAUDE.md.template'));
    }
  }

  // Copy skills manifest to hooks config
  const skillsManifestSource = path.join(isdlcSource, 'config', 'skills-manifest.yaml');
  const hooksConfigDir = path.join(claudeTarget, 'hooks', 'config');

  if (await exists(skillsManifestSource)) {
    if (!dryRun) {
      await ensureDir(hooksConfigDir);
      await copy(skillsManifestSource, path.join(hooksConfigDir, 'skills-manifest.yaml'));

      // Copy pre-built JSON for runtime hooks
      const jsonTarget = path.join(hooksConfigDir, 'skills-manifest.json');
      const hooksJsonSource = path.join(claudeSource, 'hooks', 'config', 'skills-manifest.json');
      const isdlcJsonSource = path.join(isdlcSource, 'config', 'skills-manifest.json');
      if (await exists(hooksJsonSource)) {
        await copy(hooksJsonSource, jsonTarget);
      } else if (await exists(isdlcJsonSource)) {
        await copy(isdlcJsonSource, jsonTarget);
      } else if (!convertYamlToJson(skillsManifestSource, jsonTarget)) {
        // Non-fatal: YAML→JSON conversion may fail
      }
    }
  }

  // Copy workflows.json
  const workflowsSource = path.join(isdlcSource, 'config', 'workflows.json');
  if (await exists(workflowsSource)) {
    if (!dryRun) {
      await ensureDir(hooksConfigDir);
      await copy(workflowsSource, path.join(path.join(projectRoot, '.isdlc'), 'config', 'workflows.json'));
      await copy(workflowsSource, path.join(hooksConfigDir, 'workflows.json'));
    }
  }

  // Copy phase-ordering.json
  const phaseOrderingSource = path.join(isdlcSource, 'config', 'phase-ordering.json');
  if (await exists(phaseOrderingSource)) {
    if (!dryRun) {
      await copy(phaseOrderingSource, path.join(path.join(projectRoot, '.isdlc'), 'config', 'phase-ordering.json'));
      await copy(phaseOrderingSource, path.join(hooksConfigDir, 'phase-ordering.json'));
    }
  }

  // Set up .antigravity symlinks
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
      try { await lstat(linkPath); await remove(linkPath); } catch { /* doesn't exist */ }
      await symlink(target, linkPath);
    }

    // Copy ANTIGRAVITY.md.template
    const agTemplateSource = path.join(frameworkDir, 'antigravity', 'ANTIGRAVITY.md.template');
    const agTemplateTarget = path.join(antigravityTarget, 'ANTIGRAVITY.md.template');
    if (await exists(agTemplateSource)) {
      await copy(agTemplateSource, agTemplateTarget);
    }
  }

  return { installedFiles };
}

// ---------------------------------------------------------------------------
// updateClaude
// ---------------------------------------------------------------------------

/**
 * Update Claude Code-specific framework files in an existing installation.
 *
 * Overwrites agents, skills, commands, hooks while preserving user keys
 * in settings.json and settings.local.json.
 *
 * @param {string} projectRoot - Target project directory
 * @param {object} options - Update options
 * @param {boolean} [options.force=false] - Skip confirmation
 * @param {boolean} [options.dryRun=false] - Show what would change
 * @returns {Promise<{installedFiles: string[]}>} Updated installed files list
 */
export async function updateClaude(projectRoot, options = {}) {
  const { dryRun = false } = options;

  const frameworkDir = getFrameworkDir();
  const claudeSource = path.join(frameworkDir, 'claude');
  const isdlcSource = path.join(frameworkDir, 'isdlc');
  const claudeTarget = path.join(projectRoot, '.claude');
  const installedFiles = [];

  if (!(await exists(claudeSource))) {
    throw new Error(`Framework not found at ${claudeSource}. Installation may be corrupted.`);
  }

  // Copy .claude framework directories
  for (const dir of ['agents', 'commands', 'skills', 'hooks']) {
    const src = path.join(claudeSource, dir);
    if (await exists(src)) {
      const dest = path.join(claudeTarget, dir);
      if (!dryRun) {
        await copyDir(src, dest);
        const trackedFiles = await findFiles(dest, () => true);
        installedFiles.push(...trackedFiles.map(f => path.relative(projectRoot, f)));
      }
    }
  }

  // Merge settings.json
  const settingsSource = path.join(claudeSource, 'settings.json');
  const settingsTarget = path.join(claudeTarget, 'settings.json');

  if (await exists(settingsSource)) {
    if (!dryRun) {
      if (await exists(settingsTarget)) {
        const existingSettings = await readJson(settingsTarget).catch(() => ({}));
        const frameworkSettings = await readJson(settingsSource);
        const merged = deepMerge(existingSettings, frameworkSettings);
        await writeJson(settingsTarget, merged);
      } else {
        await copy(settingsSource, settingsTarget);
      }
    }
    installedFiles.push('.claude/settings.json');
  }

  // Merge settings.local.json
  const settingsLocalSource = path.join(claudeSource, 'settings.local.json');
  const settingsLocalTarget = path.join(claudeTarget, 'settings.local.json');

  if (await exists(settingsLocalSource)) {
    if (!dryRun) {
      if (await exists(settingsLocalTarget)) {
        const existingLocal = await readJson(settingsLocalTarget).catch(() => ({}));
        const frameworkLocal = await readJson(settingsLocalSource);
        const mergedLocal = deepMerge(existingLocal, frameworkLocal);
        await writeJson(settingsLocalTarget, mergedLocal);
      } else {
        await copy(settingsLocalSource, settingsLocalTarget);
      }
    }
    installedFiles.push('.claude/settings.local.json');
  }

  // Copy skills manifest to hooks config
  const skillsManifestSource = path.join(isdlcSource, 'config', 'skills-manifest.yaml');
  const hooksConfigDir = path.join(claudeTarget, 'hooks', 'config');

  if (await exists(skillsManifestSource)) {
    if (!dryRun) {
      await ensureDir(hooksConfigDir);
      await copy(skillsManifestSource, path.join(hooksConfigDir, 'skills-manifest.yaml'));

      const jsonTarget = path.join(hooksConfigDir, 'skills-manifest.json');
      const jsonManifestSource = path.join(isdlcSource, 'config', 'skills-manifest.json');
      if (await exists(jsonManifestSource)) {
        await copy(jsonManifestSource, jsonTarget);
      } else if (!convertYamlToJson(skillsManifestSource, jsonTarget)) {
        // Non-fatal
      }
    }
  }

  // Copy workflows.json
  const workflowsSource = path.join(isdlcSource, 'config', 'workflows.json');
  if (await exists(workflowsSource)) {
    if (!dryRun) {
      await copy(workflowsSource, path.join(hooksConfigDir, 'workflows.json'));
    }
  }

  // Copy phase-ordering.json
  const phaseOrderingSource = path.join(isdlcSource, 'config', 'phase-ordering.json');
  if (await exists(phaseOrderingSource)) {
    if (!dryRun) {
      await copy(phaseOrderingSource, path.join(hooksConfigDir, 'phase-ordering.json'));
    }
  }

  // Sync .antigravity symlinks
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
      try { await lstat(linkPath); await remove(linkPath); } catch { /* doesn't exist */ }
      await symlink(target, linkPath);
    }

    const agTemplateSource = path.join(frameworkDir, 'antigravity', 'ANTIGRAVITY.md.template');
    const agTemplateTarget = path.join(antigravityTarget, 'ANTIGRAVITY.md.template');
    if (await exists(agTemplateSource)) {
      await copy(agTemplateSource, agTemplateTarget);
    }
  }

  return { installedFiles };
}

// ---------------------------------------------------------------------------
// uninstallClaude
// ---------------------------------------------------------------------------

/**
 * Remove Claude Code-specific framework files.
 *
 * Removes framework files from .claude/ based on manifest,
 * strips hooks/permissions from settings.json, cleans empty directories.
 * Preserves settings.local.json and any user-created files.
 *
 * @param {string} projectRoot - Target project directory
 * @param {object} options - Uninstall options
 * @param {boolean} [options.force=false] - Skip confirmation
 * @param {boolean} [options.dryRun=false] - Show what would change
 * @param {string[]} [options.manifestFiles=[]] - Files to remove from manifest
 * @returns {Promise<{removedCount: number, userFilesPreserved: string[]}>}
 */
export async function uninstallClaude(projectRoot, options = {}) {
  const { dryRun = false, manifestFiles = [] } = options;

  const claudeDir = path.join(projectRoot, '.claude');
  const hasClaude = await isDirectory(claudeDir);
  let removedCount = 0;
  const userFilesPreserved = [];

  if (!hasClaude) return { removedCount, userFilesPreserved };

  // Remove manifest files
  if (manifestFiles.length > 0 && !dryRun) {
    for (const file of manifestFiles) {
      const fullPath = path.join(projectRoot, file);
      if (await isFile(fullPath)) {
        await remove(fullPath);
        removedCount++;
      }
    }
  }

  // Clean empty directories
  const dirsToCheck = [
    path.join(claudeDir, 'agents'),
    path.join(claudeDir, 'skills'),
    path.join(claudeDir, 'commands'),
    path.join(claudeDir, 'hooks', 'lib'),
    path.join(claudeDir, 'hooks', 'config'),
    path.join(claudeDir, 'hooks', 'tests'),
    path.join(claudeDir, 'hooks'),
  ];

  for (const dir of dirsToCheck) {
    if (!dryRun) {
      await removeEmptyDir(dir);
    }
  }

  // Strip hooks and permissions from settings.json
  const settingsPath = path.join(claudeDir, 'settings.json');
  if (await exists(settingsPath)) {
    if (!dryRun) {
      try {
        const settings = await readJson(settingsPath);
        delete settings.hooks;
        delete settings.permissions;

        if (Object.keys(settings).length === 0) {
          await remove(settingsPath);
        } else {
          await writeJson(settingsPath, settings);
        }
      } catch {
        // Non-fatal: settings.json cleanup failure
      }
    }
  }

  // Clean empty .claude/ directory (preserve settings.local.json)
  if (!dryRun && (await isDirectory(claudeDir))) {
    const remaining = await readdir(claudeDir);
    const hasUserContent = remaining.some(f => f !== 'settings.local.json' && f !== 'CLAUDE.md.backup');

    if (!hasUserContent && remaining.length === 0) {
      await removeEmptyDir(claudeDir);
    }
  }

  return { removedCount, userFilesPreserved };
}

// ---------------------------------------------------------------------------
// doctorClaude
// ---------------------------------------------------------------------------

/**
 * Check Claude Code-specific installation health.
 *
 * Returns a structured result for composition with doctorCore.
 *
 * @param {string} projectRoot - Project directory
 * @returns {Promise<{healthy: boolean, issues: string[], warnings: string[], passed: string[]}>}
 */
export async function doctorClaude(projectRoot) {
  const issues = [];
  const warnings = [];
  const passed = [];

  const claudeDir = path.join(projectRoot, '.claude');

  // Check 1: .claude/ directory exists
  if (!(await isDirectory(claudeDir))) {
    issues.push('.claude directory missing');
    return { healthy: false, issues, warnings, passed };
  }
  passed.push('.claude directory exists');

  // Check 2: Subdirectories
  const subdirs = ['agents', 'skills', 'commands', 'hooks'];
  let allExist = true;

  for (const subdir of subdirs) {
    const subdirPath = path.join(claudeDir, subdir);
    if (!(await isDirectory(subdirPath))) {
      warnings.push(`.claude/${subdir}/ missing`);
      allExist = false;
    }
  }

  if (allExist) {
    passed.push('.claude directory complete (agents, skills, commands, hooks)');
  }

  // Check 3: settings.json
  const settingsPath = path.join(claudeDir, 'settings.json');
  if (!(await exists(settingsPath))) {
    warnings.push('settings.json missing (hooks may not work)');
  } else {
    try {
      const settings = await readJson(settingsPath);
      if (settings.hooks && typeof settings.hooks === 'object') {
        // Check for hook entries
        const hookArrays = Object.values(settings.hooks);
        const totalHooks = hookArrays.reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0);
        if (totalHooks > 0) {
          passed.push(`${totalHooks} hooks configured`);
        } else if (Array.isArray(settings.hooks) && settings.hooks.length > 0) {
          passed.push(`${settings.hooks.length} hooks configured`);
        } else {
          warnings.push('No hooks configured');
        }
      } else {
        warnings.push('No hooks configured');
      }
    } catch {
      issues.push('settings.json invalid JSON');
    }
  }

  // Check 4: Skills manifest
  const manifestPaths = [
    path.join(claudeDir, 'hooks', 'config', 'skills-manifest.json'),
    path.join(claudeDir, 'hooks', 'config', 'skills-manifest.yaml'),
  ];

  let manifestFound = false;
  for (const mp of manifestPaths) {
    if (await exists(mp)) {
      manifestFound = true;
      passed.push('Skills manifest present');
      break;
    }
  }

  if (!manifestFound) {
    warnings.push('Skills manifest missing');
  }

  return {
    healthy: issues.length === 0,
    issues,
    warnings,
    passed,
  };
}

// ---------------------------------------------------------------------------
// Helpers (private)
// ---------------------------------------------------------------------------

async function removeEmptyDir(dirPath) {
  if (!(await isDirectory(dirPath))) return;
  const entries = await readdir(dirPath);
  if (entries.length === 0) {
    await remove(dirPath);
  }
}

export default { installClaude, updateClaude, uninstallClaude, doctorClaude };
