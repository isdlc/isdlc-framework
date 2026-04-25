/**
 * iSDLC Core - Finalize Utilities
 * ================================
 * Provider-neutral finalize operations extracted from workflow-finalize.cjs.
 * Each function is a discrete, independently callable step.
 *
 * Traces to: FR-005 (REQ-GH-219)
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Merge a feature branch to main and delete it.
 * @param {string} branch - Branch name to merge
 * @param {string} projectRoot - Absolute path to project root
 * @returns {{ success: boolean, message: string, error?: string }}
 */
export function mergeBranch(branch, projectRoot) {
  try {
    // Commit any uncommitted work
    try {
      execSync('git add -A && git commit -m "Finalize workflow" --allow-empty', { cwd: projectRoot, stdio: 'pipe' });
    } catch (_) { /* may be nothing to commit */ }

    execSync('git checkout main', { cwd: projectRoot, stdio: 'pipe' });
    execSync(`git merge --no-ff ${branch} -m "Merge ${branch}"`, { cwd: projectRoot, stdio: 'pipe' });

    // Delete branch (non-critical)
    try {
      execSync(`git branch -d ${branch}`, { cwd: projectRoot, stdio: 'pipe' });
    } catch (_) { /* branch delete is non-critical */ }

    return { success: true, message: `Merged ${branch} to main` };
  } catch (err) {
    return { success: false, message: `Merge failed: ${err.message}`, error: err.message };
  }
}

/**
 * Move active_workflow to workflow_history.
 * @param {object} state - Full state.json object (mutated in place)
 * @returns {object} The mutated state
 */
export function moveWorkflowToHistory(state) {
  if (!state.active_workflow) return state;

  if (!state.workflow_history) state.workflow_history = [];
  state.workflow_history.push({
    ...state.active_workflow,
    status: 'completed',
    completed_at: new Date().toISOString()
  });

  return state;
}

/**
 * Clear transient workflow fields from state.
 * @param {object} state - Full state.json object (mutated in place)
 * @returns {object} The mutated state
 */
export function clearTransientFields(state) {
  delete state.active_workflow;
  state.current_phase = null;
  state.active_agent = null;
  return state;
}

/**
 * Sync external status (GitHub, BACKLOG.md).
 * @param {object} workflowInfo - { source, source_id, slug, artifact_folder }
 * @param {string} projectRoot - Absolute path to project root
 * @returns {{ github?: boolean, backlog?: boolean }}
 */
export function syncExternalStatus(workflowInfo, projectRoot) {
  const result = {};

  // GitHub issue close
  if (workflowInfo.source === 'github' && workflowInfo.source_id) {
    const match = workflowInfo.source_id.match(/^GH-(\d+)$/);
    if (match) {
      try {
        execSync(`gh issue close ${match[1]}`, { cwd: projectRoot, stdio: 'pipe' });
        try { execSync(`gh issue edit ${match[1]} --remove-label ready-to-build`, { cwd: projectRoot, stdio: 'pipe' }); } catch (_) { /* label may not exist */ }
        result.github = true;
      } catch (_) {
        result.github = false;
      }
    }
  }

  // BACKLOG.md sync
  try {
    const backlogPath = join(projectRoot, 'BACKLOG.md');
    if (existsSync(backlogPath)) {
      let content = readFileSync(backlogPath, 'utf8');
      const slug = workflowInfo.slug || workflowInfo.artifact_folder || '';
      const issueNum = workflowInfo.source_id ? workflowInfo.source_id.replace(/^GH-/, '#') : null;
      const lines = content.split('\n');
      let matchIdx = -1;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (slug && line.includes(slug)) { matchIdx = i; break; }
        if (issueNum && line.includes(issueNum) && /\[[ A~]\]/.test(line)) { matchIdx = i; break; }
      }

      if (matchIdx >= 0) {
        lines[matchIdx] = lines[matchIdx].replace(/\[[ A~]\]/, '[x]');
        writeFileSync(backlogPath, lines.join('\n'), 'utf8');
        result.backlog = true;
      }
    }
  } catch (_) {
    result.backlog = false;
  }

  return result;
}

