/**
 * iSDLC CLI Command Router
 *
 * Main entry point for all CLI commands.
 *
 * Commands:
 *   init [--monorepo]  Initialize framework in current project
 *   update             Update framework files in-place
 *   version            Show installed version
 *   doctor             Check installation health
 *   uninstall          Remove framework from project
 *   setup-knowledge    Set up semantic search embeddings
 *   help               Show help
 */

import path from 'path';
import { fileURLToPath } from 'url';
import logger from './utils/logger.js';
import { checkForUpdates, displayUpdateNotification, update } from './updater.js';
import { install } from './installer.js';
import { uninstall } from './uninstaller.js';
import { runDoctor } from './doctor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read version from package.json
async function getVersion() {
  const packagePath = path.resolve(__dirname, '..', 'package.json');
  const { readJson } = await import('./utils/fs-helpers.js');
  try {
    const pkg = await readJson(packagePath);
    return pkg.version;
  } catch {
    return 'unknown';
  }
}

/**
 * Display help information
 */
function showHelp() {
  logger.header('iSDLC Framework CLI');

  logger.log('Usage: isdlc <command> [options]');
  logger.log('       npx isdlc <command> [options]');
  logger.newline();

  logger.section('Commands:');
  logger.log('  init [--monorepo]  Initialize framework in current project');
  logger.log('  update             Update framework files in-place');
  logger.log('  search-setup       Detect and configure search tools');
  logger.log('  setup-knowledge    Set up semantic search embeddings');
  logger.log('  version            Show installed version');
  logger.log('  doctor             Check installation health');
  logger.log('  uninstall          Remove framework from project');
  logger.log('  memory compact     Compact roundtable memory (user and/or project)');
  logger.log('  help               Show this help message');
  logger.newline();

  logger.section('Options:');
  logger.log('  --monorepo              Force monorepo mode during init');
  logger.log('  --force                 Skip confirmation prompts');
  logger.log('  --dry-run               Show what would happen without making changes');
  logger.log('  --backup                Create backup before update/uninstall');
  logger.log('  --no-search-setup       Skip search tool detection during init/update');
  // logger.log('  --provider-mode <mode>  Set LLM provider mode (free, budget, quality, local, hybrid)');
  logger.newline();

  logger.section('Examples:');
  logger.log('  npx isdlc init                        # Initialize in current directory');
  logger.log('  npx isdlc init --monorepo              # Force monorepo mode');
  // logger.log('  npx isdlc init --provider-mode free    # Set provider mode during init');
  logger.log('  isdlc update --dry-run                 # Preview update');
  logger.log('  isdlc update --backup                  # Update with backup');
  logger.log('  isdlc doctor                           # Check installation');
  logger.log('  isdlc uninstall --dry-run              # Preview uninstall');
  logger.newline();

  logger.section('After Installation:');
  logger.log('  1. Start Claude Code: claude');
  logger.log('  2. Analyze project:   /discover');
  logger.log('  3. Begin development: /isdlc feature');
  logger.newline();
}

/**
 * Display version information
 */
async function showVersion() {
  const version = await getVersion();
  logger.log(`iSDLC Framework v${version}`);
}

/**
 * Run update command — performs in-place framework update
 * @param {object} options - CLI options (force, dryRun, backup)
 */
async function runUpdate(options) {
  await update(process.cwd(), options);
}

/**
 * Parse command line arguments
 * @param {string[]} args - Command line arguments
 * @returns {object} Parsed arguments
 */
