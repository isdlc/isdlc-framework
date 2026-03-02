# Test Data Plan - BUG-0004: Orchestrator Overrides Conversational Opening

**Date:** 2026-02-15
**Scope:** Bug fix -- prompt content verification

---

## Test Data Requirements

This bug fix uses **file content assertions** (prompt verification pattern). No test fixtures, databases, mock servers, or generated data are required.

### Input Data

| Data Item | Source | Type |
|-----------|--------|------|
| Orchestrator content | `src/claude/agents/00-sdlc-orchestrator.md` | File read (string) |
| Requirements analyst content | `src/claude/agents/01-requirements-analyst.md` | File read (string, reference) |

### Assertion Patterns

#### Negative Patterns (must NOT appear in orchestrator)

| Pattern | Traces to |
|---------|-----------|
| `Your FIRST response must ONLY contain these 3 questions` | AC-1.1 |
| `What problem are you solving?` | AC-1.2 |
| `Who will use this?` | AC-1.2 |
| `How will you know this project succeeded?` | AC-1.2 |
| `ONLY ask the 3 questions` | AC-1.1 |

#### Positive Patterns (must appear in orchestrator)

| Pattern | Traces to |
|---------|-----------|
| `DEBATE_CONTEXT` | AC-1.3 |
| `50 words` or `> 50` | AC-1.4 |
| `Reflect` or `reflect` or `summary` or `understand` | AC-1.4 |
| `minimal` or `< 50` | AC-1.4 |
| `lens` or `lenses` | AC-1.5 |
| `organic` or `weave` or `natural` | AC-1.5 |
| `A/R/C` or `[A] Adjust`, `[R] Refine`, `[C] Continue` | AC-1.6 |

#### Cross-File Patterns (must appear in both files)

| Pattern | Files | Traces to |
|---------|-------|-----------|
| `DEBATE_CONTEXT` | Both | AC-2.1, AC-2.2 |
| `50 words` or `> 50` | Both | AC-2.1, AC-2.3 |
| `A/R/C` or menu items | Both | AC-2.1 |

#### Stability Patterns (must still appear in orchestrator)

| Pattern | Traces to |
|---------|-----------|
| `## 7.5 DEBATE LOOP ORCHESTRATION` | NFR-2 |
| `DEBATE_ROUTING:` | NFR-2 |
| `requirements-analyst` | NFR-2 |

### Data Generation Strategy

No data generation required. All test data is read directly from source files in the repository.

### Edge Cases

None applicable for file content verification.
