# Data Flow Design: Multi-Agent Design Team

**Feature:** REQ-0016-multi-agent-design-team
**Phase:** 04-design
**Created:** 2026-02-15
**Traces:** FR-001..FR-007, NFR-001..NFR-004

---

## 1. Phase 04 Design Debate Data Flow (Concrete Instance)

This shows the specific data items that flow through the debate loop when
`current_phase = "04-design"`. The generalized phase-agnostic debate loop
data flow was documented in REQ-0015; this diagram instantiates it for
Phase 04's specific artifacts and agents.

```mermaid
sequenceDiagram
    participant User
    participant CLI as isdlc.md
    participant Orch as Orchestrator
    participant SD as System Designer<br/>(Creator)
    participant DC as Design Critic
    participant DR as Design Refiner
    participant FS as File System<br/>(Artifact Folder)

    User->>CLI: /isdlc feature "description" (standard)
    CLI->>Orch: FLAGS: {debate: implied by standard}<br/>Feature description

    Note over Orch: resolveDebateMode() = true<br/>current_phase = "04-design"<br/>lookup DEBATE_ROUTING -> found

    Orch->>FS: Write state.json: debate_state = {round: 1, phase: "04-design"}

    rect rgb(230, 245, 255)
        Note over SD: Round 1 - Creator
        Orch->>SD: DEBATE_CONTEXT: {mode: creator, round: 1}<br/>Feature description + architecture context
        SD->>FS: Write interface-spec.yaml (Round 1 Draft + Self-Assessment)
        SD->>FS: Write module-designs/*.md
        SD->>FS: Write error-taxonomy.md
        SD->>FS: Write validation-rules.json
        SD-->>Orch: "Round 1 design artifacts produced."
    end

    Orch->>FS: Check: interface-spec.yaml exists? YES

    rect rgb(255, 240, 240)
        Note over DC: Round 1 - Critic
        Orch->>DC: DEBATE_CONTEXT: {round: 1}<br/>Paths to all 4 artifact types
        Note over DC: Detect interface type<br/>Run 8 mandatory checks (DC-01..DC-08)<br/>+ 5 constitutional checks<br/>+ compute design metrics
        DC->>FS: Write round-1-critique.md
        DC-->>Orch: Critique complete
    end

    Orch->>FS: Read round-1-critique.md -> Summary table
    Note over Orch: Parse: BLOCKING = 4, WARNING = 2<br/>4 > 0, round 1 < 3 -> continue

    Orch->>FS: Update state.json: rounds_history[0] = {round: 1, blocking: 4, warnings: 2, action: "refine"}

    rect rgb(240, 255, 240)
        Note over DR: Round 1 - Refiner
        Orch->>DR: DEBATE_CONTEXT: {round: 1}<br/>All artifact paths + round-1-critique.md
        Note over DR: Addresses 4 BLOCKING findings<br/>Applies fix strategies (DC-01, DC-02, DC-04, DC-05)<br/>Documents changes
        DR->>FS: Update interface-spec.yaml (adds error responses, idempotency keys)
        DR->>FS: Update module-designs/ (unifies naming patterns)
        DR->>FS: Update validation-rules.json (adds boundary constraints)
        DR-->>Orch: Refinement complete
    end

    Orch->>FS: Update state.json: round = 2

    rect rgb(255, 240, 240)
        Note over DC: Round 2 - Critic
        Orch->>DC: DEBATE_CONTEXT: {round: 2}<br/>Paths to updated artifacts
        Note over DC: Re-checks all 8 categories<br/>Previous BLOCKING items resolved
        DC->>FS: Write round-2-critique.md
        DC-->>Orch: Critique complete
    end

    Orch->>FS: Read round-2-critique.md -> Summary table
    Note over Orch: Parse: BLOCKING = 0, WARNING = 1<br/>0 = CONVERGED

    Orch->>FS: Update state.json: converged = true
    Orch->>FS: Write debate-summary.md<br/>(rounds: 2, converged: true,<br/>API Endpoint Count: 5,<br/>Validation Rule Count: 24,<br/>Error Code Count: 18,<br/>Module Count: 4,<br/>Pattern Consistency: 100/100)

    Orch-->>User: Phase 04 complete. Debate converged in 2 rounds.
```

