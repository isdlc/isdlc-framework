/**
 * Provider-Neutral Task Validator Module
 *
 * Validates task coverage against FRs, ACs, and blast radius files.
 * Called by the roundtable before PRESENTING_TASKS and by the
 * traceability enforcement hook at build-phase gates.
 *
 * Requirements: REQ-GH-223 FR-001 (AC-001-01, AC-001-02)
 * @module src/core/tasks/task-validator
 */

// ---------------------------------------------------------------------------
// FR-001: validateTaskCoverage (AC-001-01)
// ---------------------------------------------------------------------------

/**
 * Validate that every FR, AC, and blast radius file has a covering task.
 *
 * @param {object|null} plan - Parsed task plan from readTaskPlan()
 * @param {string|null} requirementsContent - Raw markdown of requirements-spec.md
 * @param {string|null} impactAnalysisContent - Raw markdown of impact-analysis.md
 * @returns {{ valid: boolean, covered: CoverageEntry[], uncovered: UncoveredEntry[], orphanTasks: string[], summary: string }}
 */
export function validateTaskCoverage(plan, requirementsContent, impactAnalysisContent) {
  const covered = [];
  const uncovered = [];
  const orphanTasks = [];

  // Edge case: null or missing requirements — nothing to validate
  if (!requirementsContent) {
    return { valid: true, covered: [], uncovered: [], orphanTasks: [], summary: 'No requirements to validate against' };
  }

  // Edge case: null or error plan
  if (!plan || plan.error) {
    const frs = extractFRs(requirementsContent);
    for (const fr of frs) {
      uncovered.push({ id: fr.id, description: fr.description, type: 'fr' });
      for (const ac of fr.acs) {
        uncovered.push({ id: ac.id, description: ac.description, type: 'ac' });
      }
    }
    const frCount = frs.length;
    const acCount = frs.reduce((sum, fr) => sum + fr.acs.length, 0);
    return {
      valid: false,
      covered: [],
      uncovered,
      orphanTasks: [],
      summary: `0/${frCount} FRs covered, 0/${acCount} ACs covered`
    };
  }

  // Collect all task traces and files across all phases
  const allTasks = [];
  for (const phase of Object.values(plan.phases)) {
    allTasks.push(...phase.tasks);
  }

  const traceSet = new Set();
  const fileSet = new Set();
  for (const task of allTasks) {
    for (const trace of task.traces) {
      traceSet.add(trace.trim());
    }
    for (const file of task.files) {
      fileSet.add(file.path);
    }
    if (task.traces.length === 0) {
      orphanTasks.push(task.id);
    }
  }

  // Extract FRs and ACs from requirements
  const frs = extractFRs(requirementsContent);
  let totalFRs = 0;
  let coveredFRs = 0;
  let totalACs = 0;
  let coveredACs = 0;

  for (const fr of frs) {
    totalFRs++;
    const frCovered = traceSet.has(fr.id);
    const coveredAcIds = [];
    const taskIds = [];

    // Find tasks that trace to this FR
    for (const task of allTasks) {
      if (task.traces.some(t => t.trim() === fr.id)) {
        taskIds.push(task.id);
      }
    }

    for (const ac of fr.acs) {
      totalACs++;
      if (traceSet.has(ac.id)) {
        coveredAcIds.push(ac.id);
        coveredACs++;
      } else {
        uncovered.push({ id: ac.id, description: ac.description, type: 'ac' });
      }
    }

    if (frCovered || taskIds.length > 0) {
      coveredFRs++;
      const taskFiles = [];
      for (const task of allTasks) {
        if (taskIds.includes(task.id)) {
          taskFiles.push(...task.files.map(f => f.path));
        }
      }
      covered.push({
        frId: fr.id,
        frDescription: fr.description,
        acIds: coveredAcIds,
        taskIds,
        files: [...new Set(taskFiles)],
        coverage: `${coveredAcIds.length}/${fr.acs.length} (${fr.acs.length === 0 ? 100 : Math.round(coveredAcIds.length / fr.acs.length * 100)}%)`
      });
    } else {
      uncovered.push({ id: fr.id, description: fr.description, type: 'fr' });
    }
  }

  // Blast radius check (skip if no impact analysis)
  let totalBRFiles = 0;
  let coveredBRFiles = 0;
  if (impactAnalysisContent) {
    const brFiles = extractBlastRadiusFiles(impactAnalysisContent);
    totalBRFiles = brFiles.length;
    for (const brFile of brFiles) {
      if (fileSet.has(brFile)) {
        coveredBRFiles++;
      } else {
        uncovered.push({ id: brFile, description: brFile, type: 'blast_radius_file' });
      }
    }
  }

  const valid = uncovered.length === 0;
  let summary = `${coveredFRs}/${totalFRs} FRs covered, ${coveredACs}/${totalACs} ACs covered`;
  if (totalBRFiles > 0) {
    summary += `, ${coveredBRFiles}/${totalBRFiles} blast radius files covered`;
  }

  return { valid, covered, uncovered, orphanTasks, summary };
}

