# Module Design: REQ-0106 — Project Skill Distillation

## skill-distillation.js
Frozen config: source priority, stale detection rules, user-owned field list.
Frozen reconciliation rules defining merge behavior per source type.

Exports: getDistillationConfig(), getReconciliationRules(), SOURCE_PRIORITY

~50 lines.
