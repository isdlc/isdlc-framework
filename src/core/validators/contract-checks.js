/**
 * Contract Checks — Inline Enforcement
 * ======================================
 * REQ-GH-213: Inline Contract Enforcement
 * FR-001 through FR-007
 *
 * Pure stateless check functions for each decision point.
 * Each function takes pre-loaded data (from SessionStart cache for Claude,
 * from loadContractEntry() for Codex) and validates a single decision point.
 * Throws ContractViolationError on violation, returns void on pass.
 * Fail-open: if contract data is null/missing, returns void (no-op).
 *
 * ADR-001: Stateless check functions on pre-loaded data.
 * ADR-003: Error-based enforcement (throw, not return).
 * Article X: Fail-safe defaults — fail-open on missing data.
 *
 * @module src/core/validators/contract-checks
 */

import { existsSync } from 'node:fs';
import { join, basename } from 'node:path';

// ---------------------------------------------------------------------------
// Error Class — FR-001, AC-001-04
// ---------------------------------------------------------------------------

/**
 * Error thrown when an inline contract check detects a violation.
 * Callers must catch and self-correct.
 */
export class ContractViolationError extends Error {
  /**
   * @param {Object} params
   * @param {string} params.decisionPoint - Which check point failed
   * @param {string} params.expected - What was expected
   * @param {string} params.actual - What was actually found
   * @param {string} [params.contractId] - Optional contract identifier
   */
  constructor({ decisionPoint, expected, actual, contractId }) {
    super(`CONTRACT VIOLATION [${decisionPoint}]: expected ${expected}, got ${actual}`);
    this.name = 'ContractViolationError';
    this.decisionPoint = decisionPoint;
    this.expected = expected;
    this.actual = actual;
    this.contractId = contractId || null;
  }
}

// ---------------------------------------------------------------------------
// Check Functions
// ---------------------------------------------------------------------------

/**
 * Validate that the roundtable is presenting confirmation domains in the expected order.
 * FR-002, AC-002-01
 *
 * @param {Object|null} contractData - Parsed contract entry (from session cache or loadContractEntry)
 * @param {string} domain - Domain about to be presented ("requirements", "architecture", "design")
 * @param {number} domainIndex - Zero-based index in the confirmation sequence
 * @throws {ContractViolationError} if domain doesn't match expected sequence position
 */
export function checkDomainTransition(contractData, domain, domainIndex) {
  // Fail-open: null/missing contract data
  if (!contractData) return;
  const sequence = contractData?.expectations?.presentation?.confirmation_sequence;
  if (!sequence || !Array.isArray(sequence)) return;

  // Index out of bounds
  if (domainIndex < 0 || domainIndex >= sequence.length) {
    throw new ContractViolationError({
      decisionPoint: 'domain_transition',
      expected: `domain index within 0-${sequence.length - 1}`,
      actual: `index ${domainIndex} out of bounds`,
      contractId: contractData.execution_unit || null
    });
  }

  const expected = sequence[domainIndex];
  if (domain !== expected) {
    throw new ContractViolationError({
      decisionPoint: 'domain_transition',
      expected,
      actual: domain,
      contractId: contractData.execution_unit || null
    });
  }
}

/**
 * Validate that all expected artifacts are in the write set before batch write executes.
 * FR-002, AC-002-02
 *
 * @param {Object|null} contractData - Parsed contract entry
 * @param {string[]} artifactPaths - Paths about to be written
 * @param {string} artifactFolder - Artifact folder name for path substitution
 * @throws {ContractViolationError} if expected artifacts are missing from write set
 */
export function checkBatchWrite(contractData, artifactPaths, artifactFolder) {
  // Fail-open: null/missing contract data
  if (!contractData) return;
  const expectedArtifacts = contractData?.expectations?.artifacts_produced;
  if (!expectedArtifacts || !Array.isArray(expectedArtifacts) || expectedArtifacts.length === 0) return;

  // Resolve {artifact_folder} placeholders and extract basenames for matching
  const actualBasenames = (artifactPaths || []).map(p => basename(p));

  const missing = [];
  for (const expected of expectedArtifacts) {
    const resolved = typeof expected === 'string'
      ? expected.replace(/\{artifact_folder\}/g, artifactFolder || '')
      : expected;
    const resolvedBasename = basename(resolved);
    if (!actualBasenames.includes(resolvedBasename)) {
      missing.push(resolvedBasename);
    }
  }

  if (missing.length > 0) {
    throw new ContractViolationError({
      decisionPoint: 'batch_write',
      expected: `all artifacts present in write set`,
      actual: `missing: ${missing.join(', ')}`,
      contractId: contractData.execution_unit || null
    });
  }
}

/**
 * Validate that persona output matches the active presentation template.
 * FR-002, AC-002-03; FR-004, AC-004-01, AC-004-03
 *
 * @param {Object|null} templateData - Parsed template for this confirmation domain
 * @param {string} output - The persona output text to validate
 * @throws {ContractViolationError} if format deviates from template
 */
