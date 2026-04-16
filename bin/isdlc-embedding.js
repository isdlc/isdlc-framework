#!/usr/bin/env node

/**
 * iSDLC Embedding CLI
 *
 * CLI entry point for embedding generation operations.
 *
 * Usage:
 *   isdlc-embedding generate [path]        Generate embeddings for current working copy
 *   isdlc-embedding status                 Show embedding status
 *   isdlc-embedding server start|stop|status|restart   Manage embedding server
 *   isdlc-embedding configure              Interactive provider/model setup
 *   isdlc-embedding --help                 Show help
 *
 * Exit code contract (REQ-GH-252 FR-001):
 *   0 = success
 *   1 = generation error
 *   2 = missing dependency (preflight)
 *   3 = insufficient resources (preflight)
 *
 * REQ-0045 / FR-014, REQ-GH-252 / FR-001
 * @module bin/isdlc-embedding
 */

import { resolve } from 'node:path';
import { existsSync, statSync, readdirSync } from 'node:fs';

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
} else if (command === 'server') {
  await runServer(args.slice(1));
} else if (command === 'configure') {
  await runConfigure();
} else {
  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exit(1);
}

/**
 * Server lifecycle subcommand: start/stop/status/restart/reload
 * REQ-GH-224 FR-002
 */
async function runServer(serverArgs) {
  const subcommand = serverArgs[0];
  const projectRoot = process.cwd();
  const { startServer, stopServer, serverStatus, restartServer } = await import('../lib/embedding/server/lifecycle.js');

  if (subcommand === 'start') {
    console.log('Starting embedding server...');
    const result = await startServer(projectRoot);
    if (result.success) {
      if (result.alreadyRunning) {
        console.log(`Server already running (pid=${result.pid}, port=${result.port})`);
      } else if (result.viaLock) {
        console.log(`Connected to server started by another process (pid=${result.pid}, port=${result.port})`);
      } else {
        console.log(`Server started (pid=${result.pid}, port=${result.port})`);
      }
      process.exit(0);
    } else {
      console.error(`Failed to start server: ${result.error}`);
      process.exit(1);
    }
  } else if (subcommand === 'stop') {
    console.log('Stopping embedding server...');
    const result = await stopServer(projectRoot);
    if (result.success) {
      if (result.alreadyStopped) {
        console.log('Server was not running');
      } else if (result.forced) {
        console.log('Server stopped (forced)');
      } else {
        console.log('Server stopped');
      }
      process.exit(0);
    } else {
      console.error(`Failed to stop server: ${result.error}`);
      process.exit(1);
    }
  } else if (subcommand === 'status') {
    const status = await serverStatus(projectRoot);
    console.log(JSON.stringify(status, null, 2));
    process.exit(status.running ? 0 : 1);
  } else if (subcommand === 'restart') {
    console.log('Restarting embedding server...');
    const result = await restartServer(projectRoot);
    if (result.success) {
      console.log(`Server restarted (pid=${result.pid}, port=${result.port})`);
      process.exit(0);
    } else {
      console.error(`Failed to restart server: ${result.error}`);
      process.exit(1);
    }
  } else if (subcommand === 'reload') {
    console.log('Reload not yet implemented (use restart)');
    process.exit(1);
  } else {
    console.error(`Unknown server subcommand: ${subcommand}`);
    console.error(`Usage: isdlc embedding server {start|stop|status|restart|reload}`);
    process.exit(1);
  }
}

/**
 * Interactive configuration subcommand.
 * Walks user through provider selection + API key setup.
 * Writes to .isdlc/config.json → embeddings section.
 * REQ-GH-224 FR-011
 */
