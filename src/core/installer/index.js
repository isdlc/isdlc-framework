/**
 * Core Installer Module — Provider-Neutral Installation Logic
 * =============================================================
 * REQ-0089: Provider-aware installer/updater/doctor/uninstaller
 *
 * Extracts shared installation logic that all providers need:
 * - installCore(projectRoot, options) — creates .isdlc/, state.json, BACKLOG.md, docs/
 * - updateCore(projectRoot, options) — updates shared core assets, preserves user state
 * - uninstallCore(projectRoot, options) — removes shared assets, preserves user artifacts
 * - doctorCore(projectRoot) — checks: .isdlc/ exists, state.json valid, constitution, backlog
 *
 * These functions are provider-neutral and do NOT touch .claude/ or any
 * provider-specific directory.
 *
 * @module src/core/installer
 */

import path from 'path';
import {
  exists,
  ensureDir,
  copyDir,
  copy,
  readFile,
  readJson,
  writeJson,
  writeFile,
  remove,
  isDirectory,
  isFile,
  readdir,
  getFrameworkDir,
  getPackageRoot,
} from '../../../lib/utils/fs-helpers.js';

// ---------------------------------------------------------------------------
// installCore
// ---------------------------------------------------------------------------

/**
 * Install core (provider-neutral) framework files into a project.
 *
 * Creates:
 * - .isdlc/ with state.json, phase directories, config, checklists, templates, scripts
 * - docs/ with requirements/, architecture/, design/, isdlc/ (constitution)
 * - BACKLOG.md at project root (if not existing)
 *
 * @param {string} projectRoot - Target project directory
 * @param {object} options - Installation options
 * @param {boolean} [options.force=false] - Skip confirmation prompts
 * @param {boolean} [options.dryRun=false] - Show what would change without making changes
 * @param {string} [options.projectName] - Project name (auto-detected if omitted)
 * @param {boolean} [options.isExistingProject=false] - Whether project has existing code
 * @param {string} [options.providerMode='claude-code'] - Provider mode for state.json
 * @returns {Promise<void>}
 */
export async function installCore(projectRoot, options = {}) {
  const {
    force = false,
    dryRun = false,
    projectName = path.basename(projectRoot),
    isExistingProject = false,
    providerMode = 'claude-code',
  } = options;

  const frameworkDir = getFrameworkDir();
  const isdlcSource = path.join(frameworkDir, 'isdlc');
  const isdlcTarget = path.join(projectRoot, '.isdlc');
  const docsTarget = path.join(projectRoot, 'docs');

  // --- .isdlc directory ---
  if (!dryRun) {
    await ensureDir(isdlcTarget);
  }

  // Phase directories
  const phases = [
    '01-requirements', '02-architecture', '03-design', '04-test-strategy',
    '05-implementation', '06-testing', '07-code-review', '08-validation',
    '09-cicd', '10-local-testing', '11-test-deploy', '12-production',
    '13-operations',
  ];

  for (const phase of phases) {
    if (!dryRun) {
      await ensureDir(path.join(isdlcTarget, 'phases', phase, 'artifacts'));
    }
  }

  // User workflows directory
  if (!dryRun) {
    await ensureDir(path.join(isdlcTarget, 'workflows'));
  }

  // Copy .isdlc framework directories (config, checklists, templates, scripts)
  for (const dir of ['config', 'checklists', 'templates', 'scripts']) {
    const src = path.join(isdlcSource, dir);
    if (await exists(src)) {
      if (!dryRun) {
        await copyDir(src, path.join(isdlcTarget, dir));
      }
    }
  }

  // Copy shell scripts from package root
  const packageRoot = getPackageRoot();
  const scriptsTarget = path.join(isdlcTarget, 'scripts');
  if (!dryRun) {
    await ensureDir(scriptsTarget);
  }
  for (const scriptName of ['uninstall.sh', 'update.sh', 'uninstall.ps1', 'update.ps1']) {
    const scriptSource = path.join(packageRoot, scriptName);
    if (await exists(scriptSource)) {
      if (!dryRun) {
        await copy(scriptSource, path.join(scriptsTarget, scriptName));
      }
    }
  }

  // Copy roundtable.yaml default (only if not already present)
  const roundtableSource = path.join(isdlcSource, 'config', 'roundtable.yaml');
  const roundtableTarget = path.join(isdlcTarget, 'roundtable.yaml');
  if (await exists(roundtableSource) && !(await exists(roundtableTarget))) {
    if (!dryRun) {
      await copy(roundtableSource, roundtableTarget);
    }
  }

  // --- docs/ directory ---
  if (!dryRun) {
    await ensureDir(path.join(docsTarget, 'requirements'));
    await ensureDir(path.join(docsTarget, 'architecture'));
    await ensureDir(path.join(docsTarget, 'design'));
    await ensureDir(path.join(docsTarget, 'isdlc', 'checklists'));
  }

  // Copy requirement templates
  const reqTemplatesSource = path.join(isdlcSource, 'templates', 'requirements');
  if (await exists(reqTemplatesSource)) {
    if (!dryRun) {
      await copyDir(reqTemplatesSource, path.join(docsTarget, 'requirements'));
    }
  }

  // Create docs README
  if (!dryRun) {
    await writeFile(path.join(docsTarget, 'README.md'), generateDocsReadme());
  }

  // Create constitution
  const constitutionTarget = path.join(docsTarget, 'isdlc', 'constitution.md');
  if (!dryRun) {
    await writeFile(constitutionTarget, generateConstitution(projectName));
  }

  // --- state.json ---
  const timestamp = new Date().toISOString();
  const state = generateState(projectName, isExistingProject, timestamp, providerMode);
  if (!dryRun) {
    await writeJson(path.join(isdlcTarget, 'state.json'), state);
  }

  // --- .codex/ directory (REQ-0138 FR-009) ---
  if (providerMode.includes('codex')) {
    const codexDir = path.join(projectRoot, '.codex');
    if (!dryRun) {
      await ensureDir(codexDir);
    }
  }

  // --- BACKLOG.md ---
  const backlogPath = path.join(projectRoot, 'BACKLOG.md');
  if (!(await exists(backlogPath))) {
    if (!dryRun) {
      await writeFile(backlogPath, generateBacklogMd());
    }
  }
}

