# ADR-0002: Per-File Loop vs Per-Artifact Loop for Implementation Review

## Status

Accepted

## Context

Phase 06 (implementation) produces multiple individual files (production code, test files, configuration). The existing debate pattern for Phases 01/03/04 uses a per-artifact loop: the Creator produces ALL phase artifacts, then the Critic reviews them as a batch, then the Refiner fixes findings across all artifacts in one pass. This works for requirements/architecture/design because those artifacts are interdependent and benefit from holistic review.

For implementation code, each file is relatively independent and benefits from immediate review while context is hot. The current workflow writes ALL code in Phase 06, then cold-reviews in Phase 16/08 -- adding 15-30 minutes of context-reconstruction overhead per workflow.

## Decision

Use a **per-file** loop for Phase 06: the Writer produces one file, the Reviewer reviews that specific file, and the Updater fixes that specific file before the Writer proceeds to the next file. Each file goes through max 3 Reviewer-Updater cycles independently.

## Consequences

**Positive:**
- Hot context: review happens immediately after writing, while the Writer's understanding is fresh
- Isolated failures: a problem in one file does not block review of other files
- Progressive quality: each file is clean before the next file is written, so later files benefit from a cleaner codebase
- Reduced Phase 16/08 scope: batch-level checks (test suite, coverage, SAST) become the only work in Phase 16, while Phase 08 focuses on architecture/business logic coherence
- Bounded iteration per file: max 3 cycles prevents runaway on any single file

**Negative:**
- More orchestrator delegation overhead: 3 Task delegations per file (Writer/Reviewer/Updater) vs 3 per-round for the whole artifact set
- Cannot detect cross-file issues during per-file review (e.g., inconsistent interfaces between modules) -- these are caught in Phase 16/08
- Writer must produce files sequentially (no parallel file writing), which may be slower for large implementations

## Alternatives Considered

**1. Per-artifact loop (same as Phases 01/03/04):**
Rejected -- code files are reviewed cold after all are written. This loses the context advantage and replicates the current Phase 16/08 bottleneck. The whole point of REQ-0017 is hot review per file.

**2. Batch review with diff-based cycle (review all files, fix all findings, re-review):**
Rejected -- same cold-context problem as per-artifact. Additionally, the Updater fixing 20 findings across 10 files in one pass is error-prone compared to fixing 2-3 findings in one file.

**3. Parallel per-file review (write multiple files, review them in parallel):**
Rejected -- Claude Code Task tool is sequential. Parallel review would require multiple concurrent agents, which is not supported. Sequential per-file is the pragmatic choice.

## Requirement Traces

- FR-003 (Per-file loop, 7 ACs): Defines the per-file loop protocol
- AC-003-01: "orchestrator MUST delegate to the Reviewer for that specific file before the Writer proceeds to the next file"
- AC-003-07: "files MUST be processed in task plan order"
- NFR-001: Performance -- <=30s overhead per file; offset by reduced Phase 16+08 time
