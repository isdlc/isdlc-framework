/**
 * iSDLC Cross-Platform Uninstaller
 *
 * Node.js port of uninstall.sh for cross-platform support.
 * Safely removes framework files while preserving user artifacts.
 */

import path from 'path';
import {
  exists,
  readJson,
  writeJson,
  remove,
  readdir,
  isDirectory,
  isFile,
} from './utils/fs-helpers.js';
import logger from './utils/logger.js';
import { confirm, select } from './utils/prompts.js';

/**
 * Main uninstall function
 * @param {string} projectRoot - Target project directory
 * @param {object} options - Uninstall options
 */
export async function uninstall(projectRoot, options = {}) {
  const { force = false, dryRun = false, backup = false, purgeAll = false, purgeDocs = false } = options;

  logger.header('iSDLC Framework - Safe Uninstall');
  logger.labeled('Project Directory', projectRoot);
  logger.newline();

  // Step 1: Detect installation
  const hasIsdlc = await exists(path.join(projectRoot, '.isdlc'));
  const hasClaude = await exists(path.join(projectRoot, '.claude'));
  const manifestPath = path.join(projectRoot, '.isdlc', 'installed-files.json');
  const hasManifest = await exists(manifestPath);
  const isMonorepo = await exists(path.join(projectRoot, '.isdlc', 'monorepo.json'));

  if (!hasIsdlc && !hasClaude) {
    logger.error('No iSDLC framework installation detected.');
    logger.info('Expected .isdlc/ and/or .claude/ to exist.');
    return;
  }

  logger.success('iSDLC framework detected.');
  if (isMonorepo) {
    logger.info('Monorepo installation');
  }

  // Step 2: Load manifest
  let manifest = null;
  let manifestFiles = [];

  if (hasManifest) {
    try {
      manifest = await readJson(manifestPath);
      manifestFiles = manifest.files || [];
      logger.success(`Installation manifest found - ${manifestFiles.length} tracked files`);
    } catch (err) {
      logger.warning('Could not parse manifest file');
    }
  } else {
    logger.newline();
    logger.warning('No installation manifest found.');
    logger.info('This installation was created before manifest tracking was added.');
    logger.info('Cannot distinguish between framework and user files.');
    logger.newline();

    if (!force) {
      const choice = await select('How would you like to proceed?', [
        { title: 'Continue anyway (attempt safe removal)', value: 'continue' },
        { title: 'Abort and manually remove files', value: 'abort' },
      ]);

      if (choice === 'abort') {
        logger.info('Uninstall aborted.');
        return;
      }
    }
  }

  // Step 3: Identify files to remove
  const filesToRemove = [];
  const userFilesPreserved = [];

  if (manifestFiles.length > 0) {
    // Safe mode: only remove manifest files
    for (const file of manifestFiles) {
      const fullPath = path.join(projectRoot, file);
      if (await isFile(fullPath)) {
        filesToRemove.push(file);
      }
    }

    // Find user-created files (not in manifest)
    for (const dir of ['agents', 'skills', 'commands', 'hooks']) {
      const dirPath = path.join(projectRoot, '.claude', dir);
      if (!(await isDirectory(dirPath))) continue;

      const files = await findFilesRecursive(dirPath);
      for (const file of files) {
        const relPath = path.relative(projectRoot, file);
        if (!manifestFiles.includes(relPath)) {
          userFilesPreserved.push(relPath);
        }
      }
    }
  } else {
    // Legacy mode: use pattern matching
    const patterns = await identifyFrameworkFiles(projectRoot);
    filesToRemove.push(...patterns.framework);
    userFilesPreserved.push(...patterns.user);
  }

  // Step 4: Show what will be removed
  logger.newline();
  if (filesToRemove.length > 0) {
    logger.info(`Framework files to remove (${filesToRemove.length}):`);
    for (const file of filesToRemove.slice(0, 10)) {
      logger.listItem(file);
    }
    if (filesToRemove.length > 10) {
      logger.info(`  ... and ${filesToRemove.length - 10} more files`);
    }
  }

  if (userFilesPreserved.length > 0) {
    logger.newline();
    logger.success(`User files PRESERVED (${userFilesPreserved.length}):`);
    for (const file of userFilesPreserved) {
      logger.listItem(file);
    }
  }

  // Show preserved artifacts
  logger.newline();
  logger.success('User artifacts that will be PRESERVED (safe by default):');

  if (hasIsdlc) {
    if (purgeAll) {
      logger.error('  .isdlc/: WILL BE DELETED (--purge-all)');
    } else {
      const stateExists = await exists(path.join(projectRoot, '.isdlc', 'state.json'));
      const constitutionExists = await exists(path.join(projectRoot, 'docs', 'isdlc', 'constitution.md'));
      const checklistsExist = await isDirectory(path.join(projectRoot, 'docs', 'isdlc', 'checklists'));

      if (stateExists) logger.info('  - .isdlc/state.json (project state & history)');
      if (constitutionExists) logger.info('  - docs/isdlc/constitution.md (project constitution)');
      if (checklistsExist) logger.info('  - docs/isdlc/checklists/ (gate responses)');
    }
  }

  // Step 5: Confirm
  logger.newline();
  if (dryRun) {
    logger.info('(--dry-run mode: no changes will be made)');
  }

  if (!force) {
    const proceed = await confirm('Proceed with uninstall?', false);
    if (!proceed) {
      logger.info('Uninstall cancelled.');
      return;
    }
  }

  // Step 6: Backup (if requested)
  if (backup && !dryRun) {
    logger.newline();
    logger.step('Backup', 'Creating backup...');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupDir = path.join(projectRoot, `isdlc-backup-${timestamp}`);

    // Copy files to backup directory
    const { copyDir, ensureDir } = await import('./utils/fs-helpers.js');
    await ensureDir(backupDir);

    if (hasClaude) {
      await copyDir(path.join(projectRoot, '.claude'), path.join(backupDir, '.claude'));
    }
    if (hasIsdlc) {
      await copyDir(path.join(projectRoot, '.isdlc'), path.join(backupDir, '.isdlc'));
    }

    logger.success(`Backup created: ${backupDir}`);
  }

  // Step 7: Remove framework files
  logger.newline();
  logger.step('Remove', 'Removing framework files...');

  let removedCount = 0;
  for (const file of filesToRemove) {
    const fullPath = path.join(projectRoot, file);
    if (!dryRun) {
      await remove(fullPath);
    } else {
      logger.info(`  [dry-run] Would remove: ${file}`);
    }
    removedCount++;
  }

  logger.success(`Removed ${removedCount} framework files`);

  // Step 8: Clean empty directories
  logger.newline();
  logger.step('Cleanup', 'Cleaning empty directories...');

  const dirsToCheck = [
    path.join(projectRoot, '.claude', 'agents'),
    path.join(projectRoot, '.claude', 'skills'),
    path.join(projectRoot, '.claude', 'commands'),
    path.join(projectRoot, '.claude', 'hooks', 'lib'),
    path.join(projectRoot, '.claude', 'hooks', 'config'),
    path.join(projectRoot, '.claude', 'hooks', 'tests'),
    path.join(projectRoot, '.claude', 'hooks'),
  ];

  for (const dir of dirsToCheck) {
    if (!dryRun) {
      await removeEmptyDir(dir);
    }
  }

  // Step 9: Clean settings.json (remove hooks and permissions keys)
  const settingsPath = path.join(projectRoot, '.claude', 'settings.json');
  if (await exists(settingsPath)) {
    logger.newline();
    logger.step('Settings', 'Cleaning settings.json...');

    try {
      const settings = await readJson(settingsPath);
      delete settings.hooks;
      delete settings.permissions;

      if (Object.keys(settings).length === 0) {
        // File would be empty, delete it
        if (!dryRun) {
          await remove(settingsPath);
        }
        logger.success('Removed settings.json (no remaining keys)');
      } else {
        if (!dryRun) {
          await writeJson(settingsPath, settings);
        }
        logger.success('Stripped hooks and permissions from settings.json');
      }
    } catch (err) {
      logger.warning('Could not clean settings.json');
    }
  }

  // Step 10: Clean .isdlc/ (preserve user artifacts unless --purge-all)
  if (hasIsdlc) {
    logger.newline();

    if (purgeAll) {
      logger.step('Purge', 'Removing .isdlc/ completely (--purge-all)...');
      if (!dryRun) {
        await remove(path.join(projectRoot, '.isdlc'));
      }
      logger.error('Removed .isdlc/ (including user artifacts)');
    } else {
      logger.step('Clean', 'Cleaning .isdlc/ (preserving user artifacts)...');

      // Remove framework-only directories
      const frameworkDirs = ['config', 'templates', 'scripts'];
      for (const dir of frameworkDirs) {
        const dirPath = path.join(projectRoot, '.isdlc', dir);
        if (await isDirectory(dirPath)) {
          if (!dryRun) {
            await remove(dirPath);
          }
          logger.success(`Removed .isdlc/${dir}/ (framework config)`);
        }
      }

      // Remove framework-only files
      const frameworkFiles = ['installed-files.json', 'monorepo.json'];
      for (const file of frameworkFiles) {
        const filePath = path.join(projectRoot, '.isdlc', file);
        if (await exists(filePath)) {
          if (!dryRun) {
            await remove(filePath);
          }
          logger.success(`Removed .isdlc/${file}`);
        }
      }

      // Remove empty phases directories
      const phasesDir = path.join(projectRoot, '.isdlc', 'phases');
      if (await isDirectory(phasesDir)) {
        const phases = await readdir(phasesDir);
        for (const phase of phases) {
          const phasePath = path.join(phasesDir, phase);
          if (!dryRun) {
            await removeEmptyDirRecursive(phasePath);
          }
        }
        if (!dryRun) {
          await removeEmptyDir(phasesDir);
        }
      }

      // Remove checklists directory if empty
      const checklistsDir = path.join(projectRoot, '.isdlc', 'checklists');
      if (!dryRun) {
        await removeEmptyDirRecursive(checklistsDir);
      }

      logger.newline();
      logger.success('Runtime state PRESERVED in .isdlc/:');
      if (await exists(path.join(projectRoot, '.isdlc', 'state.json'))) {
        logger.info('  - state.json (project state & history)');
      }
    }
  }

  // Step 10b: Clean embedding infrastructure
  // BUG-0056 / FR-005: Remove model files, embeddings, and user-memory DB
  if (!dryRun) {
    try {
      // AC-005-01: Remove .isdlc/models/ directory
      const modelsDir = path.join(projectRoot, '.isdlc', 'models');
      if (await isDirectory(modelsDir)) {
        await remove(modelsDir);
        logger.success('Removed .isdlc/models/ (embedding model files)');
      }

      // AC-005-02: Remove docs/.embeddings/ contents
      const embeddingsDir = path.join(projectRoot, 'docs', '.embeddings');
      if (await isDirectory(embeddingsDir)) {
        const embFiles = await readdir(embeddingsDir);
        for (const file of embFiles) {
          await remove(path.join(embeddingsDir, file));
        }
        logger.success('Cleaned docs/.embeddings/ contents');
      }

      // AC-005-03: Remove ~/.isdlc/user-memory/memory.db (preserve raw session JSONs)
      try {
        const os = await import('node:os');
        const memoryDbPath = path.join(os.default.homedir(), '.isdlc', 'user-memory', 'memory.db');
        if (await exists(memoryDbPath)) {
          await remove(memoryDbPath);
          logger.success('Removed ~/.isdlc/user-memory/memory.db (raw session files preserved)');
        }
      } catch {
        // Non-blocking: home directory access may fail
      }
    } catch (embErr) {
      logger.warning(`Embedding cleanup skipped: ${embErr.message || 'unknown error'}`);
    }
  }

  // Step 11: Clean docs/ (only if --purge-docs)
  const docsDir = path.join(projectRoot, 'docs');
  if (await isDirectory(docsDir)) {
    if (purgeDocs) {
      logger.newline();
      logger.step('Purge', 'Removing docs/ completely (--purge-docs)...');
      if (!dryRun) {
        await remove(docsDir);
      }
      logger.error('Removed docs/ (including user documents)');
    } else {
      // Only remove empty scaffolding
      const docCount = await countFiles(docsDir);
      if (docCount === 0) {
        logger.newline();
        logger.info('docs/ contains only empty scaffolding - cleaning up');
        if (!dryRun) {
          await remove(docsDir);
        }
      } else {
        logger.newline();
        logger.success(`docs/ preserved (${docCount} user documents)`);
      }
    }
  }

  // Step 12: Clean empty .claude/ directory
  const claudeDir = path.join(projectRoot, '.claude');
  if (await isDirectory(claudeDir)) {
    const remaining = await readdir(claudeDir);
    const hasUserContent = remaining.some((f) => f !== 'settings.local.json' && f !== 'CLAUDE.md.backup');

    if (!hasUserContent) {
      const hasSettingsLocal = await exists(path.join(claudeDir, 'settings.local.json'));
      if (hasSettingsLocal) {
        logger.info('.claude/ contains only settings.local.json — preserving');
      } else {
        if (!dryRun) {
          await removeEmptyDir(claudeDir);
        }
      }
    } else {
      logger.success('.claude/ preserved — contains user files');
    }
  }

  // Summary
  logger.newline();
  logger.header(dryRun ? 'Dry Run Complete' : 'Uninstall Complete');

  logger.labeled('Removed files', String(removedCount));

  if (userFilesPreserved.length > 0) {
    logger.labeled('User files preserved', String(userFilesPreserved.length));
  }

  if (dryRun) {
    logger.newline();
    logger.info('No changes were made. Run without --dry-run to uninstall.');
  }
}

