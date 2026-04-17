/**
 * Task Card Composer — composes inner affordance card for active background sub-task
 *
 * Loads task card template, queries skill manifest for applicable skills
 * (uses injection-planner.js resolveExternalSkills), applies max_skills_total
 * budget from config (getRoundtableConfig), renders per delivery_type.
 *
 * Filter: priority-sorted, shipped skills get small boost, truncate at
 * max_skills_total. Adds sub-task preferred tools + expected output shape.
 * Max ~30 lines. Fail-open: returns minimal card on any error (Article X).
 *
 * Traces: FR-001, AC-001-02, FR-004, AC-004-01, AC-004-02, AC-004-03
 * @module src/core/roundtable/task-card-composer
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeInjectionPlan } from '../skills/injection-planner.js';
import { getRoundtableConfig, ROUNDTABLE_DEFAULTS } from '../config/config-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/** Shipped task card templates: src/isdlc/config/roundtable/task-cards/ */
const SHIPPED_TASK_CARDS_DIR = resolve(__dirname, '..', '..', 'isdlc', 'config', 'roundtable', 'task-cards');

/** Maximum lines for composed task card output */
const MAX_TOTAL_LINES = 30;

/** Priority boost for shipped (framework) skills in sorting */
const SHIPPED_BOOST = 0.1;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Safely read and parse a JSON file. Returns null on any error (fail-open).
 * @param {string} filePath
 * @returns {object|null}
 */
