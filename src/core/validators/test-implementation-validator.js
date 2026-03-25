/**
 * Test Implementation Validator (Validator 2)
 * ==============================================
 * Three-part check:
 *   A) Planned test IDs coded in test files
 *   B) Production imports from test files are in modifiedFiles
 *   C) AC-to-production file mappings verified against modifiedFiles
 *
 * BUG-0057: Gate-blocker traceability verification (FR-002)
 * AC-002-01 through AC-002-07, AC-010-02
 *
 * Pure function: content-in, structured-result-out, no filesystem access.
 *
 * @module src/core/validators/test-implementation-validator
 */

import { extractTestCaseIds, extractTestToAcMappings } from './lib/test-id-parser.js';
import { posix } from 'node:path';

/**
 * Validate test implementation: planned tests coded, imports modified, AC-to-production traced.
 *
 * @param {string|null} testStrategyContent - test-strategy.md content
 * @param {{ path: string, content: string }[]|null} testFiles - test file contents
 * @param {string[]|null} modifiedFiles - paths from git diff
 * @returns {{ pass: boolean, failure_reason: string|null, missing_artifacts: string[], details: object }}
 */
export function validateTestImplementation(testStrategyContent, testFiles, modifiedFiles) {
  const missing_artifacts = [];
  if (testStrategyContent == null) missing_artifacts.push('testStrategy');
  if (testFiles == null) missing_artifacts.push('testFiles');

  if (missing_artifacts.length > 0) {
    return {
      pass: true,
      failure_reason: null,
      missing_artifacts,
      details: {
        total_planned: 0, implemented: 0, unimplemented_tests: [], implemented_tests: [],
        test_imports: [], unmodified_imports: [],
        ac_production_mappings: [], orphan_acs_no_production: [], orphan_acs_no_test: []
      }
    };
  }

  // Part A: Planned tests coded
  const plannedIds = extractTestCaseIds(testStrategyContent);
  const safeTestFiles = testFiles || [];
  const allTestContent = safeTestFiles.map(f => f.content).join('\n');

  const implemented_tests = [];
  const unimplemented_tests = [];

  for (const id of plannedIds) {
    if (allTestContent.includes(id)) {
      implemented_tests.push(id);
    } else {
      unimplemented_tests.push(id);
    }
  }

  // Part B: Production imports modified
  const skipBc = modifiedFiles == null;
  const safeModifiedFiles = modifiedFiles || [];
  const test_imports = [];
  const unmodified_imports = [];

  if (!skipBc) {
    for (const file of safeTestFiles) {
      const imports = parseImports(file.content, file.path);
      const resolvedImports = imports.filter(imp => {
        // Filter out node: and package imports
        return !imp.startsWith('node:') && !imp.includes('node_modules');
      });

      const importResults = resolvedImports.map(imp => ({
        import: imp,
        modified: safeModifiedFiles.some(mf => normalizePath(mf) === normalizePath(imp))
      }));

      test_imports.push({
        test_file: file.path,
        imports: resolvedImports,
        modified: importResults.every(r => r.modified)
      });

      for (const ir of importResults) {
        if (!ir.modified && !unmodified_imports.includes(ir.import)) {
          unmodified_imports.push(ir.import);
        }
      }
    }
  }

  // Part C: AC-to-production file traceability
  const mappings = extractTestToAcMappings(testStrategyContent);
  const ac_production_mappings = [];
  const orphan_acs_no_production = [];

  if (!skipBc) {
    // Build unique AC->production file pairs
    const acProdMap = new Map();
    for (const mapping of mappings) {
      if (mapping.production_file) {
        for (const acId of mapping.ac_ids) {
          if (!acProdMap.has(acId)) {
            acProdMap.set(acId, new Set());
          }
          acProdMap.get(acId).add(mapping.production_file);
        }
      }
    }

    for (const [acId, prodFiles] of acProdMap) {
      for (const prodFile of prodFiles) {
        const isModified = safeModifiedFiles.some(
          mf => normalizePath(mf) === normalizePath(prodFile)
        );
        ac_production_mappings.push({
          ac_id: acId,
          production_file: prodFile,
          modified: isModified
        });
        if (!isModified && !orphan_acs_no_production.includes(acId)) {
          orphan_acs_no_production.push(acId);
        }
      }
    }
  }

  const pass = unimplemented_tests.length === 0
    && unmodified_imports.length === 0
    && orphan_acs_no_production.length === 0;

  const reasons = [];
  if (unimplemented_tests.length > 0) reasons.push(`${unimplemented_tests.length} planned test(s) not implemented`);
  if (unmodified_imports.length > 0) reasons.push(`${unmodified_imports.length} imported module(s) not in modified files`);
  if (orphan_acs_no_production.length > 0) reasons.push(`${orphan_acs_no_production.length} AC(s) have unmodified production files`);

  return {
    pass,
    failure_reason: reasons.length > 0 ? reasons.join('; ') : null,
    missing_artifacts: [],
    details: {
      total_planned: plannedIds.length,
      implemented: implemented_tests.length,
      unimplemented_tests,
      implemented_tests,
      test_imports,
      unmodified_imports,
      ac_production_mappings,
      orphan_acs_no_production,
      orphan_acs_no_test: []
    }
  };
}

/**
 * Parse import and require statements from file content.
 * Resolves relative paths based on the file's directory.
 *
 * @param {string} content - File content
 * @param {string} filePath - Path of the file being parsed
 * @returns {string[]} Resolved import paths
 */
function parseImports(content, filePath) {
  const imports = [];

  // ESM: import ... from '...'
  const esmRegex = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+)?['"]([^'"]+)['"]/g;
  let match;
  while ((match = esmRegex.exec(content)) !== null) {
    imports.push(resolveImportPath(match[1], filePath));
  }

  // CJS: require('...')
  const cjsRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = cjsRegex.exec(content)) !== null) {
    imports.push(resolveImportPath(match[1], filePath));
  }

  return imports;
}

/**
 * Resolve an import path relative to the importing file.
 *
 * @param {string} importPath - The import specifier
 * @param {string} fromFile - The file doing the importing
 * @returns {string} Resolved project-relative path
 */
function resolveImportPath(importPath, fromFile) {
  // Bare specifiers (packages, node: protocol) — return as-is
  if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
    return importPath;
  }

  // Resolve relative to the importing file's directory
  const dir = posix.dirname(fromFile);
  return posix.normalize(posix.join(dir, importPath));
}

/**
 * Normalize a file path for comparison.
 */
function normalizePath(p) {
  return posix.normalize(p).replace(/^\.\//, '');
}
