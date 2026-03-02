# Requirements Summary: Improve Search Capabilities for Claude Effectiveness

**Accepted**: 2026-03-02

## Problem

The iSDLC framework relies entirely on Grep/Glob for codebase search, which degrades agent effectiveness at scale -- no structure awareness, no persistent index, keyword noise, no semantic understanding.

## Users

- **P1: iSDLC Framework Developers** -- internal contributors, 526+ files in src/claude/, noise from common identifiers
- **P2: iSDLC End Users (Large Codebase)** -- 10K-500K files, analysis workflows hit scaling walls
- **P3: iSDLC End Users (Small Codebase)** -- should not be disrupted, Grep/Glob adequate

## Functional Requirements (13 total)

| ID | Title | Priority | Confidence |
|----|-------|----------|------------|
| FR-001 | Search Abstraction Layer | Must Have | High |
| FR-002 | Search Backend Registry | Must Have | High |
| FR-003 | Search Capability Detection | Must Have | High |
| FR-004 | Search Tool Installation | Must Have | High |
| FR-005 | MCP Server Configuration | Must Have | High |
| FR-006 | Graceful Degradation with Notification | Must Have | High |
| FR-007 | Structural Search Backend (ast-grep) | Should Have | Medium |
| FR-008 | Enhanced Lexical Search Backend (Probe) | Should Have | Medium |
| FR-009 | Agent Migration Path | Should Have | Medium |
| FR-010 | Search Configuration Management | Could Have | Medium |
| FR-011 | Result Ranking and Token Budget | Should Have | Medium |
| FR-012 | Semantic Search Backend (Phase 2) | Won't Have | Low |
| FR-013 | Indexed Search Backend (Phase 2) | Won't Have | Low |

## Key Design Principles

- Auto-detect with opt-out
- Local-first, cloud-optional
- Inform but never block
- Graceful degradation to Grep/Glob baseline
- Incremental agent migration
