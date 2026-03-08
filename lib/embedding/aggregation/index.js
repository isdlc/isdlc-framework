/**
 * Aggregation Pipeline — assemble release bundles from module packages.
 *
 * Collects multiple .emb packages, validates cross-module compatibility,
 * generates a release manifest, and creates a distributable tar bundle.
 *
 * REQ-0045 / FR-010 / AC-010-01 through AC-010-04 / M9 Aggregation
 * @module lib/embedding/aggregation
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

/**
 * @typedef {Object} ModuleRef
 * @property {string} moduleId - Module identifier
 * @property {string} version - Module version
 * @property {string} packagePath - Local path to .emb file
 * @property {string} checksum - Expected SHA-256 checksum
 */

/**
 * @typedef {Object} AggregateOptions
 * @property {ModuleRef[]} modules - Modules to include in the release
 * @property {string} releaseVersion - Release version string
 * @property {string} outputDir - Directory for the output bundle
 * @property {import('../registry/compatibility.js').CompatibilityMatrix} [compatibilityMatrix] - Optional matrix for validation
 * @property {Object} [registry] - Optional registry for module lookups
 */

/**
 * @typedef {Object} ReleaseManifest
 * @property {string} releaseVersion - Release version
 * @property {string} createdAt - ISO 8601 timestamp
 * @property {Array<{ moduleId: string, version: string, checksum: string }>} modules
 */

/**
 * @typedef {Object} ReleaseBundleResult
 * @property {string} bundlePath - Path to the created .tar bundle
 * @property {ReleaseManifest} manifest - Release manifest
 * @property {string[]} warnings - Non-fatal warnings
 */

/**
 * Compute SHA-256 hash of a file's contents.
 * @param {string} filePath
 * @returns {string}
 */
