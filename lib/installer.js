/**
 * iSDLC Cross-Platform Installer
 *
 * Node.js port of install.sh for cross-platform support.
 * Handles project detection, monorepo setup, and file copying.
 */

import path from 'path';
import { lstat } from 'node:fs/promises';
import { execSync } from 'child_process';
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
  readdir,
  getFrameworkDir,
  getPackageRoot,
  deepMerge,
  findFiles,
  convertYamlToJson,
  symlink,
} from './utils/fs-helpers.js';
import logger from './utils/logger.js';
import { confirm, select, text } from './utils/prompts.js';
import { detectExistingProject, detectProjectName, detectExistingIsdlc } from './project-detector.js';
import { detectMonorepo, discoverProjects, generateMonorepoConfig } from './monorepo-handler.js';
import { setupSearchCapabilities } from './setup-search.js';

/**
 * Detect if the project has a GitHub remote.
 * REQ-0032 FR-001 (AC-001-02, AC-001-03)
 *
 * @param {string} projectRoot - Project directory
 * @returns {Promise<{hasGitHub: boolean, repo: string}>}
 */
async function detectGitHubRemote(projectRoot) {
  try {
    const output = execSync('git remote -v', { cwd: projectRoot, encoding: 'utf-8', timeout: 5000 });
    // Match SSH or HTTPS GitHub URLs
    const match = output.match(/github\.com[:/]([^/\s]+\/[^/\s.]+?)(?:\.git)?\s/);
    if (match) {
      return { hasGitHub: true, repo: match[1] };
    }
    return { hasGitHub: false, repo: '' };
  } catch {
    return { hasGitHub: false, repo: '' };
  }
}

/**
 * Check if the GitHub CLI (gh) is available.
 * REQ-0032 FR-002 (AC-002-01 through AC-002-04)
 *
 * @returns {{available: boolean, version: string}}
 */
function checkGhCli() {
  try {
    const output = execSync('gh --version', { encoding: 'utf-8', timeout: 5000 });
    const versionMatch = output.match(/gh version (\S+)/);
    return { available: true, version: versionMatch ? versionMatch[1] : output.trim().split('\n')[0] };
  } catch {
    return { available: false, version: '' };
  }
}

/**
 * Check if the Atlassian MCP server is configured in Claude Code.
 * REQ-0032 FR-003 (AC-003-01, AC-003-06)
 *
 * @returns {{available: boolean, raw: string}}
 */
function checkAtlassianMcp() {
  try {
    const output = execSync('claude mcp list', { encoding: 'utf-8', timeout: 10000 });
    if (/atlassian/i.test(output)) {
      return { available: true, raw: output };
    }
    return { available: false, raw: output };
  } catch {
    return { available: false, raw: '' };
  }
}

/**
 * Main installation function
 * @param {string} projectRoot - Target project directory
 * @param {object} options - Installation options
 */