// ---------------------------------------------------------------------------
// Internal: Parse requirements-spec.md for FR and AC identifiers
// ---------------------------------------------------------------------------

/**
 * Extract FR-NNN headings and AC-NNN-NN lines from requirements markdown.
 * @param {string} content - Raw requirements-spec.md content
 * @returns {Array<{id: string, description: string, acs: Array<{id: string, description: string}>}>}
 */
function extractFRs(content) {
  const frs = [];
  const frRegex = /^###\s+(FR-\d{3}):\s*(.+)$/gm;
  let frMatch;

  while ((frMatch = frRegex.exec(content)) !== null) {
    const frId = frMatch[1];
    const frDesc = frMatch[2].trim();

    // Find ACs between this FR and the next FR (or end of content)
    const frStart = frMatch.index + frMatch[0].length;
    const nextFrMatch = content.indexOf('\n### FR-', frStart);
    const sectionEnd = nextFrMatch === -1 ? content.length : nextFrMatch;
    const section = content.slice(frStart, sectionEnd);

    const acs = [];
    const acRegex = /^-\s+\*\*(AC-\d{3}-\d{2})\*\*:\s*(.+)$/gm;
    let acMatch;
    while ((acMatch = acRegex.exec(section)) !== null) {
      acs.push({ id: acMatch[1], description: acMatch[2].trim() });
    }

    frs.push({ id: frId, description: frDesc, acs });
  }

  return frs;
}

// ---------------------------------------------------------------------------
// Internal: Parse impact-analysis.md for Tier 1 blast radius files
// ---------------------------------------------------------------------------

/**
 * Extract file paths from the Tier 1 (direct changes) table.
 * @param {string} content - Raw impact-analysis.md content
 * @returns {string[]} Array of file paths
 */
function extractBlastRadiusFiles(content) {
  const files = [];
  // Look for Tier 1 table rows: | path/to/file | ...
  // The Tier 1 section typically starts with "### Tier 1" or "**Tier 1"
  const tier1Match = content.match(/(?:###?\s*Tier 1|\*\*Tier 1)[^\n]*\n([\s\S]*?)(?=(?:###?\s*Tier [23]|\*\*Tier [23])|$)/i);
  if (!tier1Match) return files;

  const tier1Section = tier1Match[1];
  // Match table rows: | file-path | ...
  const rowRegex = /^\|\s*`?([^\s|`]+)`?\s*\|/gm;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(tier1Section)) !== null) {
    const path = rowMatch[1].trim();
    // Skip table headers and separators
    if (path && !path.startsWith('-') && !path.toLowerCase().includes('file') && !path.toLowerCase().includes('path')) {
      files.push(path);
    }
  }

  return files;
}
