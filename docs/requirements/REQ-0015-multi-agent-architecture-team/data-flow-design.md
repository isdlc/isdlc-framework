# Data Flow Design: Multi-Agent Architecture Team

**Feature:** REQ-0015-multi-agent-architecture-team
**Phase:** 04-design
**Created:** 2026-02-14
**Traces:** FR-001..FR-007, NFR-001..NFR-004

---

## 1. Generalized Debate Loop Data Flow (Phase-Agnostic)

This diagram shows how data (artifacts, critique reports, state) flows through
the debate loop regardless of which phase is active. The routing table
determines which agents receive delegations, but the data flow pattern is
identical.

```mermaid
flowchart TD
    subgraph Input["Input Data"]
        FD[Feature Description]
        FL[FLAGS: debate/no_debate/light]
        SZ[Sizing: standard/epic/light]
        DC[Discovery Context]
    end

    subgraph Orchestrator["Orchestrator (Data Coordinator)"]
        RM[resolveDebateMode<br/>FL + SZ -> debate_mode]
        RT[DEBATE_ROUTING<br/>current_phase -> routing entry]
        DS[debate_state in state.json<br/>round, converged, rounds_history]
        PC[Parse Critique<br/>Extract BLOCKING count from Summary table]
        CC[Convergence Check<br/>BLOCKING == 0 OR round >= max_rounds]
    end

    subgraph Creator["Creator Agent (Phase-Specific)"]
        CR_IN[Receives: DEBATE_CONTEXT + Feature Description]
        CR_OUT[Produces: Phase artifacts + Self-Assessment]
    end

    subgraph Critic["Critic Agent (Phase-Specific)"]
        CK_IN[Receives: DEBATE_CONTEXT + All phase artifacts]
        CK_OUT[Produces: round-N-critique.md<br/>BLOCKING + WARNING findings + Metrics]
    end

    subgraph Refiner["Refiner Agent (Phase-Specific)"]
        RF_IN[Receives: DEBATE_CONTEXT + All phase artifacts + Critique]
        RF_OUT[Produces: Updated phase artifacts + Change Log]
    end

    subgraph Output["Output Data"]
        ARTS[Final Phase Artifacts]
        SUMM[debate-summary.md]
        STATE[Updated state.json]
    end

    FD --> RM
    FL --> RM
    SZ --> RM
    RM -->|debate_mode| RT
    RT -->|routing entry| DS

    DS -->|round=1| CR_IN
    FD --> CR_IN
    DC --> CR_IN
    CR_OUT -->|phase artifacts| CK_IN
    DS -->|round N| CK_IN
    CK_OUT -->|round-N-critique.md| PC
    PC -->|BLOCKING count| CC

    CC -->|converged| SUMM
    CC -->|not converged, round < max| RF_IN
    CK_OUT -->|critique| RF_IN
    CR_OUT -->|artifacts| RF_IN
    RF_OUT -->|updated artifacts| CK_IN

    CC -->|unconverged, round = max| SUMM
    RF_OUT --> ARTS
    CR_OUT --> ARTS
    DS --> STATE
    SUMM --> Output
```

---

## 2. Phase 03 Architecture Debate Data Flow (Concrete Instance)

This shows the specific data items that flow through the debate loop when
`current_phase = "03-architecture"`.