export async function install(projectRoot, options = {}) {
  const { monorepo: forceMonorepo = false, force = false, dryRun = false } = options;

  logger.header('iSDLC Framework - Project Installation');
  logger.labeled('Project Directory', projectRoot);
  logger.newline();

  // Step 0: Check for existing installation
  const existingInstall = await detectExistingIsdlc(projectRoot);
  if (existingInstall.installed) {
    logger.warning(`iSDLC framework already installed (v${existingInstall.version || 'unknown'})`);

    if (!force) {
      const proceed = await confirm('Reinstall/upgrade the framework?', false);
      if (!proceed) {
        logger.info('Installation cancelled.');
        return;
      }
    }
  }

  // Step 1: Detect project type
  logger.step('1/8', 'Detecting project type...');
  const projectInfo = await detectExistingProject(projectRoot);
  const projectName = await detectProjectName(projectRoot);

  if (projectInfo.isExisting) {
    logger.success(`Existing project detected (${projectInfo.ecosystem || 'unknown'})`);
    logger.info(`Markers found: ${projectInfo.markers.slice(0, 5).join(', ')}`);
  } else {
    logger.success('New project detected');
  }

  // Step 2: Detect monorepo
  logger.newline();
  logger.step('2/8', 'Checking for monorepo...');
  const monorepoInfo = await detectMonorepo(projectRoot);
  let isMonorepo = forceMonorepo || monorepoInfo.isMonorepo;
  let projects = [];

  if (monorepoInfo.isMonorepo) {
    logger.success(`Monorepo detected (${monorepoInfo.type})`);
    projects = await discoverProjects(projectRoot);

    if (projects.length > 0) {
      logger.info(`Found ${projects.length} sub-projects:`);
      for (const proj of projects) {
        logger.listItem(`${proj.name} (${proj.path})`);
      }
    }
  } else if (forceMonorepo) {
    logger.info('Monorepo mode forced via --monorepo flag');
    projects = await discoverProjects(projectRoot);
  } else {
    logger.info('Single-project mode');
  }

  // Confirm monorepo setting
  if (!force) {
    const defaultMonorepo = monorepoInfo.isMonorepo;
    isMonorepo = await confirm('Configure as monorepo?', defaultMonorepo);

    if (isMonorepo && projects.length === 0) {
      logger.warning('No projects detected. Enter project directories manually.');
      const dirsInput = await text('Project directories (comma-separated, e.g., frontend, backend):', '');

      if (dirsInput) {
        const dirs = dirsInput.split(',').map((d) => d.trim());
        for (const dir of dirs) {
          const dirPath = path.join(projectRoot, dir);
          if (await exists(dirPath)) {
            projects.push({ name: path.basename(dir), path: dir, discovered: false });
            logger.success(`Added: ${dir}`);
          } else {
            logger.warning(`Not found: ${dir} (skipping)`);
          }
        }
      }

      if (projects.length === 0) {
        logger.warning('No valid projects found. Falling back to single-project mode.');
        isMonorepo = false;
      }
    }
  }

  // Step 3: Claude Code detection
  logger.newline();
  logger.step('3/8', 'Checking for Claude Code...');

  let claudeCodeFound = false;
  let claudeCodeVersion = '';

  try {
    claudeCodeVersion = execSync('claude --version', { encoding: 'utf-8', timeout: 5000 }).trim();
    claudeCodeFound = true;
    logger.success(`Claude Code detected: ${claudeCodeVersion}`);
  } catch {
    logger.warning('Claude Code CLI not found on PATH');
    logger.newline();
    logger.info('iSDLC is a framework designed for Claude Code.');
    logger.info('It requires the \'claude\' CLI to function.');
    logger.newline();
    logger.info('Install Claude Code:');
    logger.log('  https://docs.anthropic.com/en/docs/claude-code/overview');
    logger.newline();

    if (!force) {
      const continueWithout = await confirm('Continue anyway? Framework files will be ready when you install Claude Code.', false);
      if (!continueWithout) {
        logger.info('Installation cancelled. Install Claude Code first, then re-run.');
        return;
      }
    } else {
      logger.info('Continuing without Claude Code (--force)');
    }
  }

  // Step 4: Confirm installation
  if (!force) {
    logger.newline();
    logger.info('This will install the iSDLC framework:');
    logger.listItem('.claude/        (agents and skills)');
    logger.listItem('.isdlc/         (project state tracking)');
    logger.listItem('docs/           (documentation)');
    logger.newline();

    const proceed = await confirm('Continue with installation?', true);
    if (!proceed) {
      logger.info('Installation cancelled.');
      return;
    }
  }

  // Provider selection
  logger.newline();
  logger.info('Choose how Claude Code connects to an LLM:');
  logger.newline();

  let providerMode;
  if (options.providerMode) {
    providerMode = options.providerMode;
    logger.info(`Provider: ${providerMode} (from --provider-mode flag)`);
  } else if (force) {
    providerMode = 'claude-code';
    logger.info('Provider: claude-code (default for --force)');
  } else {
    providerMode = await select('Select LLM provider:', [
      { title: 'Claude Code (Anthropic API) — Recommended', value: 'claude-code', description: 'Use your Anthropic account (default)' },
      { title: 'Ollama (local LLM)', value: 'ollama', description: 'Run models locally via Ollama' },
    ]);
  }
  logger.success(`Provider: ${providerMode}`);

  // Issue tracker selection (REQ-0032 FR-001)
  logger.newline();
  logger.info('Configure issue tracker integration:');
  logger.newline();

  const issueTrackerConfig = {
    mode: 'manual',
    jiraProjectKey: '',
    githubRepo: '',
    ghCliAvailable: false,
    mcpAvailable: false,
  };

  // Detect GitHub remote for default selection (FR-001 AC-001-02, AC-001-03)
  const ghRemote = await detectGitHubRemote(projectRoot);
  issueTrackerConfig.githubRepo = ghRemote.repo;

  if (force) {
    // FR-001 AC-001-05: --force defaults to manual
    issueTrackerConfig.mode = 'manual';
    logger.info('Issue tracker: manual (default for --force)');
  } else {
    const defaultIndex = ghRemote.hasGitHub ? 0 : 2; // GitHub pre-selected if remote exists

    const trackerChoice = await select('Select issue tracker:', [
      { title: 'GitHub Issues', value: 'github', description: 'Use GitHub Issues for tracking (requires gh CLI)' },
      { title: 'Jira', value: 'jira', description: 'Use Jira for tracking (requires Atlassian MCP server)' },
      { title: 'None / Manual only', value: 'manual', description: 'No external tracker. Manual descriptions only.' },
    ], defaultIndex);

    issueTrackerConfig.mode = trackerChoice;

    // FR-002: GitHub Issues validation
    if (trackerChoice === 'github') {
      const ghCheck = checkGhCli();
      issueTrackerConfig.ghCliAvailable = ghCheck.available;
      if (ghCheck.available) {
        logger.success(`GitHub CLI detected: ${ghCheck.version}`);
      } else {
        logger.warning('GitHub CLI (gh) not found. Issue fetching will require it. Install: https://cli.github.com/');
      }
    }

    // FR-003: Jira MCP Server validation
    if (trackerChoice === 'jira') {
      const mcpCheck = checkAtlassianMcp();
      issueTrackerConfig.mcpAvailable = mcpCheck.available;
      if (mcpCheck.available) {
        logger.success('Atlassian MCP server detected.');
      } else {
        logger.warning('Atlassian MCP server not found.');
        logger.info('To configure: claude mcp add --transport sse atlassian https://mcp.atlassian.com/v1/sse');
        logger.newline();
        const mcpConfigured = await confirm('Have you configured the Atlassian MCP server?', false);
        if (mcpConfigured) {
          const recheck = checkAtlassianMcp();
          issueTrackerConfig.mcpAvailable = recheck.available;
          if (recheck.available) {
            logger.success('Atlassian MCP server detected.');
          } else {
            logger.warning('Atlassian MCP server still not detected. Falling back to manual mode.');
            issueTrackerConfig.mode = 'manual';
          }
        } else {
          logger.warning('Jira integration will not work until MCP is configured. Falling back to manual.');
          issueTrackerConfig.mode = 'manual';
        }
      }

      // FR-003 AC-003-05: Prompt for Jira project key if MCP available and still in jira mode
      if (issueTrackerConfig.mode === 'jira') {
        const jiraKey = await text('Default Jira project key (e.g., PROJ):', '');
        issueTrackerConfig.jiraProjectKey = jiraKey ? jiraKey.trim().toUpperCase() : '';
      }
    }
  }

  logger.success(`Issue tracker: ${issueTrackerConfig.mode}`);

  // Step 4: Copy framework files
  logger.newline();
  logger.step('4/8', 'Copying framework files...');

  const frameworkDir = getFrameworkDir();
  const claudeSource = path.join(frameworkDir, 'claude');
  const isdlcSource = path.join(frameworkDir, 'isdlc');

  if (!(await exists(claudeSource))) {
    throw new Error(`Framework not found at ${claudeSource}. Installation may be corrupted.`);
  }

  const installedFiles = [];

  // Copy .claude directory
  const claudeTarget = path.join(projectRoot, '.claude');
  await ensureDir(claudeTarget);

  // Copy agents
  if (await exists(path.join(claudeSource, 'agents'))) {
    if (!dryRun) {
      await copyDir(path.join(claudeSource, 'agents'), path.join(claudeTarget, 'agents'));
    }
    logger.success('Copied agents/');
    installedFiles.push(...(await trackFiles(path.join(claudeTarget, 'agents'), projectRoot)));
  }

  // Copy commands
  if (await exists(path.join(claudeSource, 'commands'))) {
    if (!dryRun) {
      await copyDir(path.join(claudeSource, 'commands'), path.join(claudeTarget, 'commands'));
    }
    logger.success('Copied commands/');
    installedFiles.push(...(await trackFiles(path.join(claudeTarget, 'commands'), projectRoot)));
  }

  // Copy skills
  if (await exists(path.join(claudeSource, 'skills'))) {
    if (!dryRun) {
      await copyDir(path.join(claudeSource, 'skills'), path.join(claudeTarget, 'skills'));
    }
    logger.success('Copied skills/');
    installedFiles.push(...(await trackFiles(path.join(claudeTarget, 'skills'), projectRoot)));
  }

  // Copy hooks
  if (await exists(path.join(claudeSource, 'hooks'))) {
    if (!dryRun) {
      await copyDir(path.join(claudeSource, 'hooks'), path.join(claudeTarget, 'hooks'));
    }
    logger.success('Copied hooks/');
    installedFiles.push(...(await trackFiles(path.join(claudeTarget, 'hooks'), projectRoot)));
  }

  // Copy settings.json (merge if exists)
  const settingsSource = path.join(claudeSource, 'settings.json');
  const settingsTarget = path.join(claudeTarget, 'settings.json');

  if (await exists(settingsSource)) {
    if (!dryRun) {
      if (await exists(settingsTarget)) {
        // Merge settings
        const existing = await readJson(settingsTarget).catch(() => ({}));
        const framework = await readJson(settingsSource);
        const merged = deepMerge(existing, framework);
        await writeJson(settingsTarget, merged);
        logger.success('Merged settings.json');
      } else {
        await copy(settingsSource, settingsTarget);
        logger.success('Copied settings.json');
      }
    }
    installedFiles.push('.claude/settings.json');
  }

  // Copy or merge settings.local.json
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
    }
    installedFiles.push('.claude/settings.local.json');
  }

  // Copy CLAUDE.md.template to .claude/ (needed for CLAUDE.md seeding)
  const claudeTemplateSource = path.join(claudeSource, 'CLAUDE.md.template');
  if (await exists(claudeTemplateSource)) {
    if (!dryRun) {
      await copy(claudeTemplateSource, path.join(claudeTarget, 'CLAUDE.md.template'));
    }
    logger.success('Copied CLAUDE.md.template');
  }

  // Set up .antigravity directory (REQ-0032 Bridge)
  const antigravityTarget = path.join(projectRoot, '.antigravity');
  if (!dryRun) {
    await ensureDir(antigravityTarget);
    // Create symlinks to mirror .claude structure for Antigravity
    const linkMap = {
      agents: '../src/claude/agents',
      skills: '../src/claude/skills',
      hooks: '../src/claude/hooks',
      commands: '../src/claude/commands',
    };

    for (const [name, target] of Object.entries(linkMap)) {
      const linkPath = path.join(antigravityTarget, name);
      // BUG-0053 FR-001: Use lstat+remove to handle pre-existing/broken symlinks
      try { await lstat(linkPath); await remove(linkPath); } catch { /* doesn't exist, ok */ }
      await symlink(target, linkPath);
      logger.success(`Linked .antigravity/${name} -> ${target}`);
    }
  }

  // Copy ANTIGRAVITY.md.template (if it exists in src/antigravity or src/claude)
  const agTemplateSource = path.join(frameworkDir, 'antigravity', 'ANTIGRAVITY.md.template');
  const agTemplateTarget = path.join(antigravityTarget, 'ANTIGRAVITY.md.template');
  if (await exists(agTemplateSource)) {
    if (!dryRun) {
      await copy(agTemplateSource, agTemplateTarget);
    }
    logger.success('Copied ANTIGRAVITY.md.template');
  }

  // Warn user to review permissions
  logger.newline();
  logger.warning('Review .claude/settings.local.json permissions — adjust if your security requirements differ');

  // Step 5: Setup .isdlc directory
  logger.newline();
  logger.step('5/8', 'Setting up .isdlc folder...');

  const isdlcTarget = path.join(projectRoot, '.isdlc');
  await ensureDir(isdlcTarget);

  // Create phase directories
  const phases = [
    '01-requirements',
    '02-architecture',
    '03-design',
    '04-test-strategy',
    '05-implementation',
    '06-testing',
    '07-code-review',
    '08-validation',
    '09-cicd',
    '10-local-testing',
    '11-test-deploy',
    '12-production',
    '13-operations',
  ];

  for (const phase of phases) {
    if (!dryRun) {
      await ensureDir(path.join(isdlcTarget, 'phases', phase, 'artifacts'));
    }
  }
  logger.success('Created phase directories');

  // Create user workflows directory (for custom workflow YAML files)
  if (!dryRun) {
    await ensureDir(path.join(isdlcTarget, 'workflows'));
  }
  logger.success('Created workflows directory');

  // Copy config
  if (await exists(path.join(isdlcSource, 'config'))) {
    if (!dryRun) {
      await copyDir(path.join(isdlcSource, 'config'), path.join(isdlcTarget, 'config'));
    }
    logger.success('Copied config files');
  }

  // Copy checklists
  if (await exists(path.join(isdlcSource, 'checklists'))) {
    if (!dryRun) {
      await copyDir(path.join(isdlcSource, 'checklists'), path.join(isdlcTarget, 'checklists'));
    }
    logger.success('Copied gate checklists');
  }

  // Copy templates
  if (await exists(path.join(isdlcSource, 'templates'))) {
    if (!dryRun) {
      await copyDir(path.join(isdlcSource, 'templates'), path.join(isdlcTarget, 'templates'));
    }
    logger.success('Copied templates');
  }

  // Copy scripts
  if (await exists(path.join(isdlcSource, 'scripts'))) {
    if (!dryRun) {
      await copyDir(path.join(isdlcSource, 'scripts'), path.join(isdlcTarget, 'scripts'));
    }
    logger.success('Copied utility scripts');
  }

  // Copy uninstall and update shell scripts from package root
  const packageRoot = getPackageRoot();
  const scriptsTarget = path.join(isdlcTarget, 'scripts');
  if (!dryRun) {
    await ensureDir(scriptsTarget);
  }
  for (const scriptName of ['uninstall.sh', 'update.sh', 'uninstall.ps1', 'update.ps1']) {
    const scriptSource = path.join(packageRoot, scriptName);
    if (await exists(scriptSource)) {
      if (!dryRun) {
        await copy(scriptSource, path.join(scriptsTarget, scriptName));
      }
      logger.success(`Copied ${scriptName} to .isdlc/scripts/`);
    }
  }

  // Generate providers.yaml from template
  // NOTE: Disabled — framework is Claude Code-specific. No providers.yaml needed.
  // const providersTarget = path.join(isdlcTarget, 'providers.yaml');
  // if (await exists(providersTarget)) {
  //   logger.warning('providers.yaml already exists — skipping (use /provider set to change mode)');
  // } else {
  //   const providersTemplatePath = path.join(isdlcSource, 'templates', 'providers.yaml.template');
  //   if (await exists(providersTemplatePath)) {
  //     if (!dryRun) {
  //       let templateContent = await readFile(providersTemplatePath);
  //       templateContent = templateContent.replace(
  //         /^active_mode:\s*"[^"]*"/m,
  //         `active_mode: "${providerMode}"`
  //       );
  //       await writeFile(providersTarget, templateContent);
  //     }
  //     logger.success(`Generated providers.yaml (mode: ${providerMode})`);
  //   } else {
  //     logger.warning('providers.yaml.template not found — skipping provider config');
  //   }
  // }

  // Copy skills manifest to hooks config
  const skillsManifestSource = path.join(isdlcSource, 'config', 'skills-manifest.yaml');
  const hooksConfigDir = path.join(claudeTarget, 'hooks', 'config');

  if (await exists(skillsManifestSource)) {
    if (!dryRun) {
      await ensureDir(hooksConfigDir);
      await copy(skillsManifestSource, path.join(hooksConfigDir, 'skills-manifest.yaml'));

      // Copy pre-built JSON for runtime hooks (hooks only read JSON)
      const jsonTarget = path.join(hooksConfigDir, 'skills-manifest.json');
      const hooksJsonSource = path.join(claudeSource, 'hooks', 'config', 'skills-manifest.json');
      const isdlcJsonSource = path.join(isdlcSource, 'config', 'skills-manifest.json');
      if (await exists(hooksJsonSource)) {
        await copy(hooksJsonSource, jsonTarget);
      } else if (await exists(isdlcJsonSource)) {
        await copy(isdlcJsonSource, jsonTarget);
      } else if (!convertYamlToJson(skillsManifestSource, jsonTarget)) {
        logger.warning('Could not convert manifest YAML to JSON. Install yq or python3+PyYAML.');
      }
    }
    logger.success('Copied skills manifest');
  }

  // Copy workflows.json
  const workflowsSource = path.join(isdlcSource, 'config', 'workflows.json');
  if (await exists(workflowsSource)) {
    if (!dryRun) {
      await copy(workflowsSource, path.join(isdlcTarget, 'config', 'workflows.json'));
      await copy(workflowsSource, path.join(hooksConfigDir, 'workflows.json'));
    }
    logger.success('Copied workflow definitions');
  }

  // Copy phase-ordering.json
  const phaseOrderingSource = path.join(isdlcSource, 'config', 'phase-ordering.json');
  if (await exists(phaseOrderingSource)) {
    if (!dryRun) {
      await copy(phaseOrderingSource, path.join(isdlcTarget, 'config', 'phase-ordering.json'));
    }
    logger.success('Copied phase ordering config');
  }

  // Copy roundtable.yaml default (only if not already present)
  const roundtableSource = path.join(isdlcSource, 'config', 'roundtable.yaml');
  const roundtableTarget = path.join(isdlcTarget, 'roundtable.yaml');
  if (await exists(roundtableSource) && !(await exists(roundtableTarget))) {
    if (!dryRun) {
      await copy(roundtableSource, roundtableTarget);
    }
    logger.success('Created default roundtable.yaml');
  }

  // Step 6: Setup docs
  logger.newline();
  logger.step('6/8', 'Setting up docs folder...');

  const docsTarget = path.join(projectRoot, 'docs');
  if (!dryRun) {
    await ensureDir(path.join(docsTarget, 'requirements'));
    await ensureDir(path.join(docsTarget, 'architecture'));
    await ensureDir(path.join(docsTarget, 'design'));
    await ensureDir(path.join(docsTarget, 'isdlc', 'checklists'));
  }
  logger.success('Created docs structure');

  // Copy requirement templates
  const reqTemplatesSource = path.join(isdlcSource, 'templates', 'requirements');
  if (await exists(reqTemplatesSource)) {
    if (!dryRun) {
      await copyDir(reqTemplatesSource, path.join(docsTarget, 'requirements'));
    }
    logger.success('Copied requirement templates');
  }

  // Create docs README
  if (!dryRun) {
    await writeFile(path.join(docsTarget, 'README.md'), generateDocsReadme());
  }
  logger.success('Created docs/README.md');

  // Copy and generate constitution
  const constitutionTarget = path.join(docsTarget, 'isdlc', 'constitution.md');
  if (!dryRun) {
    await writeFile(constitutionTarget, generateConstitution(projectName));
  }
  logger.success('Created project constitution');

  // Step 7: Generate state.json
  logger.newline();
  logger.step('7/8', 'Generating project state...');

  const timestamp = new Date().toISOString();
  const state = generateState(projectName, projectInfo.isExisting, timestamp, providerMode);

  if (!dryRun) {
    await writeJson(path.join(isdlcTarget, 'state.json'), state);
  }
  logger.success('Created state.json');

  // Create provider.env for Ollama users
  if (providerMode === 'ollama') {
    const providerEnvPath = path.join(isdlcTarget, 'provider.env');
    if (!dryRun) {
      const providerEnvContent = `# iSDLC Ollama Provider Configuration
# Created by installer. Edit to change provider settings.
export ANTHROPIC_BASE_URL=http://localhost:11434
export ANTHROPIC_AUTH_TOKEN=ollama
export ANTHROPIC_API_KEY=""
`;
      await writeFile(providerEnvPath, providerEnvContent);
    }
    logger.success('Created .isdlc/provider.env (Ollama configuration)');
  }

  // Step 8: Search capabilities setup
  // REQ-0042 / FR-001, FR-002: Setup pipeline integration with opt-out
  if (!options.noSearchSetup) {
    logger.newline();
    await setupSearchCapabilities(projectRoot, { force, dryRun });
  }

  // Step 8b: Embedding infrastructure setup
  // BUG-0056 / FR-004: Create embedding dirs and attempt model download
  if (!dryRun) {
    try {
      // AC-004-01: Create user-memory directory
      const os = await import('node:os');
      const userMemoryDir = path.join(os.default.homedir(), '.isdlc', 'user-memory');
      await ensureDir(userMemoryDir);
      logger.success('Created ~/.isdlc/user-memory/');

      // AC-004-02: Create project embeddings directory
      const embeddingsDir = path.join(projectRoot, 'docs', '.embeddings');
      await ensureDir(embeddingsDir);
      logger.success('Created docs/.embeddings/');

      // AC-004-03: Attempt model download (non-blocking on failure)
      try {
        const { downloadModel } = await import('./embedding/installer/model-downloader.js');
        const dlResult = await downloadModel(projectRoot);
        if (dlResult.ready) {
          logger.success('CodeBERT model ready');
        } else {
          logger.warning(`CodeBERT model not available: ${dlResult.reason || 'download skipped'}`);
          logger.info('Run `isdlc setup-knowledge` to set up embeddings later.');
        }
      } catch (dlErr) {
        logger.warning(`Model download skipped: ${dlErr.message}`);
      }
    } catch (embErr) {
      logger.warning(`Embedding infrastructure setup skipped: ${embErr.message}`);
    }
  } else {
    logger.info('[dry-run] Would create embedding infrastructure directories');
  }

  // Handle monorepo setup
  if (isMonorepo && projects.length > 0) {
    logger.newline();
    logger.step('Bonus', 'Setting up monorepo structure...');

    // Ask about docs location
    let docsLocation = 'root';
    if (!force) {
      docsLocation = await select('Where should project documentation live?', [
        { title: 'Root docs folder (docs/{project-id}/)', value: 'root', description: 'Shared-concern monorepos (FE/BE/shared)' },
        { title: 'Inside each project ({project}/docs/)', value: 'project', description: 'Multi-app monorepos' },
      ]);
    }

    // Generate monorepo config
    const monorepoConfig = generateMonorepoConfig(projects, { docsLocation });

    if (!dryRun) {
      await writeJson(path.join(isdlcTarget, 'monorepo.json'), monorepoConfig);
      await ensureDir(path.join(isdlcTarget, 'projects'));
      await ensureDir(path.join(docsTarget, 'isdlc', 'projects'));

      // Create per-project directories and state
      for (const proj of projects) {
        await ensureDir(path.join(isdlcTarget, 'projects', proj.name, 'skills', 'external'));
        await ensureDir(path.join(docsTarget, 'isdlc', 'projects', proj.name));

        // Create per-project state
        const projState = generateProjectState(proj.name, proj.path, timestamp);
        await writeJson(path.join(isdlcTarget, 'projects', proj.name, 'state.json'), projState);

        // Create external skills manifest
        const extManifest = {
          version: '1.0.0',
          project_id: proj.name,
          updated_at: timestamp,
          skills: {},
        };
        await writeJson(path.join(docsTarget, 'isdlc', 'projects', proj.name, 'external-skills-manifest.json'), extManifest);

        // Create project docs directories
        if (docsLocation === 'project') {
          await ensureDir(path.join(projectRoot, proj.path, 'docs', 'requirements'));
          await ensureDir(path.join(projectRoot, proj.path, 'docs', 'architecture'));
          await ensureDir(path.join(projectRoot, proj.path, 'docs', 'design'));
        } else {
          await ensureDir(path.join(docsTarget, proj.name, 'requirements'));
          await ensureDir(path.join(docsTarget, proj.name, 'architecture'));
          await ensureDir(path.join(docsTarget, proj.name, 'design'));
        }

        logger.success(`Created state for: ${proj.name}`);
      }
    }

    logger.success(`Monorepo setup complete (${projects.length} projects)`);
  }

  // Generate installation manifest
  if (!dryRun) {
    const manifest = {
      version: '1.0.0',
      created: timestamp,
      framework_version: '0.1.0-alpha',
      files: installedFiles,
    };
    await writeJson(path.join(isdlcTarget, 'installed-files.json'), manifest);
  }
  logger.success(`Created installation manifest (${installedFiles.length} files tracked)`);

  // Create CLAUDE.md if missing — seed from template
  // REQ-0032 FR-004: Interpolate issue tracker configuration into template
  const claudeMdPath = path.join(projectRoot, 'CLAUDE.md');
  if (!(await exists(claudeMdPath))) {
    if (!dryRun) {
      const templatePath = path.join(claudeTarget, 'CLAUDE.md.template');
      let content = '';
      if (await exists(templatePath)) {
        content = await readFile(templatePath, 'utf8');
      }
      // FR-004 AC-004-03: Interpolate issue tracker values into template
      content = content.replace('{{ISSUE_TRACKER}}', issueTrackerConfig.mode);
      content = content.replace('{{JIRA_PROJECT_KEY}}', issueTrackerConfig.jiraProjectKey || '');
      content = content.replace('{{GITHUB_REPO}}', issueTrackerConfig.githubRepo || '');
      await writeFile(claudeMdPath, content);
    }
    logger.warning('CLAUDE.md was missing - created from template in project root');
  } else {
    // FR-004 AC-004-04: Existing CLAUDE.md -- do not overwrite
    logger.info('CLAUDE.md already exists -- skipping (not overwritten)');
    if (issueTrackerConfig.mode !== 'manual') {
      logger.info('Add the Issue Tracker Configuration section to your CLAUDE.md manually:');
      logger.log(`  ## Issue Tracker Configuration`);
      logger.log(`  - **Tracker**: ${issueTrackerConfig.mode}`);
      logger.log(`  - **Jira Project Key**: ${issueTrackerConfig.jiraProjectKey || ''}`);
      logger.log(`  - **GitHub Repository**: ${issueTrackerConfig.githubRepo || ''}`);
    }
  }

  // Create ANTIGRAVITY.md if missing — seed from template (REQ-0032 Bridge)
  const antigravityMdPath = path.join(projectRoot, 'ANTIGRAVITY.md');
  if (!(await exists(antigravityMdPath))) {
    if (!dryRun) {
      const templatePath = path.join(antigravityTarget, 'ANTIGRAVITY.md.template');
      let content = '';
      if (await exists(templatePath)) {
        content = await readFile(templatePath, 'utf8');
      }
      // Interpolate issue tracker values just like CLAUDE.md
      content = content.replace('{{ISSUE_TRACKER}}', issueTrackerConfig.mode);
      content = content.replace('{{JIRA_PROJECT_KEY}}', issueTrackerConfig.jiraProjectKey || '');
      content = content.replace('{{GITHUB_REPO}}', issueTrackerConfig.githubRepo || '');
      await writeFile(antigravityMdPath, content);
    }
    logger.warning('ANTIGRAVITY.md was missing - created from template in project root');
  } else {
    logger.info('ANTIGRAVITY.md already exists -- skipping (not overwritten)');
  }

  // Create BACKLOG.md if missing -- scaffold with section headers (REQ-0014)
  const backlogPath = path.join(projectRoot, 'BACKLOG.md');
  if (!(await exists(backlogPath))) {
    if (!dryRun) {
      await writeFile(backlogPath, generateBacklogMd());
    }
    logger.success('Created BACKLOG.md');
  } else {
    logger.info('BACKLOG.md already exists -- skipping');
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
          logger.success(`Session cache built (${cacheResult.size} chars, ${cacheResult.sections.length} sections)`);
        }
      }
    } catch (cacheErr) {
      logger.warning(`Session cache rebuild skipped: ${cacheErr.message}`);
    }
  }

  // Done!
  logger.newline();
  logger.header('Installation Complete!');

  logger.section('Project Structure:');
  logger.log('  .claude/           - Agent definitions and skills');
  logger.log('  .isdlc/            - Project state and framework resources');
  logger.log('  docs/              - Documentation');
  logger.newline();

  logger.section('AI Assistant:');
  logger.log(`  Engine:   Claude Code${claudeCodeFound ? ` (${claudeCodeVersion})` : ''}`);
  logger.newline();

  // Optional tour
  if (!force && !dryRun) {
    await runTour();
  }

  if (providerMode === 'ollama') {
    logger.section('Provider Configured:');
    logger.log('  We created .isdlc/provider.env with:');
    logger.log('    ANTHROPIC_BASE_URL=http://localhost:11434');
    logger.log('    ANTHROPIC_AUTH_TOKEN=ollama');
    logger.log('    ANTHROPIC_API_KEY=""');
    logger.log('  To change these settings, edit .isdlc/provider.env');
    logger.newline();
  }

  logger.section('Next Steps:');
  let step = 1;
  if (!claudeCodeFound) {
    logger.log(`  ${step}. Install Claude Code: npm install -g @anthropic-ai/claude-code`);
    step++;
  }
  if (providerMode === 'ollama') {
    logger.log(`  ${step}. Install Ollama (if not already installed):`);
    logger.log('     https://ollama.com/download');
    step++;
    logger.log(`  ${step}. Pull a recommended model: ollama pull qwen3-coder`);
    step++;
    logger.log(`  ${step}. Start the Ollama server: ollama serve`);
    step++;
    logger.log(`  ${step}. Launch Claude Code with Ollama:`);
    logger.log('     source .isdlc/provider.env && claude');
    step++;
  } else {
    logger.log(`  ${step}. Run \`claude\` to launch Claude Code`);
    step++;
    logger.log(`  ${step}. Log in with your Anthropic account`);
    step++;
  }
  logger.log(`  ${step}. Run /discover to analyze your project and create a constitution`);
  step++;
  logger.log(`  ${step}. Set up project knowledge search: isdlc setup-knowledge`);
  logger.log('     (Indexes your codebase and documents for semantic search with embeddings)');
  step++;
  logger.log(`  ${step}. Run /isdlc feature to begin your workflow`);
  step++;
  logger.log(`  ${step}. Run /tour for the framework introduction`);
  logger.newline();

  if (projectInfo.isExisting) {
    logger.info('Note: Your existing project structure was not modified.');
  }

  if (dryRun) {
    logger.warning('(Dry run - no changes were made)');
  }
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
 * Tour content sections shared between light and full modes
 */
