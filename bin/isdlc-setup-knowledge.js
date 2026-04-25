#!/usr/bin/env node

/**
 * iSDLC Project Knowledge Setup CLI
 *
 * Interactive setup for semantic search embeddings.
 * Installs vector store dependencies, scans codebase, generates embeddings,
 * and configures the harness.
 *
 * Usage:
 *   isdlc setup-knowledge                Run interactive setup
 *   isdlc setup-knowledge --add-source   Add additional content sources
 *   isdlc setup-knowledge --rebuild      Rebuild all embeddings
 *   isdlc setup-knowledge --status       Show current knowledge base status
 *   isdlc setup-knowledge --dry-run      Show what would happen
 *   isdlc setup-knowledge --force        Auto-accept defaults (non-interactive)
 *   isdlc setup-knowledge --help         Show help
 *
 * Cross-platform: macOS, Linux, Windows
 *
 * @module bin/isdlc-setup-knowledge
 */

import { resolve, join } from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';

const args = process.argv.slice(2);

// Parse flags
const flags = {
  help: args.includes('--help') || args.includes('-h'),
  dryRun: args.includes('--dry-run'),
  force: args.includes('--force') || args.includes('-f'),
  addSource: args.includes('--add-source'),
  rebuild: args.includes('--rebuild'),
  status: args.includes('--status'),
  remoteUrl: (() => { const idx = args.indexOf('--remote-url'); return idx >= 0 && args[idx + 1] ? args[idx + 1] : null; })(),
};

if (flags.help) {
  printHelp();
  process.exit(0);
}

if (flags.status) {
  await runStatus();
  process.exit(0);
}

// Resolve project root
const projectRoot = findProjectRoot(process.cwd());
if (!projectRoot) {
  console.error('Error: No iSDLC installation found. Run `isdlc init` first.');
  process.exit(1);
}

// REQ-GH-264 FR-001: Remote knowledge service setup
// When --remote-url is provided, configure the project to use a remote knowledge
// service instead of local embeddings. This skips local embedding model download
// and vector DB setup, and rewrites .mcp.json to point at the remote endpoint.
if (flags.remoteUrl) {
  try {
    const result = await setupRemoteKnowledgeService(projectRoot, flags.remoteUrl, {
      dryRun: flags.dryRun,
    });
    process.exit(result.success ? 0 : 1);
  } catch (err) {
    console.error(`Error setting up remote knowledge service: ${err.message}`);
    process.exit(1);
  }
}

// Run local setup
try {
  const { setupProjectKnowledge } = await import('../lib/setup-project-knowledge.js');

  const result = await setupProjectKnowledge(projectRoot, {
    force: flags.force,
    dryRun: flags.dryRun,
  });

  process.exit(result.success ? 0 : 1);
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}

/**
 * Set up remote knowledge service connection (REQ-GH-264 FR-001, FR-003).
 *
 * 1. Validates connectivity to the knowledge service (GET /api/system/health)
 * 2. Writes knowledge.url to .isdlc/config.json
 * 3. Rewrites .mcp.json to point isdlc-embedding at the remote URL
 * 4. Skips local embedding model download and vector DB setup
 *
 * @param {string} projectRoot - Absolute path to project root
 * @param {string} remoteUrl - Knowledge service URL (e.g., https://ks.example.com)
 * @param {object} [options] - Options
 * @param {boolean} [options.dryRun=false] - Preview without making changes
 * @returns {Promise<{ success: boolean, message?: string }>}
 */
async function setupRemoteKnowledgeService(projectRoot, remoteUrl, options = {}) {
  const { dryRun = false } = options;

  console.log('\niSDLC Remote Knowledge Service Setup\n');
  console.log(`  URL: ${remoteUrl}`);

  // AC-001-04: Validate connectivity
  console.log('  Validating connectivity...');
  try {
    const healthUrl = remoteUrl.replace(/\/+$/, '') + '/api/system/health';
    const raw = execSync(`curl -sf --max-time 5 "${healthUrl}"`, {
      encoding: 'utf8', timeout: 6000, stdio: ['pipe', 'pipe', 'pipe']
    });
    const health = JSON.parse(raw);
    console.log(`  Status: ${health.status || 'ok'}`);
  } catch (err) {
    console.error(`  Failed to connect to ${remoteUrl}/api/system/health`);
    console.error('  Please verify the URL and ensure the knowledge service is running.');
    return { success: false, message: 'connectivity check failed' };
  }

  if (dryRun) {
    console.log('\n  [dry-run] Would write knowledge.url to .isdlc/config.json');
    console.log('  [dry-run] Would update .mcp.json to point at remote endpoint');
    console.log('  [dry-run] Would skip local embedding setup');
    return { success: true, message: 'dry run complete' };
  }

  // AC-001-01: Write knowledge.url to .isdlc/config.json
  const configPath = join(projectRoot, '.isdlc', 'config.json');
  let config = {};
  if (existsSync(configPath)) {
    try {
      config = JSON.parse(readFileSync(configPath, 'utf8'));
    } catch {
      console.warn('  Warning: existing config.json has invalid JSON, overwriting');
    }
  } else {
    mkdirSync(join(projectRoot, '.isdlc'), { recursive: true });
  }

  if (!config.knowledge) config.knowledge = {};
  config.knowledge.url = remoteUrl;
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
  console.log('  Updated .isdlc/config.json with knowledge.url');

  // AC-001-01: Update .mcp.json to point isdlc-embedding at remote
  const mcpPath = join(projectRoot, '.mcp.json');
  let mcpConfig = { mcpServers: {} };
  if (existsSync(mcpPath)) {
    try {
      mcpConfig = JSON.parse(readFileSync(mcpPath, 'utf8'));
    } catch {
      console.warn('  Warning: existing .mcp.json has invalid JSON, overwriting');
    }
  }

  mcpConfig.mcpServers['isdlc-embedding'] = {
    command: 'npx',
    args: ['-y', 'mcp-remote', remoteUrl.replace(/\/+$/, '') + '/sse'],
  };
  writeFileSync(mcpPath, JSON.stringify(mcpConfig, null, 2) + '\n', 'utf8');
  console.log('  Updated .mcp.json to route isdlc-embedding to remote service');

  // AC-001-02: Skip local embedding setup
  console.log('  Skipping local embedding model download and vector DB setup');

  console.log('\n  Remote knowledge service configured successfully.\n');
  return { success: true, message: 'remote knowledge service configured' };
}