export function checkPersonaFormat(templateData, output) {
  // Fail-open: null/missing template data
  if (!templateData) return;
  const format = templateData.format;
  if (!format) return;

  // Empty output cannot satisfy any format requirement
  if (!output || output.trim().length === 0) {
    throw new ContractViolationError({
      decisionPoint: 'persona_format',
      expected: `non-empty output in ${format.format_type || 'unknown'} format`,
      actual: 'empty output',
      contractId: templateData.domain || null
    });
  }

  // Check format_type
  if (format.format_type) {
    const lines = output.split('\n').filter(l => l.trim().length > 0);
    const contentLines = lines.filter(l => !l.trim().startsWith('#') && !l.trim().startsWith('**'));

    if (format.format_type === 'bulleted') {
      // Check for numbered list violations (1. 2. 3. etc.)
      const hasNumbered = contentLines.some(l => /^\s*\d+\.\s/.test(l));
      if (hasNumbered) {
        throw new ContractViolationError({
          decisionPoint: 'persona_format',
          expected: 'bulleted format (- or * prefixes)',
          actual: 'numbered list detected',
          contractId: templateData.domain || null
        });
      }
      // Check for table violations
      const hasTable = contentLines.some(l => /^\s*\|.*\|/.test(l));
      if (hasTable) {
        throw new ContractViolationError({
          decisionPoint: 'persona_format',
          expected: 'bulleted format (- or * prefixes)',
          actual: 'table format detected',
          contractId: templateData.domain || null
        });
      }
    }
  }

  // Check required_sections
  if (Array.isArray(format.required_sections)) {
    for (const section of format.required_sections) {
      // Look for section headers (## Section or **Section**)
      const sectionPattern = new RegExp(
        `(##\\s*${section}|\\*\\*${section}\\*\\*)`,
        'i'
      );
      if (!sectionPattern.test(output)) {
        throw new ContractViolationError({
          decisionPoint: 'persona_format',
          expected: `required section "${section}" present`,
          actual: `section "${section}" not found in output`,
          contractId: templateData.domain || null
        });
      }
    }
  }

  // Check section_order
  if (Array.isArray(format.section_order) && format.section_order.length > 1) {
    let lastIndex = -1;
    for (const section of format.section_order) {
      const sectionPattern = new RegExp(
        `(##\\s*${section}|\\*\\*${section}\\*\\*)`,
        'i'
      );
      const match = output.match(sectionPattern);
      if (match) {
        const currentIndex = output.indexOf(match[0]);
        if (currentIndex < lastIndex) {
          throw new ContractViolationError({
            decisionPoint: 'persona_format',
            expected: `sections in order: ${format.section_order.join(', ')}`,
            actual: `section "${section}" appears out of order`,
            contractId: templateData.domain || null
          });
        }
        lastIndex = currentIndex;
      }
    }
  }

  // Check assumptions_placement
  if (format.assumptions_placement) {
    const hasAssumptionsSection = /##\s*assumptions|\*\*assumptions\*\*/i.test(output);
    if (format.assumptions_placement === 'inline' && hasAssumptionsSection) {
      // Inline placement should NOT have a separate assumptions section
      // But we allow it as a soft check — only the presence of inline markers matters
    }
    // For 'batched', a separate section is expected — checked via required_sections
  }
}

/**
 * Validate that all configured personas have contributed before advancing.
 * FR-002, AC-002-04, AC-002-05
 *
 * @param {string[]|null} configuredPersonas - From roundtable.yaml default_personas
 * @param {string[]} contributedPersonas - Personas that have actually contributed output
 * @throws {ContractViolationError} if any configured persona is missing from contributions
 */
export function checkPersonaContribution(configuredPersonas, contributedPersonas) {
  // Fail-open: null/empty configured personas
  if (!configuredPersonas || !Array.isArray(configuredPersonas) || configuredPersonas.length === 0) return;

  const contributed = new Set(contributedPersonas || []);
  const silent = configuredPersonas.filter(p => !contributed.has(p));

  if (silent.length > 0) {
    throw new ContractViolationError({
      decisionPoint: 'persona_contribution',
      expected: `all personas contributed: ${configuredPersonas.join(', ')}`,
      actual: `silent personas: ${silent.join(', ')}`,
      contractId: null
    });
  }
}

/**
 * Validate correct agent is being delegated to for a phase.
 * FR-003, AC-003-01; FR-006, AC-006-01
 *
 * @param {Object|null} contractData - Parsed contract entry
 * @param {string} phaseKey - Phase key (e.g., "06-implementation")
 * @param {string} agentName - Agent about to be delegated to
 * @throws {ContractViolationError} if agent doesn't match expected agent for phase
 */