/**
 * Find all files in a directory recursively
 * @param {string} dirPath - Directory path
 * @returns {Promise<string[]>} Array of file paths
 */
async function findFilesRecursive(dirPath) {
  const results = [];

  if (!(await isDirectory(dirPath))) return results;

  const entries = await readdir(dirPath);
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry);
    if (await isDirectory(fullPath)) {
      results.push(...(await findFilesRecursive(fullPath)));
    } else if (await isFile(fullPath)) {
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * Identify framework vs user files using patterns (legacy mode)
 * @param {string} projectRoot - Project root
 * @returns {Promise<{framework: string[], user: string[]}>}
 */
async function identifyFrameworkFiles(projectRoot) {
  const framework = [];
  const user = [];

  // Known framework file patterns
  const frameworkPatterns = [
    /^\d{2}-.*\.md$/, // Numbered agents like 01-requirements-analyst.md
    /^discover-orchestrator\.md$/,
    /^product-analyst\.md$/,
    /^architecture-.*\.md$/,
    /^skills-researcher\.md$/,
    /^gate-blocker\.js$/,
    /^test-watcher\.js$/,
    /^constitution-validator\.js$/,
    /^menu-tracker\.js$/,
    /^skill-validator\.js$/,
    /^log-skill-usage\.js$/,
    /^common\.js$/,
  ];

  for (const dir of ['agents', 'skills', 'commands', 'hooks']) {
    const dirPath = path.join(projectRoot, '.claude', dir);
    if (!(await isDirectory(dirPath))) continue;

    const files = await findFilesRecursive(dirPath);
    for (const file of files) {
      const relPath = path.relative(projectRoot, file);
      const fileName = path.basename(file);

      const isFramework = frameworkPatterns.some((p) => p.test(fileName));

      if (isFramework) {
        framework.push(relPath);
      } else {
        user.push(relPath);
      }
    }
  }

  return { framework, user };
}

/**
 * Remove a directory if it's empty
 * @param {string} dirPath - Directory path
 */
async function removeEmptyDir(dirPath) {
  if (!(await isDirectory(dirPath))) return;

  const entries = await readdir(dirPath);
  if (entries.length === 0) {
    await remove(dirPath);
  }
}

/**
 * Remove empty directories recursively
 * @param {string} dirPath - Directory path
 */
async function removeEmptyDirRecursive(dirPath) {
  if (!(await isDirectory(dirPath))) return;

  const entries = await readdir(dirPath);

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry);
    if (await isDirectory(fullPath)) {
      await removeEmptyDirRecursive(fullPath);
    }
  }

  // Check again if now empty
  const remaining = await readdir(dirPath);
  if (remaining.length === 0) {
    await remove(dirPath);
  }
}

/**
 * Count files in a directory (excluding hidden files)
 * @param {string} dirPath - Directory path
 * @returns {Promise<number>} File count
 */
async function countFiles(dirPath) {
  let count = 0;

  if (!(await isDirectory(dirPath))) return 0;

  const entries = await readdir(dirPath);
  for (const entry of entries) {
    if (entry.startsWith('.')) continue;

    const fullPath = path.join(dirPath, entry);
    if (await isDirectory(fullPath)) {
      count += await countFiles(fullPath);
    } else if (await isFile(fullPath)) {
      count++;
    }
  }

  return count;
}

export default { uninstall };