function hashFile(filePath) {
  const data = readFileSync(filePath);
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Create a simple tar archive from file entries.
 * Each entry: { name: string, data: Buffer }
 *
 * @param {Array<{ name: string, data: Buffer }>} entries
 * @returns {Buffer}
 */
function createTar(entries) {
  const blocks = [];

  for (const entry of entries) {
    const header = Buffer.alloc(512);
    const name = entry.name;
    header.write(name, 0, Math.min(name.length, 100), 'utf-8');

    // File mode
    header.write('0000644\0', 100, 8, 'utf-8');
    // Owner/group
    header.write('0001000\0', 108, 8, 'utf-8');
    header.write('0001000\0', 116, 8, 'utf-8');
    // File size in octal
    const sizeOctal = entry.data.length.toString(8).padStart(11, '0');
    header.write(sizeOctal + '\0', 124, 12, 'utf-8');
    // Modification time
    const mtime = Math.floor(Date.now() / 1000).toString(8).padStart(11, '0');
    header.write(mtime + '\0', 136, 12, 'utf-8');
    // Type flag: regular file
    header.write('0', 156, 1, 'utf-8');
    // USTAR indicator
    header.write('ustar\0', 257, 6, 'utf-8');
    header.write('00', 263, 2, 'utf-8');

    // Compute checksum
    header.fill(0x20, 148, 156);
    let checksum = 0;
    for (let i = 0; i < 512; i++) checksum += header[i];
    const checksumOctal = checksum.toString(8).padStart(6, '0');
    header.write(checksumOctal + '\0 ', 148, 8, 'utf-8');

    blocks.push(header);
    blocks.push(entry.data);

    // Pad to 512-byte boundary
    const remainder = entry.data.length % 512;
    if (remainder > 0) {
      blocks.push(Buffer.alloc(512 - remainder));
    }
  }

  // End-of-archive marker
  blocks.push(Buffer.alloc(1024));

  return Buffer.concat(blocks);
}

/**
 * Validate inputs for aggregate().
 *
 * @param {AggregateOptions} options
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateAggregationInputs(options) {
  const errors = [];

  if (!options) {
    return { valid: false, errors: ['Options are required'] };
  }

  if (!options.modules || !Array.isArray(options.modules) || options.modules.length === 0) {
    errors.push('At least one module is required');
  } else {
    for (let i = 0; i < options.modules.length; i++) {
      const mod = options.modules[i];
      if (!mod.moduleId) errors.push(`Module at index ${i} is missing moduleId`);
      if (!mod.version) errors.push(`Module at index ${i} is missing version`);
      if (!mod.packagePath) errors.push(`Module at index ${i} is missing packagePath`);
      if (!mod.checksum) errors.push(`Module at index ${i} is missing checksum`);
    }
  }

  if (!options.releaseVersion) {
    errors.push('releaseVersion is required');
  }

  if (!options.outputDir) {
    errors.push('outputDir is required');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Create a release manifest object.
 * AC-010-03: Manifest lists all included modules with versions and checksums.
 *
 * @param {Object} opts
 * @param {string} opts.releaseVersion
 * @param {Array<{ moduleId: string, version: string, checksum: string }>} opts.modules
 * @returns {ReleaseManifest}
 */
export function createReleaseManifest(opts) {
  return {
    releaseVersion: opts.releaseVersion,
    createdAt: new Date().toISOString(),
    modules: opts.modules.map(m => ({
      moduleId: m.moduleId,
      version: m.version,
      checksum: m.checksum,
    })),
  };
}

/**
 * Assemble a release bundle from multiple module packages.
 *
 * AC-010-01: Collects specified module packages into a release bundle.
 * AC-010-02: Cross-module compatibility validated before assembly.
 * AC-010-03: Release manifest lists all included modules with versions and checksums.
 * AC-010-04: Failed aggregation (incompatible versions) blocks release with clear error.
 *
 * @param {AggregateOptions} options
 * @returns {Promise<ReleaseBundleResult>}
 * @throws {Error} If validation fails, modules are incompatible, or files are missing
 */
export async function aggregate(options) {
  // Validate required fields
  if (!options.releaseVersion) {
    throw new Error('releaseVersion is required');
  }
  if (!options.outputDir) {
    throw new Error('outputDir is required');
  }
  if (!options.modules || options.modules.length === 0) {
    throw new Error('At least one module is required');
  }

  const warnings = [];

  // Verify all package files exist and checksums match
  for (const mod of options.modules) {
    if (!existsSync(mod.packagePath)) {
      throw new Error(`Package file not found: ${mod.packagePath} (module: ${mod.moduleId}@${mod.version})`);
    }

    const actualChecksum = hashFile(mod.packagePath);
    if (mod.checksum && actualChecksum !== mod.checksum) {
      throw new Error(
        `Package checksum mismatch for ${mod.moduleId}@${mod.version}: ` +
        `expected ${mod.checksum}, got ${actualChecksum}`
      );
    }
  }

  // AC-010-02: Cross-module compatibility validation
  if (options.compatibilityMatrix) {
    const moduleSet = options.modules.map(m => ({
      moduleId: m.moduleId,
      version: m.version,
    }));

    const validation = options.compatibilityMatrix.validateSet(moduleSet);
    if (!validation.compatible) {
      // AC-010-04: Block release with clear error
      throw new Error(
        `Release blocked: incompatible module versions. ` +
        `Errors: ${validation.errors.join('; ')}`
      );
    }
  }

  // Build the tar entries: include each .emb file
  const tarEntries = [];
  const manifestModules = [];

  for (const mod of options.modules) {
    const data = readFileSync(mod.packagePath);
    const fileName = `${mod.moduleId}-${mod.version}.emb`;
    tarEntries.push({ name: fileName, data });

    manifestModules.push({
      moduleId: mod.moduleId,
      version: mod.version,
      checksum: mod.checksum || hashFile(mod.packagePath),
    });
  }

  // AC-010-03: Create release manifest
  const manifest = createReleaseManifest({
    releaseVersion: options.releaseVersion,
    modules: manifestModules,
  });

  // Add manifest to tar
  const manifestJson = JSON.stringify(manifest, null, 2);
  tarEntries.unshift({
    name: 'release-manifest.json',
    data: Buffer.from(manifestJson, 'utf-8'),
  });

  // Create the tar bundle
  const tarBuffer = createTar(tarEntries);

  // Write the bundle file
  mkdirSync(options.outputDir, { recursive: true });
  const bundleName = `release-${options.releaseVersion}.tar`;
  const bundlePath = join(options.outputDir, bundleName);
  writeFileSync(bundlePath, tarBuffer);

  // Write manifest as a separate JSON file alongside the bundle
  const manifestPath = join(options.outputDir, `release-${options.releaseVersion}-manifest.json`);
  writeFileSync(manifestPath, manifestJson, 'utf-8');

  return {
    bundlePath,
    manifest,
    warnings,
  };
}
