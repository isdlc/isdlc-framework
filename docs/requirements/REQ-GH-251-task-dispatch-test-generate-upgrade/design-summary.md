# Design Summary: GH-251 Track 1

Three change areas: (1) isdlc.md handler — precondition gate (~20 lines) + artifact folder creation, (2) 04-test-design-engineer.md — new TEST-GENERATE MODE section (~60 lines) covering scaffold scan, AC-RE extraction, unit/system classification, tasks.md generation with tier ordering, and standard artifact output, (3) Codex projection bundle — new file mirroring Claude path with sequential dispatch.

**Blast radius**: 4 files modified (isdlc.md, 04-test-design-engineer.md, workflows.json, Codex projection). Zero changes to core JS modules (task-dispatcher.js, task-reader.js, task-validator.js) or discover/hooks infrastructure.