const tourSections = [
  {
    title: 'What is iSDLC?',
    content: [
      'iSDLC is a framework of 36 AI agents that guide development from',
      'requirements through deployment. Quality gates enforce completion',
      'between phases, and deterministic hooks enforce rules at runtime.',
    ],
  },
  {
    title: 'Core Commands',
    content: [
      '/discover                — Analyze your project or set up a new one',
      '/isdlc feature "desc"    — Develop a feature end-to-end',
      '/isdlc fix "desc"        — Fix a bug with TDD and tracing agents',
      '/isdlc test generate     — Create tests for existing code',
      '/isdlc upgrade "name"    — Upgrade a dependency or runtime',
      '/provider               — Configure LLM model routing',
    ],
  },
];

/**
 * Print a single tour section
 * @param {object} section - Tour section with title and content
 */
function printTourSection(section) {
  logger.newline();
  logger.log(`  ━━━ ${section.title} ━━━`);
  logger.newline();
  for (const line of section.content) {
    logger.log(`  ${line}`);
  }
  logger.newline();
}

/**
 * Run the optional post-install tour
 * @param {Function} selectFn - The select prompt function
 */
async function runTour() {
  const { confirm } = await import('./utils/prompts.js');
  const wantOverview = await confirm('Show a quick overview of the framework?', true);
  if (!wantOverview) {
    logger.info('Skipped. Run /tour in Claude Code for the interactive guide.');
    logger.newline();
    return;
  }
  logger.header('QUICK OVERVIEW');
  for (const section of tourSections) {
    printTourSection(section);
  }
  logger.info('For the full interactive guide, run /tour in Claude Code.');
  logger.newline();
}