```mermaid
sequenceDiagram
    participant User
    participant CLI as isdlc.md
    participant Orch as Orchestrator
    participant SA as Solution Architect<br/>(Creator)
    participant AC as Architecture Critic
    participant AR as Architecture Refiner
    participant FS as File System<br/>(Artifact Folder)

    User->>CLI: /isdlc feature "description" --debate
    CLI->>Orch: FLAGS: {debate: true}<br/>Feature description

    Note over Orch: resolveDebateMode() = true<br/>current_phase = "03-architecture"<br/>lookup DEBATE_ROUTING -> found

    Orch->>FS: Write state.json: debate_state = {round: 1, phase: "03-architecture"}

    rect rgb(230, 245, 255)
        Note over SA: Round 1 - Creator
        Orch->>SA: DEBATE_CONTEXT: {mode: creator, round: 1}<br/>Feature description
        SA->>FS: Write architecture-overview.md (Round 1 Draft + Self-Assessment)
        SA->>FS: Write tech-stack-decision.md
        SA->>FS: Write database-design.md
        SA->>FS: Write security-architecture.md
        SA->>FS: Write ADR-*.md files
        SA-->>Orch: "Round 1 architecture artifacts produced."
    end

    Orch->>FS: Check: architecture-overview.md exists? YES

    rect rgb(255, 240, 240)
        Note over AC: Round 1 - Critic
        Orch->>AC: DEBATE_CONTEXT: {round: 1}<br/>Paths to all 5 artifact types
        Note over AC: Runs 8 mandatory checks<br/>+ constitutional checks<br/>+ computes metrics
        AC->>FS: Write round-1-critique.md
        AC-->>Orch: Critique complete
    end

    Orch->>FS: Read round-1-critique.md -> Summary table
    Note over Orch: Parse: BLOCKING = 3, WARNING = 2<br/>3 > 0, round 1 < 3 -> continue

    Orch->>FS: Update state.json: rounds_history[0] = {round: 1, blocking: 3, warnings: 2, action: "refine"}

    rect rgb(240, 255, 240)
        Note over AR: Round 1 - Refiner
        Orch->>AR: DEBATE_CONTEXT: {round: 1}<br/>All artifact paths + round-1-critique.md
        Note over AR: Addresses 3 BLOCKING findings<br/>Applies fix strategies<br/>Documents changes
        AR->>FS: Update architecture-overview.md (adds HA, appends change log)
        AR->>FS: Update security-architecture.md (completes STRIDE)
        AR->>FS: Update tech-stack-decision.md (adds cost projections)
        AR-->>Orch: Refinement complete
    end

    Orch->>FS: Update state.json: round = 2

    rect rgb(255, 240, 240)
        Note over AC: Round 2 - Critic
        Orch->>AC: DEBATE_CONTEXT: {round: 2}<br/>Paths to updated artifacts
        Note over AC: Re-checks all 8 categories<br/>Previous BLOCKING items resolved
        AC->>FS: Write round-2-critique.md
        AC-->>Orch: Critique complete
    end

    Orch->>FS: Read round-2-critique.md -> Summary table
    Note over Orch: Parse: BLOCKING = 0, WARNING = 1<br/>0 = CONVERGED

    Orch->>FS: Update state.json: converged = true
    Orch->>FS: Write debate-summary.md<br/>(rounds: 2, converged: true,<br/>ADR Count: 4, Threat Coverage: 100%,<br/>NFR Alignment: 95/100)

    Orch-->>User: Phase 03 complete. Debate converged in 2 rounds.
```

---

## 3. Data Transformation Map

This table documents every data transformation that occurs during the debate
loop, mapping input data to output data for each agent.

### 3.1 Creator (Solution Architect) Transformations

| Input | Transformation | Output |
|-------|---------------|--------|
| Feature description | Analyze requirements, select architecture pattern | architecture-overview.md |
| Feature description | Evaluate technologies, select stack | tech-stack-decision.md |
| Feature description | Design data model, define schema | database-design.md |
| Feature description | STRIDE analysis, security controls | security-architecture.md |
| Feature description | Document key decisions | ADR-*.md files |
| DEBATE_CONTEXT.round | Label artifacts with round number | "Round {N} Draft" in metadata |
| DEBATE_CONTEXT.mode=creator | Generate self-assessment | Self-Assessment section in architecture-overview.md |

### 3.2 Critic (Architecture Critic) Transformations

| Input | Transformation | Output |
|-------|---------------|--------|
| architecture-overview.md | Check NFR alignment, SPOF, coupling, observability | B-NNN/W-NNN findings for AC-01, AC-05, AC-07, AC-06 |
| tech-stack-decision.md | Check justification quality, cost analysis | B-NNN/W-NNN findings for AC-04, AC-08 |
| database-design.md | Check indexes, migration, backup, normalization | B-NNN/W-NNN findings for AC-03 |
| security-architecture.md | Check STRIDE completeness, mitigations | B-NNN/W-NNN findings for AC-02 |
| ADR-*.md files | Check completeness, traceability | B-NNN/W-NNN findings for Article VII |
| requirements-spec.md (NFRs) | Cross-reference NFR targets with architecture | NFR Alignment Score metric |
| All artifacts | Count decision records | ADR Count metric |
| security-architecture.md | Count STRIDE categories covered | Threat Coverage metric |
| All findings | Aggregate counts | Summary table (Total, BLOCKING, WARNING) |

### 3.3 Refiner (Architecture Refiner) Transformations

| Input | Transformation | Output |
|-------|---------------|--------|
| B-NNN (AC-01: NFR misalign) | Add infrastructure to meet NFR targets | Updated architecture-overview.md |
| B-NNN (AC-02: STRIDE gaps) | Add missing threat mitigations | Updated security-architecture.md |
| B-NNN (AC-03: DB flaws) | Add indexes, migration, backup plan | Updated database-design.md |
| B-NNN (AC-04: Weak justification) | Add evaluation criteria, alternatives, cost | Updated tech-stack-decision.md |
| B-NNN (AC-05: SPOF) | Add redundancy, failover | Updated architecture-overview.md |
| B-NNN (AC-06: No observability) | Add monitoring, logging, alerting, tracing | Updated architecture-overview.md |
| B-NNN (AC-07: Coupling) | Resolve inconsistency or restate honestly | Updated architecture-overview.md |
| B-NNN (AC-08: No cost) | Add cost projections | Updated tech-stack-decision.md |
| W-NNN (any) | Fix if straightforward, else [NEEDS CLARIFICATION] | Updated target artifact |
| All addressed findings | Tabulate changes | Changes section appended to architecture-overview.md |

