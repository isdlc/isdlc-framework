# Requirements Summary: GH-251 Track 1

6 functional requirements (all Must Have) extending task-level dispatch to the `/isdlc test generate` workflow. Core flow: precondition gate requiring `/discover` scaffolds → artifact folder creation → Phase 05 scaffold-to-tasks generation with unit/system tier ordering → Phase 06 dispatch via existing infrastructure. Dual-provider support (Claude + Codex). No changes to task-dispatcher.js or task-reader.js.

**Key decisions**: `/discover` is a hard precondition (no from-scratch path). Phase 05 classifies scaffolds as unit/system by content analysis. One scaffold = one task. Unit tasks execute before system tasks via `blocked_by` edges.
