/**
 * iSDLC Doctor - Installation Health Checker
 *
 * Validates installation integrity and reports issues.
 *
 * REQ-0089: Refactored to compose core + provider modules.
 * - Core (provider-neutral) logic: src/core/installer/index.js
 * - Claude provider logic: src/providers/claude/installer.js
 */

import path from 'path';
import { exists, readJson, isDirectory } from './utils/fs-helpers.js';
import logger from './utils/logger.js';
import { detectExistingIsdlc } from './project-detector.js';
import { getVersion } from './updater.js';

// REQ-0089: Provider-aware composition imports
import { doctorCore } from '../src/core/installer/index.js';
import { doctorClaude } from '../src/providers/claude/installer.js';

/**
 * Run installation health check
 * @param {string} projectRoot - Project directory
 * @param {object} options - Options
 */
export async function runDoctor(projectRoot, options = {}) {
  logger.header('iSDLC Doctor - Installation Health Check');
  logger.labeled('Project', projectRoot);
  logger.newline();

  const issues = [];
  const warnings = [];
  const passed = [];

  // Check 1: Framework installed
  logger.step('1/8', 'Checking framework installation...');
  const installation = await detectExistingIsdlc(projectRoot);

  if (!installation.installed) {
    issues.push('iSDLC framework not installed in this directory');
    logger.error('Not installed');
    showSummary(issues, warnings, passed);
    return;
  }

  passed.push('Framework installed');
  logger.success(`Framework installed (v${installation.version || 'unknown'})`);

  // Check 2: .claude directory
  logger.step('2/8', 'Checking .claude directory...');
  const claudeDir = path.join(projectRoot, '.claude');

  if (!(await isDirectory(claudeDir))) {
    issues.push('.claude directory missing');
    logger.error('Missing');
  } else {
    // Check subdirectories
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
      passed.push('.claude directory complete');
      logger.success('Complete (agents, skills, commands, hooks)');
    } else {
      logger.warning('Some subdirectories missing');
    }
  }

  // Check 3: .isdlc directory
  logger.step('3/8', 'Checking .isdlc directory...');
  const isdlcDir = path.join(projectRoot, '.isdlc');

  if (!(await isDirectory(isdlcDir))) {
    issues.push('.isdlc directory missing');
    logger.error('Missing');
  } else {
    passed.push('.isdlc directory exists');
    logger.success('Exists');
  }

  // Check 4: state.json
  logger.step('4/8', 'Checking state.json...');
  const statePath = path.join(isdlcDir, 'state.json');

  if (!(await exists(statePath))) {
    issues.push('state.json missing');
    logger.error('Missing');
  } else {
    try {
      const state = await readJson(statePath);
      if (state.framework_version && state.project && state.phases) {
        passed.push('state.json valid');
        logger.success(`Valid (project: ${state.project.name}, phase: ${state.current_phase})`);
      } else {
        warnings.push('state.json incomplete');
        logger.warning('Incomplete structure');
      }
    } catch (err) {
      issues.push('state.json invalid JSON');
      logger.error('Invalid JSON');
    }
  }

  // Check 5: Constitution
  logger.step('5/8', 'Checking constitution...');
  const constitutionPath = path.join(projectRoot, 'docs', 'isdlc', 'constitution.md');

  if (!(await exists(constitutionPath))) {
    warnings.push('Constitution not found');
    logger.warning('Not found at docs/isdlc/constitution.md');
  } else {
    const { readFile } = await import('./utils/fs-helpers.js');
    const content = await readFile(constitutionPath);

    if (content.includes('STARTER_TEMPLATE')) {
      warnings.push('Constitution needs customization (run /discover)');
      logger.warning('Needs customization (run /discover)');
    } else {
      passed.push('Constitution customized');
      logger.success('Customized');
    }
  }

  // Check 6: Hooks configuration
  logger.step('6/8', 'Checking hooks configuration...');
  const settingsPath = path.join(claudeDir, 'settings.json');

  if (!(await exists(settingsPath))) {
    warnings.push('settings.json missing (hooks may not work)');
    logger.warning('settings.json missing');
  } else {
    try {
      const settings = await readJson(settingsPath);
      if (settings.hooks && Array.isArray(settings.hooks) && settings.hooks.length > 0) {
        passed.push('Hooks configured');
        logger.success(`${settings.hooks.length} hooks configured`);
      } else {
        warnings.push('No hooks configured');
        logger.warning('No hooks configured');
      }
    } catch (err) {
      issues.push('settings.json invalid');
      logger.error('Invalid JSON');
    }
  }

  // Check 7: Skills manifest
  logger.step('7/8', 'Checking skills manifest...');
  const manifestPaths = [
    path.join(claudeDir, 'hooks', 'config', 'skills-manifest.json'),
    path.join(claudeDir, 'hooks', 'config', 'skills-manifest.yaml'),
  ];

  let manifestFound = false;
  for (const mp of manifestPaths) {
    if (await exists(mp)) {
      manifestFound = true;
      passed.push('Skills manifest present');
      logger.success(`Found: ${path.basename(mp)}`);
      break;
    }
  }

  if (!manifestFound) {
    warnings.push('Skills manifest missing');
    logger.warning('Not found (skill validation may not work)');
  }

  // Check 8: Installation manifest
  logger.step('8/8', 'Checking installation manifest...');
  const installManifestPath = path.join(isdlcDir, 'installed-files.json');

  if (!(await exists(installManifestPath))) {
    warnings.push('Installation manifest missing (uninstall may not be clean)');
    logger.warning('Missing (safe uninstall may not work)');
  } else {
    try {
      const manifest = await readJson(installManifestPath);
      if (manifest.files && Array.isArray(manifest.files)) {
        passed.push('Installation manifest present');
        logger.success(`${manifest.files.length} files tracked`);
      } else {
        warnings.push('Installation manifest invalid');
        logger.warning('Invalid structure');
      }
    } catch (err) {
      issues.push('Installation manifest invalid JSON');
      logger.error('Invalid JSON');
    }
  }

  // Summary
  showSummary(issues, warnings, passed);

  // Version comparison
  logger.newline();
  const currentVersion = await getVersion();
  logger.labeled('CLI Version', currentVersion);
  logger.labeled('Installed Framework Version', installation.version || 'unknown');

  if (installation.version && currentVersion !== installation.version) {
    logger.warning('Version mismatch - consider reinstalling');
  }
}

/**
 * Display summary of health check results
 * @param {string[]} issues - Critical issues
 * @param {string[]} warnings - Warnings
 * @param {string[]} passed - Passed checks
 */
function showSummary(issues, warnings, passed) {
  logger.newline();
  logger.header(issues.length === 0 ? 'Health Check Passed' : 'Issues Found');

  if (passed.length > 0) {
    logger.success(`Passed: ${passed.length} checks`);
  }

  if (warnings.length > 0) {
    logger.warning(`Warnings: ${warnings.length}`);
    for (const w of warnings) {
      logger.listItem(w);
    }
  }

  if (issues.length > 0) {
    logger.error(`Issues: ${issues.length}`);
    for (const i of issues) {
      logger.listItem(i);
    }
    logger.newline();
    logger.info('To fix issues, try reinstalling:');
    logger.log('  npx isdlc init --force');
  }
}

export default { runDoctor };
