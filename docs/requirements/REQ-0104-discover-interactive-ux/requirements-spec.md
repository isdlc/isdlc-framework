# Requirements Specification: REQ-0104 — Discover Interactive UX

## 1. Business Context
Discover presents menus and walkthroughs (first-time vs returning, Chat/Explore mode). These UX flows need to be defined as provider-neutral data so both Claude and Codex can render them.

**Source**: GitHub #168 (CODEX-035)

## 2. Functional Requirements

### FR-001: Menu Definitions
**Confidence**: High
- AC-001-01: first_time_menu with 3 options (New Project, Existing Analysis, Chat/Explore)
- AC-001-02: returning_menu with options (Re-run, Incremental, Deep, Chat/Explore)
- AC-001-03: Each option has: id, label, description, maps_to_mode

### FR-002: Walkthrough Step Definitions
**Confidence**: High
- AC-002-01: Each mode has an ordered step sequence
- AC-002-02: Steps define: id, label, agent_group, optional (bool), review_gate (bool)

### FR-003: Chat/Explore Disposition
**Confidence**: High
- AC-003-01: Chat/Explore mode defined as a non-discover option (no agents, no state changes)

## 3. Out of Scope
Rendering menus (provider-specific). Modifying discover command.

## 4. MoSCoW
All Must Have.
