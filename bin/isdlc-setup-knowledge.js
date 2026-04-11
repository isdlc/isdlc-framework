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
import { existsSync, readFileSync } from 'node:fs';
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

// Run setup
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
  isdlc setup-knowledge                Run interactive setup
  isdlc setup-knowledge --add-source   Add additional content sources
  isdlc setup-knowledge --rebuild      Rebuild all embeddings from scratch
  isdlc setup-knowledge --status       Show current knowledge base status
  isdlc setup-knowledge --dry-run      Preview without making changes
  isdlc setup-knowledge --force        Auto-accept all defaults
  isdlc setup-knowledge --help         Show this help

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
