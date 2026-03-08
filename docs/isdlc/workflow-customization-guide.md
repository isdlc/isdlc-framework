# Workflow Customization Guide — Sizing, Custom Workflows, and Phase Sequences

iSDLC ships with four workflow types (feature, fix, upgrade, test). This guide covers how to tune sizing, define your own workflows, and replace built-in phase sequences.

## How Workflows Work

Each workflow defines a fixed phase sequence. The AI cannot invent extra steps or skip phases. Hooks enforce the sequence at runtime.

### Built-in Workflows

| Workflow | Phases | Use case |
|----------|--------|----------|
| **Feature** | Requirements → Impact Analysis → Architecture → Design → Test Strategy → Implementation → Quality Loop → Code Review | New functionality |
| **Fix** | Requirements → Root Cause Tracing → Test Strategy → Implementation → Quality Loop → Code Review | Bug fixes (TDD: failing test first) |
| **Upgrade** | Analysis & Planning → Execute & Test → Code Review | Dependency/runtime upgrades |
| **Test** | Test Strategy → Implementation → Quality Loop → Code Review | Generate tests for existing code |

Workflow definitions live in `src/claude/hooks/config/workflows.json`.

## Adaptive Sizing

Workflows adapt based on estimated scope. During the quick scan phase, the framework estimates how many files will be affected and selects a tier:

| Tier | File count | What happens |
|------|-----------|--------------|
| **Light** | 1-5 files | Architecture and design phases skipped |
| **Standard** | 6-20 files | Full phase sequence |
| **Epic** | 20+ files | Full sequence with extended budgets |

### Sizing Thresholds

Configure in `workflows.json` under each workflow's `sizing` section:

```json
{
  "sizing": {
    "enabled": true,
    "thresholds": {
      "light_max_files": 5,
      "epic_min_files": 20
    },
    "light_skip_phases": ["03-architecture", "04-design"],
    "risk_override": {
      "high_risk_forces_standard_minimum": true
    }
  }
}
```

- `light_max_files`: changes with fewer files than this get the light treatment
- `epic_min_files`: changes with more files than this get extended budgets
- `light_skip_phases`: which phases to skip for light features
- `risk_override`: high-risk changes always get at least standard treatment

### Performance Budgets

Each tier has time and iteration budgets:

```json
{
  "performance_budgets": {
    "light": {
      "max_total_minutes": 30,
      "max_phase_minutes": 10,
      "max_debate_rounds": 0,
      "max_fan_out_chunks": 1
    },
    "standard": {
      "max_total_minutes": 90,
      "max_phase_minutes": 25,
      "max_debate_rounds": 2,
      "max_fan_out_chunks": 4
    },
    "epic": {
      "max_total_minutes": 180,
      "max_phase_minutes": 40,
      "max_debate_rounds": 3,
      "max_fan_out_chunks": 8
    }
  }
}
```

### Triggering Sizing

Sizing triggers from natural language or flags:

```
"quick fix for the typo"     → light (signal word "quick")
"build the payment system"   → standard (default)
/isdlc feature -light "..."  → light (explicit flag)
```

## Defining Custom Workflows

Create your own workflow by adding an entry to `workflows.json`:

```json
{
  "spike": {
    "label": "Technical Spike",
    "command": "/isdlc spike",
    "description": "Time-boxed investigation with findings report",
    "phases": [
      "01-requirements",
      "02-impact-analysis",
      "08-code-review"
    ],
    "gate_mode": "permissive",
    "agent_modifiers": {
      "01-requirements": {
        "scope": "spike",
        "artifact_prefix": "SPIKE"
      }
    },
    "requires_branch": false
  }
}
```

### Key Fields

| Field | Purpose |
|-------|---------|
| `phases` | Ordered array of phase IDs — defines the exact sequence |
| `gate_mode` | `strict` (all gates enforced) or `permissive` (lighter enforcement) |
| `agent_modifiers` | Per-phase configuration passed to agents |
| `requires_branch` | Whether to create a feature branch |
| `sizing` | Optional — enable adaptive sizing with thresholds |
| `options` | CLI flags and interactive prompts |

### Example: Hotfix Workflow

A minimal workflow for production emergencies:

```json
{
  "hotfix": {
    "label": "Production Hotfix",
    "command": "/isdlc hotfix",
    "description": "Emergency fix with minimal ceremony",
    "phases": [
      "06-implementation",
      "16-quality-loop"
    ],
    "gate_mode": "strict",
    "agent_modifiers": {
      "06-implementation": {
        "require_failing_test_first": true
      }
    },
    "requires_branch": true
  }
}
```

### Example: UI Feature Workflow

A workflow that adds UI-specific design phases:

```json
{
  "ui-feature": {
    "label": "UI Feature",
    "command": "/isdlc ui-feature",
    "description": "Feature with UI/UX design emphasis",
    "phases": [
      "01-requirements",
      "00-quick-scan",
      "04-design",
      "05-test-strategy",
      "06-implementation",
      "16-quality-loop",
      "08-code-review"
    ],
    "gate_mode": "strict",
    "agent_modifiers": {
      "04-design": {
        "scope": "ui-focused",
        "require_wireframes": true
      }
    },
    "requires_branch": true
  }
}
```

## Replacing Built-in Sequences

To change how a built-in workflow operates, edit its entry in `workflows.json` directly:

- **Add phases**: Insert phase IDs into the `phases` array
- **Remove phases**: Delete phase IDs (hooks enforce whatever sequence remains)
- **Reorder phases**: Change the array order (hooks enforce the new sequence)
- **Change gate mode**: Switch between `strict` and `permissive`

The framework enforces whatever sequence you define — it doesn't hardcode the built-in sequences.

## Workflow Rules

These rules apply to all workflows (built-in and custom):

```json
{
  "rules": {
    "no_halfway_entry": true,
    "no_agent_phase_skipping": true,
    "single_active_workflow_per_project": true,
    "require_cancellation_reason": true
  }
}
```

- **No halfway entry**: Workflows must start from phase 1
- **No skipping**: Agents cannot skip phases at runtime
- **Single active**: Only one workflow runs at a time per project
- **Cancellation reason**: Aborting a workflow requires documenting why

## Reference

- [ARCHITECTURE.md](../ARCHITECTURE.md) — system architecture and phase flow
- [HOOKS.md](../HOOKS.md) — hooks that enforce workflow sequences
- [Quality Gates Guide](quality-gates-guide.md) — gate enforcement per phase
- [Hackability Roadmap](hackability-roadmap.md) — what's coming next