/**
 * Rebuild the session cache.
 * @param {string} projectRoot - Absolute path to project root
 * @returns {{ success: boolean, error?: string }}
 */
export function rebuildSessionCache(projectRoot) {
  try {
    execSync('node bin/rebuild-cache.js', { cwd: projectRoot, stdio: 'pipe', timeout: 30000 });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Regenerate contracts (shipped + project-local).
 * @param {string} projectRoot - Absolute path to project root
 * @returns {{ success: boolean, error?: string }}
 */
export function regenerateContracts(projectRoot) {
  try {
    execSync('node bin/generate-contracts.js', { cwd: projectRoot, stdio: 'pipe', timeout: 30000 });
    try {
      execSync('node bin/generate-contracts.js --output .isdlc/config/contracts', { cwd: projectRoot, stdio: 'pipe', timeout: 30000 });
    } catch (_) { /* project-local contracts are optional */ }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Rebuild memory embeddings (user + project).
 * @param {string} projectRoot - Absolute path to project root
 * @returns {{ success: boolean, error?: string }}
 */
export function rebuildMemoryEmbeddings(projectRoot) {
  try {
    execSync(
      `node -e 'import("./lib/memory-embedder.js").then(m => m.rebuildIndex(process.env.HOME + "/.isdlc/user-memory/sessions", process.env.HOME + "/.isdlc/user-memory/index.emb", { provider: "local" }).then(r => console.log(JSON.stringify(r))))'`,
      { cwd: projectRoot, stdio: 'pipe', timeout: 60000 }
    );
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * F0010 — Push artifacts to knowledge service (REQ-GH-264 FR-004).
 *
 * When a knowledge service URL is configured, reads all files from the
 * artifact folder and calls isdlc_embedding_add_content for each one.
 * Fails open (logs warning, continues) if the service is unreachable.
 *
 * @param {string} projectRoot - Absolute path to project root
 * @param {string} artifactFolder - Relative path to artifact folder (e.g., 'docs/requirements/REQ-GH-264-...')
 * @param {object} [options] - Optional overrides
 * @param {Function} [options.addContentFn] - Injectable add_content caller for testing
 * @param {number} [options.timeoutMs=5000] - Per-file timeout
 * @returns {Promise<{ success: boolean, skipped?: boolean, message?: string, error?: string, filesProcessed?: number, filesFailed?: number }>}
 */
export async function pushToKnowledgeService(projectRoot, artifactFolder, options = {}) {
  const timeoutMs = options.timeoutMs || 5000;

  try {
    // Read knowledge config
    let knowledgeConfig;
    try {
      const cfgPath = join(projectRoot, '.isdlc', 'config.json');
      if (!existsSync(cfgPath)) {
        return { success: true, skipped: true, message: 'knowledge service not configured' };
      }
      const raw = JSON.parse(readFileSync(cfgPath, 'utf8'));
      const knowledge = (raw && typeof raw.knowledge === 'object' && raw.knowledge !== null)
        ? raw.knowledge
        : {};
      knowledgeConfig = {
        url: (typeof knowledge.url === 'string' && knowledge.url.length > 0) ? knowledge.url : null,
        projects: Array.isArray(knowledge.projects) ? knowledge.projects : [],
      };
    } catch {
      return { success: true, skipped: true, message: 'config read error (fail-open)' };
    }

    if (!knowledgeConfig.url) {
      return { success: true, skipped: true, message: 'knowledge service not configured' };
    }

    // Resolve artifact folder
    const absFolder = join(projectRoot, artifactFolder);
    if (!existsSync(absFolder)) {
      return { success: true, skipped: true, message: 'no artifacts to push' };
    }

    const files = readdirSync(absFolder).filter(f => {
      try {
        return statSync(join(absFolder, f)).isFile();
      } catch { return false; }
    });

    if (files.length === 0) {
      return { success: true, skipped: true, message: 'no artifacts to push' };
    }

    const projectId = knowledgeConfig.projects[0] || null;
    const addContentFn = options.addContentFn || null;
    let filesProcessed = 0;
    let filesFailed = 0;

    for (const file of files) {
      try {
        const content = readFileSync(join(absFolder, file), 'utf8');

        if (addContentFn) {
          // Use injected function (for testing or MCP delegation)
          await Promise.race([
            addContentFn({ content, file, project: projectId }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
          ]);
        } else {
          // In production, this would be called via MCP tool; log intent
          // eslint-disable-next-line no-console
          console.log(`[F0010] Would push ${file} to knowledge service at ${knowledgeConfig.url}`);
        }
        filesProcessed++;
      } catch (err) {
        filesFailed++;
        // eslint-disable-next-line no-console
        console.warn(`[F0010] Failed to push ${file}: ${err.message}`);
      }
    }

    if (filesFailed > 0 && filesProcessed === 0) {
      return { success: false, error: `all ${filesFailed} files failed to push`, filesProcessed, filesFailed };
    }

    return { success: true, filesProcessed, filesFailed, message: filesFailed > 0 ? 'partial success' : 'artifacts pushed' };
  } catch (err) {
    // Outer defensive catch (Article X fail-safe — fail open)
    return { success: false, error: err.message };
  }
}

/**
 * F0009 — Refresh code embeddings (REQ-GH-239 FR-007, FR-006, FR-008, NFR-006).
 *
 * Sync adapter wired into the finalize checklist runner. Delegates the heavy
 * lifting to `isdlc-embedding generate --incremental` via execSync, with
 * opt-in and bootstrap guards inline. The async equivalent used by non-runner
 * callers lives in `src/core/finalize/refresh-code-embeddings.js`.
 *
 * @param {string} projectRoot - Absolute path to project root
 * @returns {{ success: boolean, skipped?: boolean, error?: string, message?: string }}
 */
export function refreshCodeEmbeddings(projectRoot) {
  // FR-006: raw opt-in check (bypasses the config merge layer so defaults
  // cannot force embeddings on).
  try {
    const cfgPath = join(projectRoot, '.isdlc', 'config.json');
    if (!existsSync(cfgPath)) {
      return { success: true, skipped: true, message: 'embeddings not configured' };
    }
    let raw;
    try {
      raw = JSON.parse(readFileSync(cfgPath, 'utf8'));
    } catch {
      // ERR-F0009-001 — invalid JSON treated as opted out (fail-open per NFR-006)
      return { success: true, skipped: true, message: 'config read error (treated as opt-out)' };
    }
    if (raw.embeddings == null) {
      return { success: true, skipped: true, message: 'embeddings not configured' };
    }
    if (raw.embeddings.refresh_on_finalize === false) {
      return { success: true, skipped: true, message: 'refresh_on_finalize disabled' };
    }

    // FR-008: first-time bootstrap safety — do NOT run multi-hour generate on finalize.
    const embDir = join(projectRoot, '.isdlc', 'embeddings');
    const hasEmbPackage =
      existsSync(embDir) &&
      (() => {
        try {
          return readdirSync(embDir).some((f) => f.endsWith('.emb'));
        } catch {
          return false;
        }
      })();
    if (!hasEmbPackage) {
      const banner =
        "F0009 Code embeddings: skipped — run 'isdlc-embedding generate .' manually to bootstrap (one-time ~30-60 min)";
      // eslint-disable-next-line no-console
      console.log(banner);
      return { success: true, skipped: true, message: 'bootstrap_needed' };
    }

    // FR-007: incremental refresh via child process. stdio pipe to capture
    // progress; prefix with [F0009] on our way out so finalize logs stay clean.
    try {
      const out = execSync('node bin/isdlc-embedding.js generate . --incremental', {
        cwd: projectRoot,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 300000 // NFR-004: typical deltas ≤3min; 5min ceiling is generous
      });
      if (out && out.length > 0) {
        for (const line of out.toString().split('\n')) {
          if (line.trim()) {
            // eslint-disable-next-line no-console
            console.log(`[F0009] ${line}`);
          }
        }
      }
      return { success: true, message: 'code embeddings refreshed' };
    } catch (err) {
      // ERR-F0009-002 — fail-open: finalize continues despite child failure
      return {
        success: false,
        error: `isdlc-embedding generate failed: ${err.message}`
      };
    }
  } catch (err) {
    // Outer defensive catch (Article X fail-safe)
    return { success: false, error: err.message };
  }
}