/**
 * Generate the BACKLOG.md template content.
 * Follows the format convention documented in CLAUDE.md.template
 * (Backlog Management > BACKLOG.md Format Convention).
 *
 * REQ-0014: AC-02 (## Open), AC-03 (## Completed), AC-04 (preamble), AC-05 (ordering)
 *
 * @returns {string} BACKLOG.md content with preamble, ## Open, and ## Completed headers
 */
function generateBacklogMd() {
  return `# Project Backlog

> Backlog and completed items are tracked here.
> This file is NOT loaded into every conversation -- reference it explicitly when needed.

## Open

## Completed
`;
}

/**
 * Generate the docs/README.md content
 * @returns {string} README content
 */
function generateDocsReadme() {
  return `# Project Documentation

This folder contains all project documentation following the iSDLC framework.

## Structure

\`\`\`
docs/
├── isdlc/              # iSDLC-generated documents
│   ├── constitution.md # Project constitution
│   ├── tasks.md        # Task plan
│   └── checklists/     # Gate checklist responses
├── requirements/       # Requirements specifications and user stories
├── architecture/       # Architecture decisions and system design
├── design/            # Detailed design documents
└── README.md          # This file
\`\`\`

## Getting Started

1. Start with requirements in \`requirements/\`
2. Document architecture decisions in \`architecture/\`
3. Add detailed designs in \`design/\`

See \`.isdlc/state.json\` for current project phase and progress.
`;
}