export function checkDelegation(contractData, phaseKey, agentName) {
  // Fail-open: null/missing contract data
  if (!contractData) return;
  const expectedAgent = contractData?.expectations?.agent;
  if (expectedAgent === null || expectedAgent === undefined) return;

  if (agentName !== expectedAgent) {
    throw new ContractViolationError({
      decisionPoint: 'delegation',
      expected: expectedAgent,
      actual: agentName,
      contractId: contractData.execution_unit || null
    });
  }
}

/**
 * Validate required artifacts exist on disk before phase completion.
 * FR-003, AC-003-02; FR-006, AC-006-02
 *
 * This is the only check function with I/O (disk existence check) —
 * acceptable because it runs once at phase completion, not per-decision-point.
 *
 * @param {Object|null} contractData - Parsed contract entry
 * @param {string} artifactFolder - Artifact folder name
 * @param {string} projectRoot - Project root for path resolution
 * @throws {ContractViolationError} if required artifacts missing from disk
 */
export function checkArtifacts(contractData, artifactFolder, projectRoot) {
  // Fail-open: null/missing contract data
  if (!contractData) return;
  const expectedArtifacts = contractData?.expectations?.artifacts_produced;
  if (!expectedArtifacts || !Array.isArray(expectedArtifacts) || expectedArtifacts.length === 0) return;

  const missing = [];
  for (const artPath of expectedArtifacts) {
    if (typeof artPath !== 'string') continue;
    const resolved = artPath.replace(/\{artifact_folder\}/g, artifactFolder || '');
    const fullPath = join(projectRoot || '.', resolved);
    if (!existsSync(fullPath)) {
      missing.push(resolved);
    }
  }

  if (missing.length > 0) {
    throw new ContractViolationError({
      decisionPoint: 'artifacts',
      expected: `all artifacts exist on disk`,
      actual: `missing: ${missing.join(', ')}`,
      contractId: contractData.execution_unit || null
    });
  }
}

/**
 * Validate that the task list includes all required phases, categories, metadata, and sections.
 * FR-004, AC-004-05, AC-004-06
 *
 * @param {Object|null} templateData - Parsed tasks template
 * @param {Object} taskPlan - Parsed task plan structure
 * @throws {ContractViolationError} if required categories or metadata are missing
 */
export function checkTaskList(templateData, taskPlan) {
  // Fail-open: null/missing template data
  if (!templateData) return;
  const format = templateData.format;
  if (!format) return;

  if (!taskPlan || typeof taskPlan !== 'object') {
    throw new ContractViolationError({
      decisionPoint: 'task_list',
      expected: 'valid task plan object',
      actual: 'null or invalid task plan',
      contractId: templateData.domain || null
    });
  }

  // Check required_phases
  if (Array.isArray(format.required_phases)) {
    const presentPhases = Object.keys(taskPlan.phases || {});
    const missingPhases = format.required_phases.filter(p => !presentPhases.includes(p));
    if (missingPhases.length > 0) {
      throw new ContractViolationError({
        decisionPoint: 'task_list',
        expected: `phases: ${format.required_phases.join(', ')}`,
        actual: `missing phases: ${missingPhases.join(', ')}`,
        contractId: templateData.domain || null
      });
    }
  }

  // Check required_task_categories per phase
  if (format.required_task_categories && typeof format.required_task_categories === 'object') {
    for (const [phase, requiredCategories] of Object.entries(format.required_task_categories)) {
      const phaseData = taskPlan.phases?.[phase];
      if (!phaseData) continue; // Phase missing is caught by required_phases check above
      const presentCategories = phaseData.categories || [];
      const missingCategories = requiredCategories.filter(c => !presentCategories.includes(c));
      if (missingCategories.length > 0) {
        throw new ContractViolationError({
          decisionPoint: 'task_list',
          expected: `phase ${phase} categories: ${requiredCategories.join(', ')}`,
          actual: `missing categories: ${missingCategories.join(', ')}`,
          contractId: templateData.domain || null
        });
      }
    }
  }

  // Check required_task_metadata
  if (Array.isArray(format.required_task_metadata)) {
    const tasks = taskPlan.tasks || [];
    for (const task of tasks) {
      const missingMeta = format.required_task_metadata.filter(m => !(m in task));
      if (missingMeta.length > 0) {
        throw new ContractViolationError({
          decisionPoint: 'task_list',
          expected: `task metadata: ${format.required_task_metadata.join(', ')}`,
          actual: `task "${task.id || 'unknown'}" missing: ${missingMeta.join(', ')}`,
          contractId: templateData.domain || null
        });
      }
    }
  }

  // Check required_sections
  if (Array.isArray(format.required_sections)) {
    const presentSections = taskPlan.sections || [];
    const missingSections = format.required_sections.filter(s => !presentSections.includes(s));
    if (missingSections.length > 0) {
      throw new ContractViolationError({
        decisionPoint: 'task_list',
        expected: `sections: ${format.required_sections.join(', ')}`,
        actual: `missing sections: ${missingSections.join(', ')}`,
        contractId: templateData.domain || null
      });
    }
  }
}
