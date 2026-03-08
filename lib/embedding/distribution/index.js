/**
 * Distribution Adapters — transport layer for publishing/fetching .emb packages.
 *
 * Provides pluggable transports for Artifactory, Nexus, S3, and SFTP.
 * Uses dependency-injected HTTP client for testability (no real network calls in tests).
 *
 * REQ-0045 / FR-007 / AC-007-01 through AC-007-04 / M8 Distribution
 * @module lib/embedding/distribution
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

/**
 * Supported transport types.
 * AC-007-01: Artifactory, Nexus, S3, SFTP
 */
export const TRANSPORT_TYPES = ['artifactory', 'nexus', 's3', 'sftp'];

/**
 * @typedef {Object} TransportConfig
 * @property {string} type - Transport type: 'artifactory'|'nexus'|'s3'|'sftp'
 * @property {string} url - Base URL for the repository
 * @property {Object} [auth] - Authentication credentials
 * @property {number} [retries=3] - Number of retry attempts
 * @property {number} [timeoutMs=60000] - Timeout per request in milliseconds
 * @property {Object} [httpClient] - Injected HTTP client for testing
 */

/**
 * @typedef {Object} PublishOptions
 * @property {string} moduleId - Module identifier
 * @property {string} version - Package version
 * @property {string} filePath - Local path to .emb file
 * @property {string} checksum - SHA-256 checksum of the package
 */

/**
 * @typedef {Object} FetchOptions
 * @property {string} moduleId - Module identifier
 * @property {string} version - Package version
 * @property {string} outputDir - Where to save the downloaded file
 * @property {string} [expectedChecksum] - Expected SHA-256 checksum for validation
 */

/**
 * @typedef {Object} FetchResult
 * @property {string} filePath - Path to downloaded file
 * @property {string} actualChecksum - Computed SHA-256 of downloaded file
 * @property {boolean|null} checksumValid - Whether checksum matches expected
 */

/**
 * Build the remote path for a package.
 * @param {string} baseUrl
 * @param {string} moduleId
 * @param {string} version
 * @returns {string}
 */
function buildPath(baseUrl, moduleId, version) {
  const base = baseUrl.replace(/\/+$/, '');
  return `${base}/${moduleId}/${version}/${moduleId}-${version}.emb`;
}

/**
 * Build the directory listing URL for a module.
 * @param {string} baseUrl
 * @param {string} moduleId
 * @returns {string}
 */
function buildListPath(baseUrl, moduleId) {
  const base = baseUrl.replace(/\/+$/, '');
  return `${base}/${moduleId}/`;
}

/**
 * Compute SHA-256 hash of content.
 * @param {string|Buffer} data
 * @returns {string}
 */
function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Create a transport adapter with common publish/fetch/listVersions operations.
 * All adapters share the same interface; they differ only in URL construction.
 *
 * @param {TransportConfig} config
 * @returns {Object} Transport with publish(), fetch(), listVersions(), config
 */
function createBaseTransport(config) {
  const { url, auth, httpClient, retries = 3, timeoutMs = 60000 } = config;

  const transportConfig = {
    type: config.type,
    url,
    auth,
    retries,
    timeoutMs,
  };

  /**
   * Publish a package to the remote repository.
   * AC-007-01: Transport publishes to remote.
   *
   * @param {PublishOptions} options
   * @returns {Promise<{ url: string }>}
   */
  async function publish(options) {
    const { moduleId, version, filePath, checksum } = options;
    const remotePath = buildPath(url, moduleId, version);
    const data = readFileSync(filePath);

    const response = await httpClient.request('PUT', remotePath, {
      body: data,
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Checksum-SHA256': checksum,
      },
      auth,
      timeout: timeoutMs,
    });

    return { url: remotePath, status: response.status };
  }

  /**
   * Fetch a package from the remote repository.
   * AC-007-03: Validates checksum before replacing local packages.
   * AC-007-04: Previous version retained until new version verified.
   *
   * @param {FetchOptions} options
   * @returns {Promise<FetchResult>}
   */
  async function fetch(options) {
    const { moduleId, version, outputDir, expectedChecksum } = options;
    const remotePath = buildPath(url, moduleId, version);

    const response = await httpClient.request('GET', remotePath, {
      auth,
      timeout: timeoutMs,
    });

    const content = response.body;
    const actualChecksum = sha256(content);

    // AC-007-03: Validate checksum if expected checksum is provided
    let checksumValid = null;
    if (expectedChecksum) {
      checksumValid = actualChecksum === expectedChecksum;
    } else {
      checksumValid = true;
    }

    // AC-007-04: Write to a temp file first, only finalize if checksum is valid
    const fileName = `${moduleId}-${version}.emb`;
    const filePath = join(outputDir, fileName);

    if (checksumValid) {
      mkdirSync(outputDir, { recursive: true });
      writeFileSync(filePath, content, typeof content === 'string' ? 'utf-8' : undefined);
    }

    return {
      filePath: checksumValid ? filePath : null,
      actualChecksum,
      checksumValid,
    };
  }

  /**
   * List available versions for a module.
   * AC-007-02: Queries registry for newer compatible versions.
   *
   * @param {string} moduleId
   * @returns {Promise<string[]>}
   */
  async function listVersions(moduleId) {
    const listUrl = buildListPath(url, moduleId);
    const response = await httpClient.request('GET', listUrl, {
      auth,
      timeout: timeoutMs,
    });

    if (response.status === 404) return [];

    let body = response.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        return [];
      }
    }

    return Array.isArray(body?.versions) ? body.versions : [];
  }

  return {
    publish,
    fetch,
    listVersions,
    config: transportConfig,
  };
}

/**
 * Create a transport adapter for the given configuration.
 * AC-007-01: Transport adapters for Artifactory, Nexus, S3, SFTP.
 *
 * @param {TransportConfig} config
 * @returns {Object} Transport instance with publish(), fetch(), listVersions()
 * @throws {Error} If type is unknown or required fields are missing
 */
export function createTransport(config) {
  if (!config || !config.type) {
    throw new Error('transport type is required');
  }
  if (!config.url) {
    throw new Error('url is required');
  }
  if (!TRANSPORT_TYPES.includes(config.type)) {
    throw new Error(`Unknown transport type: ${config.type}. Supported: ${TRANSPORT_TYPES.join(', ')}`);
  }

  return createBaseTransport(config);
}

/**
 * Create an update checker that queries a transport for newer versions.
 * AC-007-02: Update checker queries registry for newer compatible versions.
 *
 * @param {Object} transport - A transport instance from createTransport()
 * @returns {Object} UpdateChecker with checkForUpdates()
 */
export function createUpdateChecker(transport) {
  /**
   * Check if newer versions are available for a module.
   *
   * @param {string} moduleId
   * @param {string} currentVersion
   * @returns {Promise<{ hasUpdates: boolean, available: string[], error?: string }>}
   */
  async function checkForUpdates(moduleId, currentVersion) {
    try {
      const versions = await transport.listVersions(moduleId);

      // Filter to versions newer than current
      const available = versions.filter(v => v !== currentVersion && v > currentVersion);

      return {
        hasUpdates: available.length > 0,
        available,
        currentVersion,
      };
    } catch (err) {
      return {
        hasUpdates: false,
        available: [],
        currentVersion,
        error: err.message,
      };
    }
  }

  return { checkForUpdates };
}