### 3.4 Orchestrator Transformations

| Input | Transformation | Output |
|-------|---------------|--------|
| FLAGS + sizing | resolveDebateMode() | debate_mode: boolean |
| current_phase | DEBATE_ROUTING lookup | routing: {creator, critic, refiner, artifacts, critical_artifact} |
| round-N-critique.md Summary | Parse BLOCKING integer from table | blocking_count: integer |
| blocking_count + round + max_rounds | Convergence check | converged: boolean |
| All rounds_history | Aggregate round data | debate-summary.md |
| converged == false | Generate warning text | Warning appended to routing.critical_artifact |

---

## 4. State Management Data Flow

The orchestrator manages all state through `.isdlc/state.json`. Sub-agents
(Creator, Critic, Refiner) are stateless -- they receive all context through
the Task prompt and produce output as files.

```mermaid
flowchart LR
    subgraph StateJSON["state.json Fields"]
        DM[active_workflow.debate_mode]
        DSP[active_workflow.debate_state.phase]
        DSR[active_workflow.debate_state.round]
        DSC[active_workflow.debate_state.converged]
        DSMR[active_workflow.debate_state.max_rounds]
        DSBF[active_workflow.debate_state.blocking_findings]
        DSRH[active_workflow.debate_state.rounds_history]
    end

    subgraph WritePoints["Write Points"]
        W1["Step 1: resolveDebateMode() -> DM"]
        W2["Step 2: Initialize -> DSP, DSR=0, DSC=false, DSMR=3"]
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

### State Schema Extension

The `debate_state.phase` field is the only additive change to the state.json
schema. All other fields already exist from REQ-0014. The Phase 01 debate state
is unaffected because the `phase` field is simply added alongside existing fields.

```json
{
  "active_workflow": {
    "debate_mode": true,
    "debate_state": {
      "phase": "03-architecture",
      "round": 2,
      "max_rounds": 3,
      "converged": true,
      "blocking_findings": 0,
      "rounds_history": [
        { "round": 1, "blocking": 3, "warnings": 2, "action": "refine" },
        { "round": 2, "blocking": 0, "warnings": 1, "action": "converge" }
      ]
    }
  }
}
```

---

## 5. Edge Case Data Flows

### 5.1 Missing Critical Artifact (AC-007-01)

```mermaid
sequenceDiagram
    participant Orch as Orchestrator
    participant SA as Creator
    participant FS as File System

    Orch->>SA: DEBATE_CONTEXT: {mode: creator, round: 1}
    SA->>FS: Write tech-stack-decision.md (partial output)
    SA-->>Orch: Done (but architecture-overview.md NOT produced)

    Orch->>FS: Check: architecture-overview.md exists? NO

    Note over Orch: Critical artifact missing<br/>Abort debate loop<br/>Fall back to single-agent

    Orch->>SA: Re-delegate WITHOUT DEBATE_CONTEXT<br/>(single-agent mode)
    SA->>FS: Write all artifacts normally
    SA-->>Orch: Done
```

### 5.2 Malformed Critique (AC-007-02)

```mermaid
sequenceDiagram
    participant Orch as Orchestrator
    participant AC as Critic
    participant FS as File System

    Orch->>AC: DEBATE_CONTEXT: {round: 1}
    AC->>FS: Write round-1-critique.md (malformed Summary)
    AC-->>Orch: Done

    Orch->>FS: Read round-1-critique.md
    Note over Orch: Cannot parse BLOCKING count<br/>from Summary table<br/><br/>Fail-open (Article X):<br/>Treat as BLOCKING = 0

    Orch->>FS: Log warning in state.json
    Note over Orch: CONVERGED (by default)
    Orch->>FS: Write debate-summary.md
```

### 5.3 Max Rounds Unconverged (AC-007-03)

```mermaid
sequenceDiagram
    participant Orch as Orchestrator
    participant AC as Critic
    participant AR as Refiner
    participant FS as File System

    loop Rounds 1-3
        Orch->>AC: Review artifacts
        AC-->>Orch: BLOCKING > 0
        alt round < 3
            Orch->>AR: Fix BLOCKING findings
            AR-->>Orch: Updated artifacts
        end
    end

    Note over Orch: Round 3 Critic: BLOCKING = 1<br/>round >= max_rounds<br/>UNCONVERGED

    Orch->>FS: Append to architecture-overview.md:<br/>"[WARNING: Debate did not converge after 3 rounds.<br/>1 BLOCKING finding(s) remain.<br/>See debate-summary.md for details.]"
    Orch->>FS: Write debate-summary.md<br/>(converged: false, remaining: 1 BLOCKING)
```