function parseArgs(args) {
  const result = {
    command: null,
    subcommand: null,
    options: {
      monorepo: false,
      force: false,
      dryRun: false,
      backup: false,
      purgeAll: false,
      purgeDocs: false,
      providerMode: null,
      noSearchSetup: false,
      user: false,
      project: false,
    },
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const option = arg.slice(2);
      switch (option) {
        case 'monorepo':
          result.options.monorepo = true;
          break;
        case 'force':
          result.options.force = true;
          break;
        case 'dry-run':
          result.options.dryRun = true;
          break;
        case 'backup':
          result.options.backup = true;
          break;
        case 'purge-all':
          result.options.purgeAll = true;
          break;
        case 'purge-docs':
          result.options.purgeDocs = true;
          break;
        case 'no-search-setup':
          result.options.noSearchSetup = true;
          break;
        case 'user':
          result.options.user = true;
          break;
        case 'project':
          result.options.project = true;
          break;
        // NOTE: Provider mode disabled — framework is Claude Code-specific
        // case 'provider-mode':
        //   result.options.providerMode = args[++i] || null;
        //   break;
        case 'help':
        case 'h':
          result.command = 'help';
          break;
        case 'version':
        case 'v':
          result.command = 'version';
          break;
      }
    } else if (arg.startsWith('-')) {
      const option = arg.slice(1);
      if (option === 'h') result.command = 'help';
      if (option === 'v') result.command = 'version';
    } else if (!result.command) {
      result.command = arg;
    } else if (!result.subcommand) {
      result.subcommand = arg;
    }
  }

  return result;
}

/**
 * Main CLI entry point
 * @param {string[]} args - Command line arguments
 */
export async function run(args) {
  const { command, subcommand, options } = parseArgs(args);

  // Check for updates in background (non-blocking, for global installs)
  // Only show notification, don't block execution
  const updatePromise = checkForUpdates().catch(() => null);

  try {
    switch (command) {
      case 'init': {
        // NOTE: Provider mode validation disabled — framework is Claude Code-specific
        // const validModes = ['free', 'budget', 'quality', 'local', 'hybrid'];
        // if (options.providerMode && !validModes.includes(options.providerMode)) {
        //   throw new Error(
        //     `Invalid provider mode: "${options.providerMode}". Valid modes: ${validModes.join(', ')}`
        //   );
        // }
        await install(process.cwd(), options);
        break;
      }

      case 'update':
        await runUpdate(options);
        break;

      case 'version':
      case '-v':
      case '--version':
        await showVersion();
        break;

      case 'doctor':
        await runDoctor(process.cwd(), options);
        break;

      case 'uninstall':
        await uninstall(process.cwd(), options);
        break;

      case 'search-setup': {
        const { setupSearchCapabilities } = await import('./setup-search.js');
        await setupSearchCapabilities(process.cwd(), { force: options.force, dryRun: options.dryRun });
        break;
      }

      case 'setup-knowledge': {
        const { setupProjectKnowledge } = await import('./setup-project-knowledge.js');
        await setupProjectKnowledge(process.cwd(), { force: options.force, dryRun: options.dryRun });
        break;
      }

      case 'memory': {
        if (subcommand !== 'compact') {
          throw new Error(`Unknown memory subcommand: ${subcommand || '(none)'}. Usage: isdlc memory compact [--user] [--project]`);
        }
        const { compact } = await import('./memory.js');
        const compactUser = options.user || !options.project;
        const compactProject = options.project || !options.user;
        const result = await compact({ user: compactUser, project: compactProject, projectRoot: process.cwd() });
        if (result.user) {
          logger.log(`Compacting user memory...`);
          logger.log(`  Read ${result.user.sessionsRead} session records`);
          logger.log(`  Aggregated ${result.user.topicsAggregated} topics`);
          logger.log(`  Wrote ~/.isdlc/user-memory/profile.json`);
        }
        if (result.project) {
          logger.log(`Compacting project memory...`);
          logger.log(`  Read ${result.project.sessionsRead} session records`);
          logger.log(`  Aggregated ${result.project.topicsAggregated} topics`);
          logger.log(`  Wrote .isdlc/roundtable-memory.json`);
        }
        logger.log('Done.');
        break;
      }

      case 'help':
      case undefined:
      case null:
        showHelp();
        break;

      default:
        logger.error(`Unknown command: ${command}`);
        logger.newline();
        showHelp();
        process.exit(1);
    }

    // Show update notification if available (after command completes)
    const update = await updatePromise;
    if (update && command !== 'update' && command !== 'version') {
      displayUpdateNotification(update.current, update.latest);
    }
  } catch (err) {
    logger.error(err.message);
    if (process.env.DEBUG) {
      console.error(err);
    }
    process.exit(1);
  }
}

export { parseArgs };
export default { run, parseArgs };