// ---------------------------------------------------------------------------
// updateCore
// ---------------------------------------------------------------------------

/**
 * Update core (provider-neutral) framework files in an existing installation.
 *
 * Overwrites framework config, templates, checklists, scripts while
 * preserving state.json, user artifacts, and BACKLOG.md.
 *
 * @param {string} projectRoot - Target project directory
 * @param {object} options - Update options
 * @param {boolean} [options.force=false] - Skip confirmation
 * @param {boolean} [options.dryRun=false] - Show what would change
 * @returns {Promise<void>}
 */
export async function updateCore(projectRoot, options = {}) {
  const { dryRun = false } = options;

  const frameworkDir = getFrameworkDir();
  const isdlcSource = path.join(frameworkDir, 'isdlc');
  const isdlcTarget = path.join(projectRoot, '.isdlc');

  // Copy .isdlc framework directories (config, checklists, templates, scripts)
  for (const dir of ['config', 'checklists', 'templates', 'scripts']) {
    const src = path.join(isdlcSource, dir);
    if (await exists(src)) {
      if (!dryRun) {
        await copyDir(src, path.join(isdlcTarget, dir));
      }
    }
  }

  // Copy roundtable.yaml default (only if not already present)
  const roundtableSource = path.join(isdlcSource, 'config', 'roundtable.yaml');
  const roundtableTarget = path.join(isdlcTarget, 'roundtable.yaml');
  if (await exists(roundtableSource) && !(await exists(roundtableTarget))) {
    if (!dryRun) {
      await copy(roundtableSource, roundtableTarget);
    }
  }

  // Update state.json — bump framework_version, add history entry
  if (!dryRun) {
    const statePath = path.join(isdlcTarget, 'state.json');
    if (await exists(statePath)) {
      try {
        const state = await readJson(statePath);
        // Import version dynamically to avoid circular deps
        const packagePath = path.resolve(frameworkDir, '..', 'package.json');
        let newVersion = '0.1.0-alpha';
        try {
          const pkg = await readJson(packagePath);
          newVersion = pkg.version || newVersion;
        } catch { /* use default */ }

        state.framework_version = newVersion;
        if (!Array.isArray(state.history)) state.history = [];
        state.history.push({
          timestamp: new Date().toISOString(),
          agent: 'core-updater',
          action: `Core framework files updated to ${newVersion}`,
        });
        await writeJson(statePath, state);
      } catch {
        // Non-fatal: state.json update failure
      }
    }
  }
}