/**
 * Generate starter constitution
 * @param {string} projectName - Project name
 * @returns {string} Constitution content
 */
function generateConstitution(projectName) {
  const date = new Date().toISOString().split('T')[0];

  return `# Project Constitution - ${projectName}

<!-- CONSTITUTION_STATUS: STARTER_TEMPLATE -->
<!-- This marker indicates this constitution needs customization -->
<!-- Run /discover to customize -->

**Created**: ${date}
**Status**: ⚠️ NEEDS CUSTOMIZATION

---

## ⚠️ CUSTOMIZATION REQUIRED

This is a **starter constitution** auto-generated during framework installation.
It contains generic articles that may not match your project's specific needs.

**To customize this constitution:**
Run \`/discover\` to analyze your project and generate tailored articles interactively.

**This constitution will be treated as a TEMPLATE until customized.**

---

## Preamble

This constitution establishes the fundamental principles governing all development activities within the **${projectName}** project. These articles guide all SDLC phases and all agent interactions.

All agents (01-13) and the SDLC Orchestrator (00) will read and enforce these principles throughout the project lifecycle.

---

## Articles (Generic - Customize for Your Project)

### Article I: Specification Primacy

**Principle**: Specifications are the source of truth. Code serves specifications.

**Requirements**:
1. Code MUST implement specifications exactly as defined
2. Any deviation from specifications MUST be documented and justified
3. Specifications MUST be updated before code changes

---

### Article II: Test-First Development

**Principle**: Tests MUST be written before implementation.

**Requirements**:
1. Test cases MUST be designed before implementation
2. Unit tests MUST be written before production code
3. Code without tests CANNOT pass quality gates

**Coverage Thresholds**:
- Unit test coverage: ≥80%
- Integration test coverage: ≥70%

---

### Article III: Security by Design

**Principle**: Security considerations MUST precede implementation decisions.

**Requirements**:
1. No secrets in code - use environment variables
2. All inputs validated, all outputs sanitized
3. Critical/High vulnerabilities MUST be resolved before deployment

---

### Article IV: Simplicity First

**Principle**: Implement the simplest solution that satisfies requirements.

**Requirements**:
1. Avoid over-engineering and premature optimization
2. YAGNI (You Aren't Gonna Need It) - no speculative features
3. Complexity MUST be justified by requirements

---

### Article V: Quality Gate Integrity

**Principle**: Quality gates cannot be skipped. Failures require remediation.

**Requirements**:
1. All quality gates MUST be validated before phase advancement
2. Gate failures MUST be remediated (cannot be waived)
3. Gate fails twice → Escalate to human

---

## Customization Notes

Review and modify these articles based on your project's specific needs:
- Add compliance requirements (HIPAA, GDPR, PCI-DSS)
- Add performance SLAs
- Add accessibility requirements
- Adjust coverage thresholds
- Add domain-specific constraints

---

**Constitution Version**: 1.0.0
**Framework Version**: 0.1.0-alpha
`;
}