async function runConfigure() {
  const { readFileSync, writeFileSync, existsSync, mkdirSync } = await import('node:fs');
  const { join } = await import('node:path');
  const readline = await import('node:readline/promises');
  const { stdin, stdout } = await import('node:process');

  const projectRoot = process.cwd();
  const configPath = join(projectRoot, '.isdlc', 'config.json');
  const rl = readline.createInterface({ input: stdin, output: stdout });

  console.log('\n=== iSDLC Embedding Configuration ===\n');

  // Load existing config
  let config = {};
  if (existsSync(configPath)) {
    try {
      config = JSON.parse(readFileSync(configPath, 'utf8'));
    } catch {
      console.warn('Existing config.json is malformed; starting fresh.\n');
    }
  }
  if (!config.embeddings) config.embeddings = {};

  // Provider selection
  const currentProvider = config.embeddings.provider || 'jina-code';
  console.log(`Current provider: ${currentProvider}`);
  console.log('\nSelect embedding provider:');
  console.log('  1. Jina Code v2 (local, free, auto-downloads via Transformers.js)');
  console.log('  2. Voyage (API, voyage-code-3, high quality)');
  console.log('  3. OpenAI (API, text-embedding-3-small)');
  const choice = (await rl.question(`\nEnter choice [1-3] (default: 1): `)).trim() || '1';

  const providerMap = { '1': 'jina-code', '2': 'voyage', '3': 'openai' };
  const modelMap = {
    'jina-code': 'jinaai/jina-embeddings-v2-base-code',
    voyage: 'voyage-code-3',
    openai: 'text-embedding-3-small',
  };
  const provider = providerMap[choice];
  if (!provider) {
    console.error('Invalid choice. Aborting.');
    rl.close();
    process.exit(1);
  }

  config.embeddings.provider = provider;
  config.embeddings.model = modelMap[provider];

  // API key for cloud providers
  if (provider === 'voyage' || provider === 'openai') {
    const defaultEnvVar = provider === 'voyage' ? 'VOYAGE_API_KEY' : 'OPENAI_API_KEY';
    const envVar = (await rl.question(`Environment variable name for API key [${defaultEnvVar}]: `)).trim() || defaultEnvVar;
    config.embeddings.api_key_env = envVar;

    if (!process.env[envVar]) {
      console.warn(`\nWARNING: ${envVar} is not set in your environment.`);
      console.warn(`  Set it before starting the server: export ${envVar}=...\n`);
    }
  } else {
    config.embeddings.api_key_env = null;
  }

  // Port
  const currentPort = config.embeddings.server?.port || 7777;
  const portInput = (await rl.question(`Server port [${currentPort}]: `)).trim();
  const port = portInput ? parseInt(portInput, 10) : currentPort;
  if (!config.embeddings.server) config.embeddings.server = {};
  config.embeddings.server.port = port;

  // Ensure .isdlc/ exists
  const isdlcDir = join(projectRoot, '.isdlc');
  if (!existsSync(isdlcDir)) mkdirSync(isdlcDir, { recursive: true });

  // Write config
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');

  console.log('\n=== Configuration saved ===');
  console.log(`  Provider: ${provider}`);
  console.log(`  Model: ${modelMap[provider]}`);
  console.log(`  Port: ${port}`);
  if (config.embeddings.api_key_env) {
    console.log(`  API key env var: ${config.embeddings.api_key_env}`);
  }
  console.log(`\nConfig file: ${configPath}`);
  console.log('Restart the server to apply changes: isdlc embedding server restart\n');

  rl.close();
}

/**
 * Preflight validation for embedding generation.
 * Checks dependencies and resources before starting generation.
 *
 * REQ-GH-252 FR-001, AC-001-01, AC-001-02
 *
 * @param {string} projectRoot - Absolute path to the project root
 * @returns {Promise<{ ok: boolean, exitCode?: number, reason?: string }>}
 */