// ---------------------------------------------------------------------------
// uninstallCore
// ---------------------------------------------------------------------------

/**
 * Remove core (provider-neutral) framework files.
 *
 * Removes .isdlc/config, templates, scripts, installed-files.json, monorepo.json
 * while preserving state.json, BACKLOG.md, docs/, and all user artifacts.
 *
 * @param {string} projectRoot - Target project directory
 * @param {object} options - Uninstall options
 * @param {boolean} [options.force=false] - Skip confirmation
 * @param {boolean} [options.dryRun=false] - Show what would change
 * @param {boolean} [options.purgeAll=false] - Remove .isdlc/ entirely
 * @returns {Promise<void>}
 */
export async function uninstallCore(projectRoot, options = {}) {
  const { dryRun = false, purgeAll = false } = options;

  const isdlcDir = path.join(projectRoot, '.isdlc');
  const hasIsdlc = await isDirectory(isdlcDir);

  if (!hasIsdlc) return;

  if (purgeAll) {
    if (!dryRun) {
      await remove(isdlcDir);
    }
    return;
  }

  // Remove framework-only directories
  const frameworkDirs = ['config', 'templates', 'scripts'];
  for (const dir of frameworkDirs) {
    const dirPath = path.join(isdlcDir, dir);
    if (await isDirectory(dirPath)) {
      if (!dryRun) {
        await remove(dirPath);
      }
    }
  }

  // Remove framework-only files
  const frameworkFiles = ['installed-files.json', 'monorepo.json'];
  for (const file of frameworkFiles) {
    const filePath = path.join(isdlcDir, file);
    if (await exists(filePath)) {
      if (!dryRun) {
        await remove(filePath);
      }
    }
  }

  // Remove empty phase directories
  const phasesDir = path.join(isdlcDir, 'phases');
  if (await isDirectory(phasesDir)) {
    if (!dryRun) {
      const phases = await readdir(phasesDir);
      for (const phase of phases) {
        await removeEmptyDirRecursive(path.join(phasesDir, phase));
      }
      await removeEmptyDir(phasesDir);
    }
  }

  // Remove checklists directory if empty
  if (!dryRun) {
    await removeEmptyDirRecursive(path.join(isdlcDir, 'checklists'));
  }
}

// ---------------------------------------------------------------------------
// doctorCore
// ---------------------------------------------------------------------------

/**
 * Check core (provider-neutral) installation health.
 *
 * Returns a structured result instead of logging directly, so callers
 * can compose results from multiple providers.
 *
 * @param {string} projectRoot - Project directory
 * @returns {Promise<{healthy: boolean, issues: string[], warnings: string[], passed: string[]}>}
 */
export async function doctorCore(projectRoot) {
  const issues = [];
  const warnings = [];
  const passed = [];

  // Check 1: .isdlc/ directory exists
  const isdlcDir = path.join(projectRoot, '.isdlc');
  if (!(await isDirectory(isdlcDir))) {
    issues.push('.isdlc directory missing');
    return { healthy: false, issues, warnings, passed };
  }
  passed.push('.isdlc directory exists');

  // Check 2: state.json exists and is valid
  const statePath = path.join(isdlcDir, 'state.json');
  if (!(await exists(statePath))) {
    issues.push('state.json missing');
  } else {
    try {
      const state = await readJson(statePath);
      if (state.framework_version && state.project && state.phases) {
        passed.push('state.json valid');
      } else {
        warnings.push('state.json incomplete');
      }
    } catch {
      issues.push('state.json invalid JSON');
    }
  }

  // Check 3: Constitution exists
  const constitutionPath = path.join(projectRoot, 'docs', 'isdlc', 'constitution.md');
  if (!(await exists(constitutionPath))) {
    warnings.push('constitution not found at docs/isdlc/constitution.md');
  } else {
    const content = await readFile(constitutionPath, 'utf8');
    if (content.includes('STARTER_TEMPLATE')) {
      warnings.push('constitution needs customization (run /discover)');
    } else {
      passed.push('constitution customized');
    }
  }

  // Check 4: BACKLOG.md exists
  const backlogPath = path.join(projectRoot, 'BACKLOG.md');
  if (await exists(backlogPath)) {
    passed.push('BACKLOG.md exists');
  } else {
    warnings.push('BACKLOG.md not found');
  }

  return {
    healthy: issues.length === 0,
    issues,
    warnings,
    passed,
  };
}