/**
 * Generate project state.json
 * @param {string} projectName - Project name
 * @param {boolean} isExistingProject - Whether project has existing code
 * @param {string} timestamp - ISO timestamp
 * @returns {object} State object
 */
function generateState(projectName, isExistingProject, timestamp, providerMode) {
  return {
    framework_version: '0.1.0-alpha',
    project: {
      name: projectName,
      created: timestamp,
      description: '',
      is_new_project: !isExistingProject,
    },
    provider_selection: providerMode || 'claude-code',
    complexity_assessment: {
      level: null,
      track: 'auto',
      assessed_at: timestamp,
      assessed_by: 'manual',
      dimensions: {
        architectural: null,
        security: null,
        testing: null,
        deployment: null,
        team: null,
        timeline: null,
      },
    },
    workflow: {
      track: 'auto',
      track_name: 'Orchestrator-managed',
      phases_required: null,
      phases_optional: null,
      phases_skipped: null,
    },
    constitution: {
      enforced: true,
      path: 'docs/isdlc/constitution.md',
      validated_at: null,
    },
    autonomous_iteration: {
      enabled: true,
      max_iterations: 10,
      timeout_per_iteration_minutes: 5,
      circuit_breaker_threshold: 3,
    },
    skill_enforcement: {
      enabled: true,
      mode: 'observe',
      fail_behavior: 'allow',
      manifest_version: '2.0.0',
    },
    cloud_configuration: {
      provider: 'undecided',
      configured_at: null,
      credentials_validated: false,
      aws: null,
      gcp: null,
      azure: null,
      deployment: {
        staging_enabled: false,
        production_enabled: false,
        workflow_endpoint: '10-local-testing',
      },
    },
    iteration_enforcement: {
      enabled: true,
    },
    code_review: {
      enabled: false,
      team_size: 1,
    },
    skill_usage_log: [],
    active_workflow: null,
    workflow_history: [],
    counters: {
      next_req_id: 1,
      next_bug_id: 1,
    },
    current_phase: '01-requirements',
    phases: {
      '01-requirements': { status: 'pending', started: null, completed: null, gate_passed: null, artifacts: [] },
      '02-architecture': { status: 'pending', started: null, completed: null, gate_passed: null, artifacts: [] },
      '03-design': { status: 'pending', started: null, completed: null, gate_passed: null, artifacts: [] },
      '04-test-strategy': { status: 'pending', started: null, completed: null, gate_passed: null, artifacts: [] },
      '05-implementation': { status: 'pending', started: null, completed: null, gate_passed: null, artifacts: [], iteration_tracking: { current: 0, max: null, history: [], final_status: null } },
      '06-testing': { status: 'pending', started: null, completed: null, gate_passed: null, artifacts: [], iteration_tracking: { current: 0, max: null, history: [], final_status: null } },
      '07-code-review': { status: 'pending', started: null, completed: null, gate_passed: null, artifacts: [] },
      '08-validation': { status: 'pending', started: null, completed: null, gate_passed: null, artifacts: [] },
      '09-cicd': { status: 'pending', started: null, completed: null, gate_passed: null, artifacts: [] },
      '10-local-testing': { status: 'pending', started: null, completed: null, gate_passed: null, artifacts: [] },
      '11-test-deploy': { status: 'pending', started: null, completed: null, gate_passed: null, artifacts: [] },
      '12-production': { status: 'pending', started: null, completed: null, gate_passed: null, artifacts: [] },
      '13-operations': { status: 'pending', started: null, completed: null, gate_passed: null, artifacts: [] },
    },
    blockers: [],
    active_agent: null,
    history: [
      {
        timestamp,
        agent: 'npm-installer',
        action: 'Project initialized with iSDLC framework (npm)',
      },
    ],
  };
}