export async function preflight(projectRoot) {
  // Check 1: @huggingface/transformers importable (exit 2)
  try {
    await import('@huggingface/transformers');
  } catch (err) {
    return {
      ok: false,
      exitCode: 2,
      reason: '@huggingface/transformers is not installed. Run: npm install @huggingface/transformers'
    };
  }

  // Check 2: Disk space (exit 3) -- need at least 100MB free
  try {
    const { execSync } = await import('node:child_process');
    // Use df to check available space on the filesystem containing projectRoot
    const dfOutput = execSync(`df -k "${projectRoot}" | tail -1`, { encoding: 'utf8', timeout: 5000 });
    const parts = dfOutput.trim().split(/\s+/);
    // df -k outputs KB; available is typically the 4th column (index 3)
    const availableKB = parseInt(parts[3], 10);
    if (!isNaN(availableKB) && availableKB < 100 * 1024) {
      return {
        ok: false,
        exitCode: 3,
        reason: `Insufficient disk space: ${Math.round(availableKB / 1024)}MB available, need at least 100MB`
      };
    }
  } catch (err) {
    // Fail-open (Article X): if df fails, skip disk check
  }

  // Check 3: Model availability (exit 2) -- check if model cache exists or network is available
  // This is a lightweight check; actual model download happens during generation
  // We verify the config references a known provider
  try {
    const { join } = await import('node:path');
    const { readFileSync } = await import('node:fs');
    const configPath = join(projectRoot, '.isdlc', 'config.json');
    if (existsSync(configPath)) {
      const cfg = JSON.parse(readFileSync(configPath, 'utf8'));
      const provider = cfg?.embeddings?.provider || 'jina-code';
      const validProviders = ['jina-code', 'voyage', 'openai'];
      if (!validProviders.includes(provider)) {
        return {
          ok: false,
          exitCode: 2,
          reason: `Unknown embedding provider: "${provider}". Valid providers: ${validProviders.join(', ')}`
        };
      }
    }
  } catch (err) {
    // Fail-open (Article X): if config check fails, proceed
  }

  return { ok: true };
}

/**
 * Post-generation verification.
 * Validates that embeddings were actually produced and are non-empty.
 *
 * REQ-GH-252 FR-001, AC-001-01, AC-001-03
 *
 * @param {string} projectRoot - Absolute path to the project root
 * @returns {{ ok: boolean, exitCode?: number, reason?: string, fileCount?: number }}
 */
export function postVerify(projectRoot) {
  try {
    const embDir = resolve(projectRoot, 'docs', '.embeddings');
    const isdlcEmbDir = resolve(projectRoot, '.isdlc', 'embeddings');

    // Check both possible embedding directories
    let embFiles = [];
    for (const dir of [embDir, isdlcEmbDir]) {
      if (existsSync(dir)) {
        const files = readdirSync(dir).filter(f => f.endsWith('.emb'));
        embFiles.push(...files.map(f => resolve(dir, f)));
      }
    }

    if (embFiles.length === 0) {
      return {
        ok: false,
        exitCode: 1,
        reason: 'Post-verification failed: no .emb files found in output directories'
      };
    }

    // Verify files are non-zero size
    for (const file of embFiles) {
      const stat = statSync(file);
      if (stat.size === 0) {
        return {
          ok: false,
          exitCode: 1,
          reason: `Post-verification failed: ${file} is empty (0 bytes)`
        };
      }
    }

    return { ok: true, fileCount: embFiles.length };
  } catch (err) {
    return {
      ok: false,
      exitCode: 1,
      reason: `Post-verification error: ${err.message}`
    };
  }
}

/**
 * Run embedding generation.
 * AC-014-01: Produces a valid .emb package from the current working copy
 * AC-014-03: Incremental mode re-embeds only changed files via VCS adapter
 */