// ---------------------------------------------------------------------------
// Helpers (private)
// ---------------------------------------------------------------------------

async function removeEmptyDir(dirPath) {
  if (!(await isDirectory(dirPath))) return;
  const entries = await readdir(dirPath);
  if (entries.length === 0) {
    await remove(dirPath);
  }
}

async function removeEmptyDirRecursive(dirPath) {
  if (!(await isDirectory(dirPath))) return;
  const entries = await readdir(dirPath);
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry);
    if (await isDirectory(fullPath)) {
      await removeEmptyDirRecursive(fullPath);
    }
  }
  const remaining = await readdir(dirPath);
  if (remaining.length === 0) {
    await remove(dirPath);
  }
}

function generateBacklogMd() {
  return `# Project Backlog

> Backlog and completed items are tracked here.
> This file is NOT loaded into every conversation -- reference it explicitly when needed.

## Open

## Completed
`;
}

function generateDocsReadme() {
  return `# Project Documentation

This folder contains all project documentation following the iSDLC framework.

## Structure

\`\`\`
docs/
\u251C\u2500\u2500 isdlc/              # iSDLC-generated documents
\u2502   \u251C\u2500\u2500 constitution.md # Project constitution
\u2502   \u251C\u2500\u2500 tasks.md        # Task plan
\u2502   \u2514\u2500\u2500 checklists/     # Gate checklist responses
\u251C\u2500\u2500 requirements/       # Requirements specifications and user stories
\u251C\u2500\u2500 architecture/       # Architecture decisions and system design
\u251C\u2500\u2500 design/            # Detailed design documents
\u2514\u2500\u2500 README.md          # This file
\`\`\`

## Getting Started

1. Start with requirements in \`requirements/\`
2. Document architecture decisions in \`architecture/\`
3. Add detailed designs in \`design/\`

See \`.isdlc/state.json\` for current project phase and progress.
`;
}

function generateConstitution(projectName) {
  const date = new Date().toISOString().split('T')[0];

  return `# Project Constitution - ${projectName}

<!-- CONSTITUTION_STATUS: STARTER_TEMPLATE -->
<!-- This marker indicates this constitution needs customization -->
<!-- Run /discover to customize -->

**Created**: ${date}
**Status**: \u26A0\uFE0F NEEDS CUSTOMIZATION

---

## \u26A0\uFE0F CUSTOMIZATION REQUIRED

This is a **starter constitution** auto-generated during framework installation.
It contains generic articles that may not match your project's specific needs.

**To customize this constitution:**
Run \`/discover\` to analyze your project and generate tailored articles interactively.

**This constitution will be treated as a TEMPLATE until customized.**

---

## Preamble

This constitution establishes the fundamental principles governing all development activities within the **${projectName}** project. These articles guide all SDLC phases and all agent interactions.

All agents (01-13) and the SDLC Orchestrator (00) will read and enforce these principles throughout the project lifecycle.

---

## Articles (Generic - Customize for Your Project)

### Article I: Specification Primacy

**Principle**: Specifications are the source of truth. Code serves specifications.

**Requirements**:
1. Code MUST implement specifications exactly as defined
2. Any deviation from specifications MUST be documented and justified
3. Specifications MUST be updated before code changes

---

### Article II: Test-First Development

**Principle**: Tests MUST be written before implementation.

**Requirements**:
1. Test cases MUST be designed before implementation
2. Unit tests MUST be written before production code
3. Code without tests CANNOT pass quality gates

**Coverage Thresholds**:
- Unit test coverage: \u226580%
- Integration test coverage: \u226570%

---

### Article III: Security by Design

**Principle**: Security considerations MUST precede implementation decisions.

**Requirements**:
1. No secrets in code - use environment variables
2. All inputs validated, all outputs sanitized
3. Critical/High vulnerabilities MUST be resolved before deployment

---

### Article IV: Simplicity First

**Principle**: Implement the simplest solution that satisfies requirements.

**Requirements**:
1. Avoid over-engineering and premature optimization
2. YAGNI (You Aren't Gonna Need It) - no speculative features
3. Complexity MUST be justified by requirements

---

### Article V: Quality Gate Integrity

**Principle**: Quality gates cannot be skipped. Failures require remediation.

**Requirements**:
1. All quality gates MUST be validated before phase advancement
2. Gate failures MUST be remediated (cannot be waived)
3. Gate fails twice \u2192 Escalate to human

---

## Customization Notes

Review and modify these articles based on your project's specific needs:
- Add compliance requirements (HIPAA, GDPR, PCI-DSS)
- Add performance SLAs
- Add accessibility requirements
- Adjust coverage thresholds
- Add domain-specific constraints

---

**Constitution Version**: 1.0.0
**Framework Version**: 0.1.0-alpha
`;
}