/**
 * Generate per-project state for monorepos
 * @param {string} projectName - Project name
 * @param {string} projectPath - Relative path
 * @param {string} timestamp - ISO timestamp
 * @returns {object} Project state object
 */
function generateProjectState(projectName, projectPath, timestamp) {
  return {
    framework_version: '0.1.0-alpha',
    project: {
      name: projectName,
      path: projectPath,
      created: timestamp,
      description: '',
      is_new_project: true,
    },
    constitution: {
      enforced: true,
      path: 'docs/isdlc/constitution.md',
      override_path: null,
      validated_at: null,
    },
    skill_enforcement: {
      enabled: true,
      mode: 'observe',
      fail_behavior: 'allow',
      manifest_version: '2.0.0',
    },
    cloud_configuration: {
      provider: 'undecided',
      configured_at: null,
      credentials_validated: false,
      deployment: {
        staging_enabled: false,
        production_enabled: false,
        workflow_endpoint: '10-local-testing',
      },
    },
    code_review: {
      enabled: false,
      team_size: 1,
    },
    skill_usage_log: [],
    active_workflow: null,
    workflow_history: [],
    counters: {
      next_req_id: 1,
      next_bug_id: 1,
    },
    current_phase: null,
    phases: {},
    blockers: [],
    active_agent: null,
    history: [
      {
        timestamp,
        agent: 'npm-installer',
        action: 'Project registered in monorepo',
      },
    ],
  };
}

export default { install };
