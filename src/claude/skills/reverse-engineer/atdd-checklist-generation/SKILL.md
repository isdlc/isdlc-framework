---
name: atdd-checklist-generation
description: Generate ATDD-compatible checklists from reverse-engineered AC
skill_id: RE-301
owner: atdd-bridge
collaborators: []
project: sdlc-framework
version: 1.0.0
when_to_use: Preparing reverse-engineered AC for ATDD workflow
dependencies: [RE-201, RE-202]
---

# ATDD Checklist Generation

## Purpose
Generate ATDD checklists from reverse-engineered acceptance criteria, formatted to be compatible with the `/isdlc build` workflow (ATDD is the default behavior per GH-216, configurable via `atdd.*` in `.isdlc/config.json`). This enables migration from captured behavior to test-driven development.

## When to Use
- When `atdd.enabled: true` in `.isdlc/config.json` (default)
- After artifact integration (R3) completes
- When preparing for ATDD migration

## Prerequisites
- Traceability matrix from R3
- Tagged AC files
- Characterization tests with AC references

## Process

### Step 1: Group AC by Domain
```
For each domain in traceability matrix:
- Collect all AC
- Sort by priority (P0 first)
- Include test references
```

### Step 2: Format for ATDD
```json
{
  "version": "1.0.0",
  "domain": "{domain}",
  "source": "reverse-engineer",
  "acceptance_criteria": [
    {
      "ac_id": "AC-RE-001",
      "title": "{title}",
      "type": "captured_behavior",
      "status": "skip",
      "priority": "P0",
      "given": ["..."],
      "when": ["..."],
      "then": ["..."],
      "test_file": "{path}",
      "human_reviewed": false
    }
  ]
}
```

### Step 3: Add Coverage Summary
```json
{
  "coverage_summary": {
    "total_ac": 12,
    "tests_passing": 0,
    "tests_skipped": 12,
    "by_priority": {
      "P0": { "total": 3, "passing": 0, "skipped": 3 }
    }
  }
}
```

### Step 4: Add Migration Metadata
```json
{
  "migration_status": {
    "ready_for_atdd": true,
    "human_review_required": true,
    "next_step": "/isdlc build 'Migrate {domain}'"
  }
}
```

### Step 5: Write Checklist Files
```
Output: docs/isdlc/atdd-checklist-{domain}.json
One file per domain
Compatible with ATDD workflow loader
```

## Inputs
| Input | Type | Required | Description |
|-------|------|----------|-------------|
| traceability_matrix | File | Yes | From R3 |
| ac_files | Array | Yes | Domain AC files |
| test_files | Array | Yes | Characterization tests |

## Outputs
| Output | Type | Description |
|--------|------|-------------|
| checklist_files | Array | One per domain |
| summary | Object | Overall statistics |

## Project-Specific Considerations
- Checklist format must match ATDD workflow expectations
- Priority mapping should align with project conventions
- Large domains may need sub-checklists
- Consider incremental migration for large projects

## Integration Points
- **Traceability Matrix (RE-202)**: Source of AC-test mappings
- **AC Behavior Tagging (RE-302)**: Updates AC with metadata
- **Test Design Engineer (04)**: Validates ATDD format
- **Software Developer (05)**: Consumes checklists in ATDD mode

## Validation
- All AC included in checklists
- Format compatible with ATDD workflow
- Priorities correctly assigned
- Test references valid