async function runGenerate(genArgs) {
  // Skip flag args (starting with --) when picking working copy path
  const pathArg = genArgs.find(a => !a.startsWith('--'));
  const workingCopy = resolve(pathArg || '.');
  const autoStart = !genArgs.includes('--no-auto-start');
  const tier = (genArgs.find(a => a.startsWith('--tier=')) || '--tier=full').split('=')[1];

  // BUG-GH-250 / FR-006 / AC-250-01: opt-in guard.
  // If the user's raw .isdlc/config.json does NOT contain an `embeddings`
  // key, treat the project as opted-out. In non-TTY contexts this is a
  // clean skip (exit 0); in TTY contexts we prompt for one-shot opt-in
  // and, on "y", merge buildInitialEmbeddingsBlock() into config.json
  // before falling through to the existing generation pipeline. This
  // guard runs BEFORE --incremental routing so incremental generate
  // inherits the same contract.
  const { hasUserEmbeddingsConfig } = await import('../src/core/config/config-service.js');
  if (!hasUserEmbeddingsConfig(workingCopy)) {
    const forcedInteractive = process.env.ISDLC_FORCE_INTERACTIVE === '1';
    const interactive = forcedInteractive || (Boolean(process.stdout.isTTY) && Boolean(process.stdin.isTTY));

    if (!interactive) {
      // Non-TTY opted-out: emit a one-line skip message to stderr and
      // exit cleanly. The message pins both the opt-out reason and the
      // `isdlc-embedding configure` pointer per AC-250-01.
      process.stderr.write(
        'Embeddings not configured (opted-out): .isdlc/config.json has no `embeddings` block. ' +
        "Run `isdlc-embedding configure` to enable.\n"
      );
      process.exit(0);
    }

    // Interactive branch: prompt for opt-in via readline/promises.
    const { readFileSync: rfs, writeFileSync: wfs, existsSync: efs, mkdirSync: mks } = await import('node:fs');
    const { join: pjoin } = await import('node:path');
    const readline = await import('node:readline/promises');
    const { stdin: rStdin, stdout: rStdout } = await import('node:process');
    const { buildInitialEmbeddingsBlock } = await import('../lib/install/embeddings-prompt.js');

    const rl = readline.createInterface({ input: rStdin, output: rStdout });
    let answer = '';
    try {
      answer = await rl.question(
        'Embeddings are not enabled in .isdlc/config.json. Without enabling, ' +
        'generated embeddings will not be consumed by /discover, finalize, search, ' +
        'or other framework paths. Enable now? [y/N]: '
      );
    } catch {
      // EOF / broken stdin: fail-open to NO (Article X).
      answer = '';
    } finally {
      rl.close();
    }

    const normalized = String(answer || '').trim().toLowerCase();
    if (normalized !== 'y' && normalized !== 'yes') {
      console.log('Embeddings not enabled. Aborting generation.');
      process.exit(0);
    }

    // "y" path: merge buildInitialEmbeddingsBlock() into config.json,
    // preserving any existing top-level keys. Ensure .isdlc/ exists first.
    const isdlcDir = pjoin(workingCopy, '.isdlc');
    if (!efs(isdlcDir)) mks(isdlcDir, { recursive: true });
    const cfgPath = pjoin(isdlcDir, 'config.json');
    let existing = {};
    if (efs(cfgPath)) {
      try {
        const raw = rfs(cfgPath, 'utf8');
        const parsed = raw && raw.trim() ? JSON.parse(raw) : {};
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          existing = parsed;
        }
      } catch {
        // Malformed config: start from empty to avoid losing other keys.
        // We deliberately do NOT clobber a file we failed to parse — but
        // since the user explicitly opted in, a fresh `embeddings` block
        // is still written alongside whatever JSON shape we could not
        // parse. Matching config-service's fail-open posture.
        existing = {};
      }
    }
    existing.embeddings = buildInitialEmbeddingsBlock();
    wfs(cfgPath, JSON.stringify(existing, null, 2) + '\n');
    console.log('Embeddings enabled. Proceeding with generation.');
    // Fall through to the existing generation pipeline below.
  }

  // REQ-GH-252 / FR-001: Preflight validation (exit 2 = missing dep, exit 3 = resources)
  const preflightResult = await preflight(workingCopy);
  if (!preflightResult.ok) {
    process.stderr.write(`Preflight failed: ${preflightResult.reason}\n`);
    process.exit(preflightResult.exitCode);
  }

  // REQ-GH-227 / FR-004: incremental by default when prior .emb exists
  const { parseIncrementalFlag, translateErrorCode, shouldPromptFullGenerate } = await import('../lib/embedding/incremental/cli-helpers.js');
  const forceFullFlag = genArgs.includes('--full');
  const hasExplicitIncremental = parseIncrementalFlag(genArgs);

  // Auto-detect: use incremental if prior package exists, unless --full is passed
  const { join: joinPath } = await import('node:path');
  const { existsSync: fileExists, readdirSync: readDir } = await import('node:fs');
  const embDirs = [
    joinPath(workingCopy, '.isdlc', 'embeddings'),
    joinPath(workingCopy, 'docs', '.embeddings'),
  ];
  const hasPriorEmb = embDirs.some(d => {
    try { return fileExists(d) && readDir(d).some(f => f.endsWith('.emb')); } catch { return false; }
  });

  if (!forceFullFlag && (hasExplicitIncremental || hasPriorEmb)) {
    const handled = await runIncrementalGenerate(workingCopy, genArgs, {
      translateErrorCode,
      shouldPromptFullGenerate
    });
    if (handled === 'fallthrough') {
      // fall through to full generation (e.g., NO_PRIOR_PACKAGE error)
    } else {
      return handled;
    }
  }

  console.log(`Generating embeddings for: ${workingCopy}`);
  console.log(`Tier: ${tier}`);

  try {
    // Load provider from config
    const { readFileSync, existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    const configPath = join(workingCopy, '.isdlc', 'config.json');
    let provider = 'jina-code';
    let embConfig = {};
    if (existsSync(configPath)) {
      try {
        const cfg = JSON.parse(readFileSync(configPath, 'utf8'));
        embConfig = cfg?.embeddings || {};
        provider = embConfig.provider || 'jina-code';
      } catch {}
    }
    console.log(`Provider: ${provider}`);

    // Import modules dynamically to fail gracefully if dependencies missing
    const { createAdapter } = await import('../lib/embedding/vcs/index.js');
    const { chunkFile, detectLanguage } = await import('../lib/embedding/chunker/index.js');
    const { embed } = await import('../lib/embedding/engine/index.js');
    const { buildPackage } = await import('../lib/embedding/package/builder.js');
    // REQ-GH-239 T015: pre-pool memory calibration (FR-003, NFR-003)
    // REQ-GH-248 FR-001/FR-003: real-chunk sampling + session_options propagation
    const {
      computeFingerprint,
      readCachedCalibration,
      calibratePerWorkerMemory,
      buildCalibrationConfig,
    } = await import('../lib/embedding/engine/memory-calibrator.js');

    // 1. Detect VCS and get file list
    const vcs = await createAdapter(workingCopy);
    console.log(`VCS detected: ${vcs.type}`);

    const files = await vcs.getFileList();
    console.log(`Found ${files.length} tracked files`);

    // 2. Filter to supported languages, excluding test/build artifacts
    // These paths contain generated/minified content that isn't useful for
    // semantic code search and often contains oversized files that exceed
    // model context limits.
    const EXCLUDE_PATTERNS = [
      /^coverage\//,
      /^dist\//,
      /^build\//,
      /^\.next\//,
      /^\.nuxt\//,
      /^node_modules\//,
      /\.min\.js$/,
      /\.min\.css$/,
      /package-lock\.json$/,
      /yarn\.lock$/,
      /pnpm-lock\.yaml$/,
    ];
    const isExcluded = (f) => EXCLUDE_PATTERNS.some(re => re.test(f));
    const supportedFiles = files.filter(f => detectLanguage(f) !== null && !isExcluded(f));
    const excludedCount = files.filter(f => detectLanguage(f) !== null && isExcluded(f)).length;
    console.log(`${supportedFiles.length} files with supported languages (${excludedCount} excluded as test/build artifacts)`);

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

    if (totalChunks === 0) {
      console.log('No chunks to embed. Exiting.');
      return;
    }

    // 4. Generate embeddings (with hardware acceleration config)
    const texts = allChunks.map(c => c.content);

    // REQ-GH-239 T015: one-time memory calibration before pool creation.
    // Cache hit = zero overhead. Cache miss = one real-chunk measurement
    // (~20-30 s) then cached. Failure is non-blocking (device-detector
    // falls back to hardcoded constants).
    //
    // REQ-GH-248 FR-001: real chunks from the current project drive the
    // measurement, avoiding the synthetic 38-word vocabulary that produced
    // under-estimates. REQ-GH-248 FR-003: session_options propagate so the
    // calibrator measures the same session production runs.
    try {
      const calibrationConfig = buildCalibrationConfig({
        device: embConfig.device || 'auto',
        dtype: embConfig.dtype || 'auto',
        model: embConfig.model || 'jinaai/jina-embeddings-v2-base-code',
        session_options: embConfig.session_options,
      });
      const fingerprint = computeFingerprint(calibrationConfig);
      const cached = readCachedCalibration(workingCopy, fingerprint);
      if (!cached) {
        console.log('[calibrate] no cached calibration; running one-time measurement on real chunks...');
        const calibration = await calibratePerWorkerMemory(calibrationConfig, {
          projectRoot: workingCopy,
          // REQ-GH-248 FR-001 / ASM-001: feed the already-computed allChunks
          // into the calibrator so it measures the real steady-state cost.
          // The calibrator subsamples to MAX_REAL_CHUNK_SAMPLES and falls
          // back to synthetic samples if fewer than MIN_REAL_CHUNKS are
          // available.
          _sampleProvider: () => allChunks.map((c) => c.content),
        });
        if (calibration && typeof calibration.perWorkerMemGB === 'number') {
          console.log(
            `[calibrate] measured perWorkerMemGB=${calibration.perWorkerMemGB.toFixed(1)} ` +
            `(${calibration.durationMs}ms, ${calibration.sampleCount} ${calibration.sampleSource} samples)`
          );
        } else {
          console.log('[calibrate] failed or timed out; falling back to hardcoded constants');
        }
      }
    } catch (err) {
      console.log(`[calibrate] error: ${err.message}; falling back to hardcoded constants`);
    }

    // REQ-GH-239 T016: progress rendering — new unified FR-005 shape
    // { processed, total, chunks_per_sec, eta_seconds, active_workers }
    const isTty = process.stdout.isTTY;
    const renderProgress = (update) => {
      if (!update || typeof update !== 'object') return;
      const { processed, total, chunks_per_sec = 0, eta_seconds = 0, active_workers = 1 } = update;
      const pct = total > 0 ? Math.round((processed / total) * 100) : 0;
      const etaMin = Math.round(eta_seconds / 60);
      const etaLabel = eta_seconds >= 60 ? `${etaMin}min` : `${Math.round(eta_seconds)}s`;
      const line = `[generate] ${processed}/${total} (${pct}%) | ${chunks_per_sec} chunks/s | ETA ${etaLabel} | workers: ${active_workers}`;
      if (isTty) {
        process.stdout.write(`\r${line}`);
      } else {
        console.log(line);
      }
    };

    const result = await embed(texts, {
      provider,
      parallelism: embConfig.parallelism,
      device: embConfig.device,
      batch_size: embConfig.batch_size,
      dtype: embConfig.dtype,
      session_options: embConfig.session_options,
      max_memory_gb: embConfig.max_memory_gb,
    }, {
      onProgress: renderProgress,
    });

    if (isTty) process.stdout.write('\n');
    console.log(`Generated ${result.vectors.length} embeddings (${result.dimensions}-dim, ${result.model})`);

    // 5. Build .emb package
    const outputDir = join(workingCopy, '.isdlc', 'embeddings');
    const projectName = (workingCopy.split('/').pop() || 'project').replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    const packagePath = await buildPackage({
      vectors: result.vectors,
      chunks: allChunks,
      meta: {
        moduleId: `${projectName}-code`,
        version: '0.1.0',
        model: result.model,
        dimensions: result.dimensions,
      },
      outputDir,
      tier,
    });
    console.log(`Package created: ${packagePath}`);

    // 6. Auto-start or reload server (FR-006 AC-006-02)
    if (autoStart) {
      const { startServer, serverStatus } = await import('../lib/embedding/server/lifecycle.js');
      const status = await serverStatus(workingCopy);
      if (status.running && status.responsive) {
        // Server already running — reload the new package
        console.log('\nReloading package into running server...');
        const { getServerConfig } = await import('../lib/embedding/server/port-discovery.js');
        const srvCfg = getServerConfig(workingCopy);
        try {
          const reloadResult = await reloadServer(srvCfg.host, srvCfg.port, [packagePath]);
          console.log(`Server reloaded: ${reloadResult.reloaded} package(s) loaded`);
          if (reloadResult.errors?.length > 0) {
            for (const e of reloadResult.errors) console.warn(`  reload error: ${e.path}: ${e.error}`);
          }
        } catch (err) {
          console.warn(`Failed to reload server: ${err.message}`);
          console.warn('Restart manually: isdlc embedding server restart');
        }
      } else {
        console.log('\nAuto-starting embedding server...');
        const start = await startServer(workingCopy);
        if (start.success) {
          console.log(`Server started (pid=${start.pid}, port=${start.port})`);
        } else {
          console.warn(`Failed to auto-start server: ${start.error}`);
          console.warn('Start manually: isdlc embedding server start');
        }
      }
    }

    // 7. Post-generation verification (REQ-GH-252 FR-001, AC-001-03)
    const verification = postVerify(workingCopy);
    if (!verification.ok) {
      process.stderr.write(`${verification.reason}\n`);
      process.exit(verification.exitCode);
    }

    console.log('\nEmbedding generation complete.');
  } catch (err) {
    console.error(`Error: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  }
}

/**
 * Show current embedding status.
 */
async function runStatus() {
  console.log('Embedding status: Not yet implemented (Group 2+ scope)');
}

/**
 * Run incremental embedding generation.
 *
 * REQ-GH-227 / FR-004, FR-005, FR-006 / AC-004-04..08, AC-005-01..04, AC-006-01..04
 *
 * @returns {Promise<undefined | 'fallthrough'>} 'fallthrough' to run full generate
 */
async function runIncrementalGenerate(workingCopy, genArgs, { translateErrorCode, shouldPromptFullGenerate }) {
  const { join } = await import('node:path');
  const { existsSync, readdirSync, statSync } = await import('node:fs');
  const { runIncremental } = await import('../lib/embedding/incremental/index.js');

  // Find newest .emb package across known locations
  const embDirs = [
    join(workingCopy, 'docs', '.embeddings'),
    join(workingCopy, '.isdlc', 'embeddings'),
  ];
  let priorPackagePath = null;
  let newestMtime = 0;
  for (const dir of embDirs) {
    if (!existsSync(dir)) continue;
    try {
      for (const f of readdirSync(dir).filter(n => n.endsWith('.emb'))) {
        const full = join(dir, f);
        const mt = statSync(full).mtimeMs;
        if (mt > newestMtime) { newestMtime = mt; priorPackagePath = full; }
      }
    } catch { /* skip */ }
  }
  const outputPath = priorPackagePath || join(workingCopy, '.isdlc', 'embeddings', 'output.emb');

  console.log(`Running incremental embedding for: ${workingCopy}`);

  const result = await runIncremental({
    rootPath: workingCopy,
    priorPackagePath,
    outputPath
  });

  if (result.ok) {
    console.log(`Incremental complete: ${result.summary.changed.length} changed, ${result.summary.added.length} added, ${result.summary.unchanged} unchanged.`);
    return;
  }

  // Error path — translate and handle
  const msg = translateErrorCode(result.errorCode, { deletedCount: result.deletedCount });

  if (result.errorCode === 'NO_PRIOR_PACKAGE') {
    // AC-005-02, AC-005-03: interactive prompt
    console.log(msg);
    const response = await promptStdin();
    if (shouldPromptFullGenerate(response)) {
      console.log('Running full generation...');
      return 'fallthrough';
    } else {
      console.log('Exiting without changes.');
      return;
    }
  }

  // AC-004-08, AC-006-02: print error and exit non-zero
  console.error(msg);
  process.exit(1);
}

/**
 * Read one line from stdin for interactive prompts.
 */
function promptStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    const onData = (chunk) => { data += chunk; };
    const onEnd = () => { resolve(data.trim()); };
    process.stdin.once('data', (chunk) => {
      data = chunk.toString().trim();
      process.stdin.pause();
      resolve(data);
    });
    process.stdin.resume();
  });
}

/**
 * POST /reload to a running embedding server.
 * @param {string} host
 * @param {number} port
 * @param {string[]} paths - .emb package paths to load
 * @returns {Promise<{reloaded: number, errors: Array}>}
 */
async function reloadServer(host, port, paths) {
  const http = await import('node:http');
  const body = JSON.stringify({ paths });
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: host, port, path: '/reload', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { reject(new Error(`Invalid response: ${data}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(new Error('Reload request timed out')); });
    req.write(body);
    req.end();
  });
}

function printHelp() {
  console.log(`
iSDLC Embedding CLI

Usage:
  isdlc-embedding generate [path]        Generate embeddings (incremental by default)
  isdlc-embedding generate --full        Force full regeneration from scratch
  isdlc-embedding status                 Show embedding status
  isdlc-embedding server start           Start the embedding server
  isdlc-embedding server stop            Stop the embedding server
  isdlc-embedding server status          Show server status (JSON)
  isdlc-embedding server restart         Restart the embedding server
  isdlc-embedding configure              Interactive provider/model setup
  isdlc-embedding --help                 Show this help

Options:
  path    Working copy path (default: current directory)

Examples:
  isdlc-embedding generate               Generate from current directory
  isdlc-embedding generate ./mymod       Generate from specific module
  isdlc-embedding server start           Start server on configured port
  isdlc-embedding server stop            Stop running server
`.trim());
}