function safeReadJson(filePath) {
  try {
    if (!existsSync(filePath)) return null;
    const content = readFileSync(filePath, 'utf8');
    if (!content || !content.trim()) return null;
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Map sub-task ID to task card template filename.
 * Convention: sub-task ID in UPPER_CASE or camelCase maps to lowercase-hyphenated.task-card.json
 * Example: SCOPE_FRAMING -> scope-framing.task-card.json
 *          CODEBASE_SCAN -> codebase-scan.task-card.json
 *
 * @param {string} subTaskId - Sub-task identifier
 * @returns {string} Task card template filename
 */
function subTaskToFilename(subTaskId) {
  return subTaskId.toLowerCase().replace(/_/g, '-') + '.task-card.json';
}

/**
 * Load a task card template with override resolution.
 * Override dir is checked first; shipped dir is fallback (ADR-007).
 *
 * @param {string} subTaskId - Sub-task identifier
 * @param {string} shippedDir - Shipped task-cards directory
 * @param {string|null} overrideDir - User override task-cards directory
 * @returns {object|null} Parsed task card template or null
 */
function loadTaskCardTemplate(subTaskId, shippedDir, overrideDir) {
  const filename = subTaskToFilename(subTaskId);

  // 1. Check override first (ADR-007)
  if (overrideDir) {
    const data = safeReadJson(join(overrideDir, filename));
    if (data !== null) return data;
  }

  // 2. Fall back to shipped
  return safeReadJson(join(shippedDir, filename));
}

/**
 * Build a minimal fallback task card when template loading or composition fails.
 * Ensures the system always has something to inject (fail-open, Article X).
 *
 * @param {string} subTaskId - Sub-task identifier
 * @returns {string} Minimal task card text
 */
function buildMinimalTaskCard(subTaskId) {
  return [
    `--- TASK: ${subTaskId} ---`,
    'Skills: (none resolved)',
    'Tools: semantic_search',
    '--- END TASK CARD ---',
  ].join('\n');
}

/**
 * Merge template skills with manifest-resolved skills.
 * Template skills provide static defaults; manifest skills are dynamic.
 * Deduplicates by skill ID. Shipped skills get a small sorting boost.
 *
 * @param {Array<object>} templateSkills - Skills from template definition
 * @param {Array<object>} manifestSkills - Skills from injection planner
 * @returns {Array<object>} Merged, deduplicated skill list
 */
function mergeAndSortSkills(templateSkills, manifestSkills) {
  const skillMap = new Map();

  // Template skills are the base (lower priority in sort)
  for (const skill of templateSkills) {
    const id = skill.id || skill.skillId || skill.name;
    if (!id) continue;
    skillMap.set(id, {
      id,
      source: skill.source || 'shipped',
      deliveryType: skill.delivery_type || skill.deliveryType || 'context',
      priority: 0.5, // base priority
    });
  }

  // Manifest skills supplement/override
  for (const skill of manifestSkills) {
    const id = skill.skillId || skill.name || skill.id;
    if (!id) continue;
    const existing = skillMap.get(id);
    const source = skill.source || 'external';
    // Shipped skills get a small boost
    const boost = (source === 'shipped' || source === 'built_in') ? SHIPPED_BOOST : 0;
    skillMap.set(id, {
      id,
      source,
      deliveryType: skill.deliveryType || skill.delivery_type || (existing ? existing.deliveryType : 'context'),
      priority: (existing ? existing.priority : 0.3) + boost,
    });
  }

  // Sort by priority descending (higher = more relevant)
  return Array.from(skillMap.values()).sort((a, b) => b.priority - a.priority);
}

/**
 * Resolve the max skills budget from sub-task override, config, or default.
 *
 * @param {object} activeSubTask - Sub-task definition (may have max_skills_override)
 * @param {object} config - Roundtable config (from getRoundtableConfig)
 * @returns {number} Max skills total
 */
function resolveMaxSkills(activeSubTask, config) {
  // Sub-task override takes highest precedence
  if (activeSubTask && typeof activeSubTask.max_skills_override === 'number' &&
      Number.isInteger(activeSubTask.max_skills_override) &&
      activeSubTask.max_skills_override >= 0) {
    return activeSubTask.max_skills_override;
  }

  // Config value
  if (config && config.task_card && typeof config.task_card.max_skills_total === 'number') {
    return config.task_card.max_skills_total;
  }

  // Default
  return ROUNDTABLE_DEFAULTS.task_card.max_skills_total;
}

/**
 * Render a skill entry per delivery_type for the card text.
 *
 * delivery_type controls injection depth:
 * - context: full skill content injected (marked as [FULL])
 * - instruction: key rules injected (marked as [RULES])
 * - reference: pointer only (marked as [REF])
 *
 * @param {object} skill - Skill entry { id, source, deliveryType }
 * @returns {string} Formatted skill line
 */
function renderSkillLine(skill) {
  const typeLabel = skill.deliveryType === 'context' ? 'FULL'
    : skill.deliveryType === 'instruction' ? 'RULES'
    : 'REF';
  return `  ${skill.id} [${typeLabel}] (${skill.source})`;
}

/**
 * Render the composed task card as a text block.
 *
 * @param {object} template - Loaded task card template
 * @param {Array<object>} skills - Filtered and sorted skill list
 * @param {object} activeSubTask - Sub-task definition
 * @returns {string} Composed text block
 */
function renderTaskCard(template, skills, activeSubTask) {
  const lines = [];
  const subTaskId = template.sub_task || activeSubTask.id || 'UNKNOWN';

  lines.push(`--- TASK: ${subTaskId} ---`);

  // Description
  if (template.description) {
    lines.push(`Purpose: ${template.description}`);
  }

  // Skills section
  if (skills.length > 0) {
    lines.push('Skills:');
    for (const skill of skills) {
      lines.push(renderSkillLine(skill));
    }
  } else {
    lines.push('Skills: (none applicable)');
  }

  // Preferred tools
  const tools = template.preferred_tools || activeSubTask.preferred_tools || [];
  if (Array.isArray(tools) && tools.length > 0) {
    const toolNames = tools.map(t =>
      typeof t === 'string' ? t : (t.tool || t.name || String(t))
    );
    lines.push(`Tools: ${toolNames.join(', ')}`);
  }

  // Expected output shape
  const outputShape = template.expected_output || activeSubTask.expected_output;
  if (outputShape) {
    const shapeName = outputShape.shape || 'unstructured';
    lines.push(`Output: ${shapeName}`);
    if (outputShape.fields) {
      const fieldEntries = typeof outputShape.fields === 'object'
        ? Object.entries(outputShape.fields)
        : [];
      if (fieldEntries.length > 0) {
        const required = fieldEntries
          .filter(([, v]) => typeof v === 'object' && v.required)
          .map(([k]) => k);
        const optional = fieldEntries
          .filter(([, v]) => typeof v === 'object' && !v.required)
          .map(([k]) => k);

        if (required.length > 0) {
          lines.push(`  Required: ${required.join(', ')}`);
        }
        if (optional.length > 0) {
          lines.push(`  Optional: ${optional.join(', ')}`);
        }
      } else if (Array.isArray(outputShape.fields)) {
        lines.push(`  Fields: ${outputShape.fields.join(', ')}`);
      }
    }
  }

  // Completion marker
  const marker = template.completion_marker || activeSubTask.completion_marker;
  if (marker) {
    lines.push(`Completion: ${marker}`);
  }

  lines.push('--- END TASK CARD ---');

  // Enforce max lines budget
  if (lines.length > MAX_TOTAL_LINES) {
    return lines.slice(0, MAX_TOTAL_LINES - 1).concat(['--- END TASK CARD ---']).join('\n');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compose an inner affordance card for the active background sub-task.
 *
 * 1. Loads task card template from task-cards/ (shipped + override)
 * 2. Queries skill manifest for applicable skills (via injection-planner)
 * 3. Merges template skills with manifest skills, deduplicates
 * 4. Applies max_skills_total budget (sub-task override > config > default)
 * 5. Sorts: priority-based, shipped skills get small boost
 * 6. Renders per delivery_type (context/instruction/reference)
 * 7. Adds preferred tools + expected output shape
 *
 * @param {object} activeSubTask - Sub-task definition from state machine
 * @param {string} activeSubTask.id - Sub-task identifier (e.g., 'SCOPE_FRAMING')
 * @param {Array<object>} [activeSubTask.skill_ids] - Skill IDs from workflow definition
 * @param {Array<object>} [activeSubTask.preferred_tools] - Preferred tools
 * @param {object} [activeSubTask.expected_output] - Expected output shape
 * @param {string} [activeSubTask.completion_marker] - Completion signal
 * @param {number} [activeSubTask.max_skills_override] - Per-sub-task budget override
 * @param {object} [manifestContext={}] - Context for skill manifest querying
 * @param {string} [manifestContext.workflow] - Workflow type
 * @param {string} [manifestContext.phase] - Current phase
 * @param {string} [manifestContext.agent] - Current agent
 * @param {string} [manifestContext.projectRoot] - Project root path
 * @param {object} [config=null] - Roundtable config (from getRoundtableConfig). Auto-resolved if null.
 * @param {object} [options={}] - Additional options
 * @param {string} [options.shippedDir] - Override shipped task-cards dir
 * @param {string} [options.overrideDir] - User override task-cards dir
 * @returns {string} Composed task card text block (never null — fail-open returns minimal card)
 */
export function composeTaskCard(activeSubTask, manifestContext = {}, config = null, options = {}) {
  try {
    if (!activeSubTask || !activeSubTask.id) {
      return buildMinimalTaskCard('UNKNOWN');
    }

    const subTaskId = activeSubTask.id;
    const shippedDir = options.shippedDir || SHIPPED_TASK_CARDS_DIR;
    const overrideDir = options.overrideDir || null;

    // 1. Load task card template
    const template = loadTaskCardTemplate(subTaskId, shippedDir, overrideDir);

    // 2. Gather template-defined skills
    const templateSkills = (template && Array.isArray(template.skills)) ? template.skills : [];

    // 3. Query skill manifest for dynamically applicable skills
    let manifestSkills = [];
    try {
      const subTaskKey = subTaskId.toLowerCase().replace(/_/g, '-');
      const plan = computeInjectionPlan(
        manifestContext.workflow || 'analyze',
        manifestContext.phase || '01-requirements',
        manifestContext.agent || 'roundtable-analyst',
        {
          projectRoot: manifestContext.projectRoot,
          subTask: subTaskKey,
        }
      );
      manifestSkills = plan.merged || [];
    } catch {
      // Fail-open: manifest query failure does not block composition
      manifestSkills = [];
    }

    // 4. Merge, deduplicate, sort
    const allSkills = mergeAndSortSkills(templateSkills, manifestSkills);

    // 5. Apply max_skills_total budget
    const resolvedConfig = config || safeResolveConfig(manifestContext.projectRoot);
    const maxSkills = resolveMaxSkills(activeSubTask, resolvedConfig);
    const budgetedSkills = allSkills.slice(0, maxSkills);

    // 6. Render
    const effectiveTemplate = template || {
      sub_task: subTaskId,
      description: activeSubTask.description || null,
      skills: [],
      preferred_tools: activeSubTask.preferred_tools || [],
      expected_output: activeSubTask.expected_output || null,
      completion_marker: activeSubTask.completion_marker || null,
    };

    return renderTaskCard(effectiveTemplate, budgetedSkills, activeSubTask);
  } catch {
    // Fail-open (Article X): always return something usable
    return buildMinimalTaskCard(activeSubTask ? activeSubTask.id || 'UNKNOWN' : 'UNKNOWN');
  }
}

/**
 * Safely resolve roundtable config. Returns defaults on any failure.
 * @param {string} [projectRoot]
 * @returns {object}
 */
function safeResolveConfig(projectRoot) {
  try {
    return getRoundtableConfig(projectRoot);
  } catch {
    return { task_card: { ...ROUNDTABLE_DEFAULTS.task_card } };
  }
}