---

## 2. Data Transformation Map

This table documents every data transformation that occurs during the Phase 04
debate loop, mapping input data to output data for each agent.

### 2.1 Creator (System Designer) Transformations

| Input | Transformation | Output |
|-------|---------------|--------|
| Feature description + architecture-overview.md | Design interfaces, define contracts | interface-spec.yaml (or openapi.yaml) |
| Feature description + architecture-overview.md | Decompose into modules, define responsibilities | module-designs/*.md |
| Feature description + architecture-overview.md | Define error codes, categories, handling | error-taxonomy.md |
| Feature description + architecture-overview.md | Define input validation rules | validation-rules.json |
| DEBATE_CONTEXT.round | Label artifacts with round number | "Round {N} Draft" in metadata |
| DEBATE_CONTEXT.mode=creator | Generate self-assessment | Self-Assessment section in primary design artifact |

### 2.2 Critic (Design Critic) Transformations

| Input | Transformation | Output |
|-------|---------------|--------|
| interface-spec.yaml / openapi.yaml | Check API completeness, idempotency, data flow | B-NNN/W-NNN findings for DC-01, DC-05, DC-08 |
| module-designs/ | Check consistency, overlap, boundaries | B-NNN/W-NNN findings for DC-02, DC-03 |
| validation-rules.json | Check boundary constraints, completeness | B-NNN/W-NNN findings for DC-04 |
| error-taxonomy.md | Check error code coverage, status mapping | B-NNN/W-NNN findings for DC-07 |
| wireframes (if present) | Check accessibility compliance | B-NNN/W-NNN findings for DC-06 |
| requirements-spec.md | Cross-reference designs to requirements | Findings for Article I, VII |
| All design artifacts | Count endpoints, rules, codes, modules | 5 design metrics in Summary |
| All findings | Aggregate counts | Summary table (Total, BLOCKING, WARNING) |

### 2.3 Refiner (Design Refiner) Transformations

| Input | Transformation | Output |
|-------|---------------|--------|
| B-NNN (DC-01: Incomplete specs) | Add missing schemas, error responses, parameters | Updated interface-spec.yaml |
| B-NNN (DC-02: Inconsistent patterns) | Unify naming, error handling, response shapes | Updated module-designs/ |
| B-NNN (DC-03: Module overlap) | Clarify boundaries, explicit responsibility | Updated module-designs/ |
| B-NNN (DC-04: Validation gaps) | Add min/max, length limits, enum values | Updated validation-rules.json |
| B-NNN (DC-05: Missing idempotency) | Add idempotency keys, retry semantics | Updated interface-spec.yaml |
| B-NNN (DC-06: Accessibility) | Add ARIA labels, contrast, keyboard nav | Updated wireframes/component-specs |
| B-NNN (DC-07: Error taxonomy holes) | Add codes, status mapping, retry guidance | Updated error-taxonomy.md |
| B-NNN (DC-08: Data flow bottlenecks) | Add caching, pagination, async patterns | Updated module-designs/ |
| W-NNN (any) | Fix if straightforward, else [NEEDS CLARIFICATION] | Updated target artifact |
| All addressed findings | Tabulate changes | Changes section appended to primary artifact |

### 2.4 Orchestrator Transformations

| Input | Transformation | Output |
|-------|---------------|--------|
| FLAGS + sizing | resolveDebateMode() | debate_mode: boolean |
| current_phase = "04-design" | DEBATE_ROUTING lookup | routing: {creator: 03-system-designer.md, critic: 03-design-critic.md, refiner: 03-design-refiner.md, artifacts: [...], critical_artifact: interface-spec.yaml} |
| round-N-critique.md Summary | Parse BLOCKING integer from table | blocking_count: integer |
| blocking_count + round + max_rounds | Convergence check | converged: boolean |
| All rounds_history | Aggregate round data + design metrics | debate-summary.md |
| converged == false | Generate warning text | Warning appended to interface-spec.yaml |

---

## 3. State Management Data Flow

The orchestrator manages all state through `.isdlc/state.json`. Sub-agents
(Creator, Critic, Refiner) are stateless -- they receive all context through
the Task prompt and produce output as files.

```mermaid
flowchart LR
    subgraph StateJSON["state.json Fields"]
        DM[active_workflow.debate_mode]
        DSP[active_workflow.debate_state.phase<br/>= "04-design"]
        DSR[active_workflow.debate_state.round]
        DSC[active_workflow.debate_state.converged]
        DSMR[active_workflow.debate_state.max_rounds<br/>= 3]
        DSBF[active_workflow.debate_state.blocking_findings]
        DSRH[active_workflow.debate_state.rounds_history]
    end

    subgraph WritePoints["Write Points"]
        W1["Step 1: resolveDebateMode() -> DM"]
        W2["Step 2: Initialize -> DSP='04-design', DSR=0, DSC=false, DSMR=3"]
        W3["Step 3: Creator start -> DSR=1"]
        W4["Step 4a: After Critic -> DSRH.push, DSBF"]
        W5["Step 4b: Convergence -> DSC=true/false"]
        W6["Step 4c: After Refiner -> DSR+=1"]
        W7["Step 5: Finalization -> final DSC, DSRH"]
    end

    W1 --> DM
    W2 --> DSP
    W2 --> DSR
    W2 --> DSC
    W2 --> DSMR
    W3 --> DSR
    W4 --> DSRH
    W4 --> DSBF
    W5 --> DSC
    W6 --> DSR
    W7 --> DSC
    W7 --> DSRH
```

### State Schema (Phase 04 Instance)

The `debate_state.phase` field is set to `"04-design"` when the Phase 04
debate loop starts. This is the only value that differs from Phase 03
(`"03-architecture"`) or Phase 01 (`"01-requirements"`). All other fields
have the same semantics.

```json
{
  "active_workflow": {
    "debate_mode": true,
    "debate_state": {
      "phase": "04-design",
      "round": 2,
      "max_rounds": 3,
      "converged": true,
      "blocking_findings": 0,
      "rounds_history": [
        { "round": 1, "blocking": 4, "warnings": 2, "action": "refine" },
        { "round": 2, "blocking": 0, "warnings": 1, "action": "converge" }
      ]
    }
  }
}
```

---

## 4. Edge Case Data Flows

### 4.1 Missing Critical Artifact (AC-007-01)

```mermaid
sequenceDiagram
    participant Orch as Orchestrator
    participant SD as System Designer (Creator)
    participant FS as File System

    Orch->>SD: DEBATE_CONTEXT: {mode: creator, round: 1}
    SD->>FS: Write module-designs/*.md (partial output)
    SD->>FS: Write error-taxonomy.md (partial output)
    SD-->>Orch: Done (but interface-spec.yaml NOT produced)

    Orch->>FS: Check: interface-spec.yaml exists? NO
    Orch->>FS: Check: openapi.yaml exists? NO

    Note over Orch: Critical artifact missing<br/>Abort debate loop<br/>Fall back to single-agent

    Orch->>SD: Re-delegate WITHOUT DEBATE_CONTEXT<br/>(single-agent mode)
    SD->>FS: Write all artifacts normally
    SD-->>Orch: Done
```

### 4.2 Malformed Critique (AC-007-02)

```mermaid
sequenceDiagram
    participant Orch as Orchestrator
    participant DC as Design Critic
    participant FS as File System

    Orch->>DC: DEBATE_CONTEXT: {round: 1}
    DC->>FS: Write round-1-critique.md (malformed Summary)
    DC-->>Orch: Done

    Orch->>FS: Read round-1-critique.md
    Note over Orch: Cannot parse BLOCKING count<br/>from Summary table<br/><br/>Fail-open (Article X):<br/>Treat as BLOCKING = 0

    Orch->>FS: Log warning in state.json
    Note over Orch: CONVERGED (by default)
    Orch->>FS: Write debate-summary.md
```

### 4.3 Max Rounds Unconverged (AC-007-03)

```mermaid
sequenceDiagram
    participant Orch as Orchestrator
    participant DC as Design Critic
    participant DR as Design Refiner
    participant FS as File System

    loop Rounds 1-3
        Orch->>DC: Review artifacts
        DC-->>Orch: BLOCKING > 0
        alt round < 3
            Orch->>DR: Fix BLOCKING findings
            DR-->>Orch: Updated artifacts
        end
    end

    Note over Orch: Round 3 Critic: BLOCKING = 2<br/>round >= max_rounds<br/>UNCONVERGED

    Orch->>FS: Append to interface-spec.yaml:<br/>"[WARNING: Debate did not converge after 3 rounds.<br/>2 BLOCKING finding(s) remain.<br/>See debate-summary.md for details.]"
    Orch->>FS: Write debate-summary.md<br/>(converged: false, remaining: 2 BLOCKING)
```

### 4.4 Non-REST Interface Type (AC-007-04)

```mermaid
flowchart TD
    A["Design Critic receives artifacts"] --> B{openapi.yaml exists?}
    B -->|Yes| C["Interface Type = REST API<br/>Full DC-01..DC-08 apply"]
    B -->|No| D{Read interface-spec.yaml}
    D --> E{Detect content type}
    E -->|CLI commands| F["Interface Type = CLI<br/>DC-01: check CLI flags/args<br/>DC-05: check command idempotency<br/>DC-06: SKIP (non-UI)"]
    E -->|Function signatures| G["Interface Type = Library<br/>DC-01: check function signatures<br/>DC-05: check state mutation safety<br/>DC-06: SKIP (non-UI)"]
    E -->|Event definitions| H["Interface Type = Event<br/>DC-01: check event schemas<br/>DC-05: check at-least-once delivery<br/>DC-06: SKIP (non-UI)"]
    E -->|Cannot determine| I["Interface Type = Generic<br/>Apply all DC-01..DC-08 with<br/>general heuristics<br/>DC-06: SKIP if no UI artifacts"]

    C --> J["Proceed with adapted checks"]
    F --> J
    G --> J
    H --> J
    I --> J
```

### 4.5 Debate OFF -- Single Agent Path (NFR-003)

```mermaid
sequenceDiagram
    participant User
    participant CLI as isdlc.md
    participant Orch as Orchestrator
    participant SD as System Designer

    User->>CLI: /isdlc feature "Small change" -light
    CLI->>Orch: FLAGS: {light: true}

    Note over Orch: resolveDebateMode() = false<br/>(-light implies --no-debate)

    Orch->>SD: Delegate WITHOUT DEBATE_CONTEXT
    Note over SD: Current single-agent behavior<br/>unchanged from today (NFR-003)
    SD-->>Orch: All Phase 04 artifacts produced

    Note over Orch: Phase 04 complete (no debate)
```

---

## 5. Debate-Summary.md Metrics Flow

The debate-summary.md for Phase 04 includes design-specific metrics
(AC-005-03). These metrics flow from the Critic's last critique report
into the orchestrator's summary generation.

```mermaid
flowchart LR
    subgraph CriticOutput["Last Critique Report (round-N-critique.md)"]
        M1["API Endpoint Count: {E}"]
        M2["Validation Rule Count: {V}"]
        M3["Error Code Count: {C}"]
        M4["Module Count: {M}"]
        M5["Pattern Consistency Score: {P}/100"]
    end

    subgraph OrchestratorAggregation["Orchestrator Processing"]
        RH["rounds_history aggregation"]
        CV["convergence status"]
        MX["Extract metrics from last critique"]
    end

    subgraph DebateSummary["debate-summary.md"]
        S1["Rounds: {N}"]
        S2["Converged: {Yes/No}"]
        S3["Total findings: B BLOCKING, W WARNING"]
        S4["Findings resolved: Br BLOCKING, Wr WARNING"]
        S5["API Endpoint Count: {E}"]
        S6["Validation Rule Count: {V}"]
        S7["Error Code Count: {C}"]
        S8["Module Count: {M}"]
        S9["Pattern Consistency Score: {P}/100"]
    end

    M1 --> MX
    M2 --> MX
    M3 --> MX
    M4 --> MX
    M5 --> MX
    MX --> S5
    MX --> S6
    MX --> S7
    MX --> S8
    MX --> S9
    RH --> S1
    RH --> S3
    RH --> S4
    CV --> S2
```