/**
 * Show current knowledge base status.
 */
async function runStatus() {
  const root = findProjectRoot(process.cwd());
  if (!root) {
    console.error('No iSDLC installation found.');
    process.exit(1);
  }

  const manifestPath = join(root, '.isdlc', 'knowledge-manifest.json');
  const configPath = join(root, '.isdlc', 'search-config.json');

  console.log('\niSDLC Project Knowledge Status\n');

  // Check knowledge manifest
  if (existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      console.log(`  Vector store:     ${manifest.vectorStore}`);
      console.log(`  Created:          ${manifest.created}`);
      console.log(`  Packages:         ${manifest.packages.length}`);
      for (const pkg of manifest.packages) {
        const exists = existsSync(pkg.path);
        console.log(`    ${exists ? '✓' : '✗'} ${pkg.relativePath || pkg.path}`);
      }
    } catch {
      console.log('  Knowledge manifest: corrupt or unreadable');
    }
  } else {
    console.log('  Knowledge base: not configured');
    console.log('  Run `isdlc setup-knowledge` to get started');
  }

  // Check search config
  if (existsSync(configPath)) {
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      const hasSemantic = (config.activeBackends || []).includes('semantic-search');
      console.log(`\n  Semantic search:  ${hasSemantic ? 'enabled' : 'disabled'}`);
      console.log(`  Active backends:  ${(config.activeBackends || []).join(', ')}`);
    } catch {
      console.log('\n  Search config: corrupt or unreadable');
    }
  }

  // Check dependencies
  console.log('\n  Dependencies:');
  const deps = [
    'faiss-node', 'better-sqlite3', 'tree-sitter', 'onnxruntime-node',
    'tree-sitter-javascript', 'tree-sitter-typescript',
    'tree-sitter-python', 'tree-sitter-java',
  ];

  for (const dep of deps) {
    const installed = isInstalled(dep);
    console.log(`    ${installed ? '✓' : '✗'} ${dep}`);
  }

  console.log('');
}

/**
 * Check if a package is installed.
 */
function isInstalled(pkg) {
  try {
    execSync(`node -e "require('${pkg}')"`, { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Find the project root containing .isdlc/
 */
function findProjectRoot(startDir) {
  let dir = resolve(startDir);
  while (dir !== resolve(dir, '..')) {
    if (existsSync(join(dir, '.isdlc')) || existsSync(join(dir, '.isdlc', 'state.json'))) {
      return dir;
    }
    dir = resolve(dir, '..');
  }
  return null;
}

function printHelp() {
  console.log(`
iSDLC Project Knowledge Setup

Configure semantic search embeddings for your project. This sets up
a vector store, scans your codebase, generates embeddings, and
configures the harness to use them for AI-assisted development.

Usage:
  isdlc setup-knowledge                   Run interactive setup (local)
  isdlc setup-knowledge --remote-url URL  Connect to remote knowledge service
  isdlc setup-knowledge --add-source      Add additional content sources
  isdlc setup-knowledge --rebuild         Rebuild all embeddings from scratch
  isdlc setup-knowledge --status          Show current knowledge base status
  isdlc setup-knowledge --dry-run         Preview without making changes
  isdlc setup-knowledge --force           Auto-accept all defaults
  isdlc setup-knowledge --help            Show this help

Vector Stores:
  FAISS       Fast approximate nearest neighbor search (recommended for large codebases)
              Requires: faiss-node (native bindings, auto-installed)

  SQLite FTS5 Lightweight full-text search
              Requires: better-sqlite3 (native bindings, auto-installed)

What gets indexed:
  • Source code files (.js, .ts, .py, .java, .go, .rs, etc.)
  • Documents (.md, .txt, .html, .rst, .adoc)
  • External codebases and document folders (optional)

Examples:
  isdlc setup-knowledge                    Interactive setup
  isdlc setup-knowledge --force            Non-interactive with defaults (FAISS)
  isdlc setup-knowledge --status           Check what's configured
  isdlc setup-knowledge --dry-run          See what would happen
`.trim());
}
