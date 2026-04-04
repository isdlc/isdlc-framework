/**
 * Client-side helpers to push content to the embedding server.
 *
 * Used by:
 *   - Workflow finalize step: pushRefresh() with delta files
 *   - User's LLM session (via MCP tool): pushContent() with external chunks
 *
 * REQ-GH-224 FR-005, FR-008
 * @module lib/embedding/server/refresh-client
 */

const DEFAULT_TIMEOUT_MS = 30000;

/**
 * POST /refresh with delta file list. Server re-chunks + re-embeds.
 * Fail-open: returns {ok: false, error} on failure (never throws).
 *
 * @param {string} host
 * @param {number} port
 * @param {Array<{path: string, operation?: 'add'|'modify'|'delete'}>} changedFiles
 * @param {number} [timeoutMs=30000]
 * @returns {Promise<{ok: boolean, refreshed?: number, deleted?: number, errors?: Array, error?: string}>}
 */
export async function pushRefresh(host, port, changedFiles, timeoutMs = DEFAULT_TIMEOUT_MS) {
  if (!Array.isArray(changedFiles) || changedFiles.length === 0) {
    return { ok: true, refreshed: 0, deleted: 0, errors: [] };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`http://${host}:${port}/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: changedFiles }),
      signal: controller.signal,
    });

    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }

    const body = await res.json();
    return { ok: true, ...body };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * POST /add-content with chunks. Server adds to in-memory store.
 * Fail-open: returns {ok: false, error} on failure (never throws).
 *
 * @param {string} host
 * @param {number} port
 * @param {Array<object>} chunks
 * @param {string} source - Source tag (e.g., 'external:confluence-wiki')
 * @param {string} [tier='full'] - Redaction tier
 * @param {number} [timeoutMs=30000]
 * @returns {Promise<{ok: boolean, added?: number, errors?: Array, error?: string}>}
 */
export async function pushContent(host, port, chunks, source, tier = 'full', timeoutMs = DEFAULT_TIMEOUT_MS) {
  if (!Array.isArray(chunks) || chunks.length === 0) {
    return { ok: false, error: 'chunks array is empty' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`http://${host}:${port}/add-content`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chunks, source, tier }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      return { ok: false, error: errBody.error || `HTTP ${res.status}` };
    }

    const body = await res.json();
    return { ok: true, ...body };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * POST /reload to reload .emb packages from disk.
 *
 * @param {string} host
 * @param {number} port
 * @param {string[]} [packagePaths] - Specific paths to reload (empty = reload all)
 * @param {number} [timeoutMs=60000]
 * @returns {Promise<{ok: boolean, reloaded?: number, errors?: Array, error?: string}>}
 */
export async function reloadPackages(host, port, packagePaths = [], timeoutMs = 60000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`http://${host}:${port}/reload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths: packagePaths }),
      signal: controller.signal,
    });

    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }

    const body = await res.json();
    return { ok: true, ...body };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    clearTimeout(timer);
  }
}
