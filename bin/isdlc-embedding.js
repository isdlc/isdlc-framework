#!/usr/bin/env node

/**
 * iSDLC Embedding CLI
 *
 * CLI entry point for embedding generation operations.
 *
 * Usage:
 *   isdlc embedding generate [options]     Generate embeddings for current working copy
 *   isdlc embedding status                 Show embedding status
 *   isdlc embedding --help                 Show help
 *
 * REQ-0045 / FR-014
 * @module bin/isdlc-embedding
 */

import { resolve } from 'node:path';

const args = process.argv.slice(2);
const command = args[0];

if (!command || command === '--help' || command === '-h') {
  printHelp();
  process.exit(0);
}

if (command === 'generate') {
  await runGenerate(args.slice(1));
} else if (command === 'status') {
  await runStatus();
} else {
  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exit(1);
}

/**
 * Run embedding generation.
 * AC-014-01: Produces a valid .emb package from the current working copy
 * AC-014-03: Incremental mode re-embeds only changed files via VCS adapter
 */
async function runGenerate(genArgs) {
  const workingCopy = resolve(genArgs[0] || '.');

  console.log(`Generating embeddings for: ${workingCopy}`);

  try {
    // Import modules dynamically to fail gracefully if dependencies missing
    const { createAdapter } = await import('../lib/embedding/vcs/index.js');
    const { chunkFile, detectLanguage } = await import('../lib/embedding/chunker/index.js');
    const { embed } = await import('../lib/embedding/engine/index.js');

    // 1. Detect VCS and get file list
    const vcs = await createAdapter(workingCopy);
    console.log(`VCS detected: ${vcs.type}`);

    const files = await vcs.getFileList();
    console.log(`Found ${files.length} tracked files`);

    // 2. Filter to supported languages
    const supportedFiles = files.filter(f => detectLanguage(f) !== null);
    console.log(`${supportedFiles.length} files with supported languages`);

    // 3. Chunk each file
    let totalChunks = 0;
    const allChunks = [];

    for (const file of supportedFiles) {
      const lang = detectLanguage(file);
      try {
        const chunks = await chunkFile(resolve(workingCopy, file), lang);
        allChunks.push(...chunks);
        totalChunks += chunks.length;
      } catch (err) {
        console.warn(`Warning: Failed to chunk ${file}: ${err.message}`);
      }
    }

    console.log(`Generated ${totalChunks} chunks from ${supportedFiles.length} files`);

    // 4. Generate embeddings
    const texts = allChunks.map(c => c.content);
    const result = await embed(texts, { provider: 'codebert' }, {
      onProgress: (processed, total) => {
        process.stdout.write(`\rEmbedding: ${processed}/${total} chunks`);
      },
    });

    console.log(`\nGenerated ${result.vectors.length} embeddings (${result.dimensions}-dim, ${result.model})`);
    console.log('Embedding generation complete.');

    // Note: Package building (.emb creation) is Group 2+ scope (M5)
    console.log('Note: .emb package creation requires Group 2+ components (FAISS, SQLite).');

  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

/**
 * Show current embedding status.
 */
async function runStatus() {
  console.log('Embedding status: Not yet implemented (Group 2+ scope)');
}

function printHelp() {
  console.log(`
iSDLC Embedding CLI

Usage:
  isdlc embedding generate [path]    Generate embeddings for working copy
  isdlc embedding status             Show embedding status
  isdlc embedding --help             Show this help

Options:
  path    Working copy path (default: current directory)

Examples:
  isdlc embedding generate           Generate from current directory
  isdlc embedding generate ./mymod   Generate from specific module
`.trim());
}