function generateState(projectName, isExistingProject, timestamp, providerMode) {
  return {
    framework_version: '0.1.0-alpha',
    project: {
      name: projectName,
      created: timestamp,
      description: '',
      is_new_project: !isExistingProject,
    },
    provider_selection: providerMode || 'claude-code',
    complexity_assessment: {
      level: null,
      track: 'auto',
      assessed_at: timestamp,
      assessed_by: 'manual',
      dimensions: {
        architectural: null, security: null, testing: null,
        deployment: null, team: null, timeline: null,
      },
    },
    workflow: {
      track: 'auto',
      track_name: 'Orchestrator-managed',
      phases_required: null,
      phases_optional: null,
      phases_skipped: null,
    },
    constitution: {
      enforced: true,
      path: 'docs/isdlc/constitution.md',
      validated_at: null,
    },
    autonomous_iteration: {
      enabled: true,
      max_iterations: 10,
      timeout_per_iteration_minutes: 5,
      circuit_breaker_threshold: 3,
    },
    skill_enforcement: {
      enabled: true,
      mode: 'observe',
      fail_behavior: 'allow',
      manifest_version: '2.0.0',
    },
    cloud_configuration: {
      provider: 'undecided',
      configured_at: null,
      credentials_validated: false,
      aws: null, gcp: null, azure: null,
      deployment: {
        staging_enabled: false,
        production_enabled: false,
        workflow_endpoint: '10-local-testing',
      },
    },
    iteration_enforcement: { enabled: true },
    code_review: { enabled: false, team_size: 1 },
    skill_usage_log: [],
    active_workflow: null,
    workflow_history: [],
    counters: { next_req_id: 1, next_bug_id: 1 },
    current_phase: '01-requirements',
    phases: {
      '01-requirements': { status: 'pending', started: null, completed: null, gate_passed: null, artifacts: [] },
      '02-architecture': { status: 'pending', started: null, completed: null, gate_passed: null, artifacts: [] },
      '03-design': { status: 'pending', started: null, completed: null, gate_passed: null, artifacts: [] },
      '04-test-strategy': { status: 'pending', started: null, completed: null, gate_passed: null, artifacts: [] },
      '05-implementation': { status: 'pending', started: null, completed: null, gate_passed: null, artifacts: [], iteration_tracking: { current: 0, max: null, history: [], final_status: null } },
      '06-testing': { status: 'pending', started: null, completed: null, gate_passed: null, artifacts: [], iteration_tracking: { current: 0, max: null, history: [], final_status: null } },
      '07-code-review': { status: 'pending', started: null, completed: null, gate_passed: null, artifacts: [] },
      '08-validation': { status: 'pending', started: null, completed: null, gate_passed: null, artifacts: [] },
      '09-cicd': { status: 'pending', started: null, completed: null, gate_passed: null, artifacts: [] },
      '10-local-testing': { status: 'pending', started: null, completed: null, gate_passed: null, artifacts: [] },
      '11-test-deploy': { status: 'pending', started: null, completed: null, gate_passed: null, artifacts: [] },
      '12-production': { status: 'pending', started: null, completed: null, gate_passed: null, artifacts: [] },
      '13-operations': { status: 'pending', started: null, completed: null, gate_passed: null, artifacts: [] },
    },
    blockers: [],
    active_agent: null,
    history: [
      { timestamp, agent: 'npm-installer', action: 'Project initialized with iSDLC framework (npm)' },
    ],
  };
}

export default { installCore, updateCore, uninstallCore, doctorCore };
