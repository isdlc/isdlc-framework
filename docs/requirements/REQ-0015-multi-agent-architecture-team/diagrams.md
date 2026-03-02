# Architecture Diagrams: Multi-Agent Architecture Team

**Feature:** REQ-0015-multi-agent-architecture-team
**Phase:** 03-architecture
**Created:** 2026-02-14

---

## 1. Generalized Debate Loop Flow (Component Diagram)

```mermaid
flowchart TD
    Start([Phase Start]) --> ResolveDebate{Resolve Debate Mode}
    ResolveDebate -->|"--no-debate OR -light"| SingleAgent[Delegate to Phase Primary Agent<br/>NO DEBATE_CONTEXT]
    SingleAgent --> PhaseComplete([Phase Complete])

    ResolveDebate -->|"--debate OR standard/epic sizing"| CheckRouting{Phase in<br/>DEBATE_ROUTING?}
    CheckRouting -->|No| SingleAgent
    CheckRouting -->|Yes| LookupRouting[Lookup routing table:<br/>Creator, Critic, Refiner,<br/>artifacts, critical_artifact]

    LookupRouting --> InitDebate[Initialize debate_state<br/>round=0, max_rounds=3]
    InitDebate --> CreatorRound[Round 1: Delegate to Creator<br/>with DEBATE_CONTEXT]

    CreatorRound --> CheckCritical{Critical artifact<br/>exists?}
    CheckCritical -->|No| FallbackSingle[Abort debate<br/>Fall back to single-agent]
    FallbackSingle --> PhaseComplete

    CheckCritical -->|Yes| CriticReview[Delegate to Critic<br/>Review all artifacts]
    CriticReview --> ParseCritique[Parse round-N-critique.md<br/>Count BLOCKING findings]

    ParseCritique --> ConvergenceCheck{BLOCKING == 0?}
    ConvergenceCheck -->|Yes| Converged[CONVERGED<br/>Generate debate-summary.md]
    Converged --> PhaseComplete

    ConvergenceCheck -->|No| MaxRoundsCheck{Round >= max_rounds?}
    MaxRoundsCheck -->|Yes| Unconverged[UNCONVERGED<br/>Append warning to critical artifact<br/>Generate debate-summary.md]
    Unconverged --> PhaseComplete

    MaxRoundsCheck -->|No| RefinerImprove[Delegate to Refiner<br/>Address BLOCKING findings]
    RefinerImprove --> IncrementRound[round += 1]
    IncrementRound --> CriticReview
```

---

## 2. Phase-Specific Agent Routing (Sequence Diagram)

```mermaid
sequenceDiagram
    participant O as Orchestrator
    participant RT as Routing Table
    participant C1 as Phase 01 Creator<br/>(requirements-analyst)
    participant K1 as Phase 01 Critic<br/>(requirements-critic)
    participant R1 as Phase 01 Refiner<br/>(requirements-refiner)
    participant C3 as Phase 03 Creator<br/>(solution-architect)
    participant K3 as Phase 03 Critic<br/>(architecture-critic)
    participant R3 as Phase 03 Refiner<br/>(architecture-refiner)

    Note over O,RT: Phase 01 Path
    O->>RT: lookup("01-requirements")
    RT-->>O: {creator: analyst, critic: req-critic, refiner: req-refiner}
    O->>C1: DEBATE_CONTEXT {mode: creator, round: 1}
    C1-->>O: requirements-spec.md, user-stories.json, ...
    O->>K1: DEBATE_CONTEXT {round: 1}
    K1-->>O: round-1-critique.md (3 BLOCKING)
    O->>R1: DEBATE_CONTEXT {round: 1} + critique
    R1-->>O: Updated artifacts
    O->>K1: DEBATE_CONTEXT {round: 2}
    K1-->>O: round-2-critique.md (0 BLOCKING)
    Note over O: CONVERGED

    Note over O,RT: Phase 03 Path (same loop, different agents)
    O->>RT: lookup("03-architecture")
    RT-->>O: {creator: architect, critic: arch-critic, refiner: arch-refiner}
    O->>C3: DEBATE_CONTEXT {mode: creator, round: 1}
    C3-->>O: architecture-overview.md, tech-stack-decision.md, ...
    O->>K3: DEBATE_CONTEXT {round: 1}
    K3-->>O: round-1-critique.md (2 BLOCKING)
    O->>R3: DEBATE_CONTEXT {round: 1} + critique
    R3-->>O: Updated artifacts
    O->>K3: DEBATE_CONTEXT {round: 2}
    K3-->>O: round-2-critique.md (0 BLOCKING)
    Note over O: CONVERGED
```

---

## 3. Component Interaction Diagram

```mermaid
graph TB
    subgraph CLI["CLI Layer"]
        CMD[isdlc.md<br/>Parse --debate/--no-debate flags]
    end

    subgraph Orchestrator["Orchestrator Layer"]
        ORCH[00-sdlc-orchestrator.md<br/>Section 7.5: Debate Loop]
        RT[DEBATE_ROUTING Table]
        STATE[state.json<br/>debate_state, rounds_history]
    end

    subgraph Phase01["Phase 01 Agents"]
        P1C[01-requirements-analyst.md<br/>Creator]
        P1K[01-requirements-critic.md<br/>Critic]
        P1R[01-requirements-refiner.md<br/>Refiner]
    end

    subgraph Phase03["Phase 03 Agents"]
        P3C[02-solution-architect.md<br/>Creator]
        P3K[02-architecture-critic.md<br/>Critic - NEW]
        P3R[02-architecture-refiner.md<br/>Refiner - NEW]
    end

    subgraph Artifacts["Artifact Store"]
        AF[docs/requirements/REQ-NNNN/]
        CRIT[round-N-critique.md]
        SUMM[debate-summary.md]
    end

    CMD -->|flags| ORCH
    ORCH -->|lookup| RT
    ORCH -->|read/write| STATE
    RT -.->|"01-requirements"| Phase01
    RT -.->|"03-architecture"| Phase03
    ORCH -->|delegate| P1C
    ORCH -->|delegate| P1K
    ORCH -->|delegate| P1R
    ORCH -->|delegate| P3C
    ORCH -->|delegate| P3K
    ORCH -->|delegate| P3R
    P1C -->|write| AF
    P1K -->|write| CRIT
    P1R -->|write| AF
    P3C -->|write| AF
    P3K -->|write| CRIT
    P3R -->|write| AF
    ORCH -->|write| SUMM
```

---

## 4. Architecture Critic Check Categories Diagram

```mermaid
graph LR
    subgraph Input["Phase 03 Artifacts"]
        AO[architecture-overview.md]
        TS[tech-stack-decision.md]
        DB[database-design.md]
        SA[security-architecture.md]
        ADR[ADRs]
    end

    subgraph Critic["Architecture Critic<br/>8 Mandatory Checks"]
        AC01[AC-01: NFR Alignment]
        AC02[AC-02: STRIDE Threat Model]
        AC03[AC-03: Database Design]
        AC04[AC-04: Tech Stack Justification]
        AC05[AC-05: Single Points of Failure]
        AC06[AC-06: Observability]
        AC07[AC-07: Coupling Contradictions]
        AC08[AC-08: Cost Implications]
    end

    subgraph Output["Critique Report"]
        BLOCK[BLOCKING Findings]
        WARN[WARNING Findings]
        METRICS[Architecture Metrics<br/>ADR count, threat %, NFR score]
    end

    AO --> AC01
    AO --> AC05
    AO --> AC07
    TS --> AC04
    TS --> AC08
    DB --> AC03
    SA --> AC02
    ADR --> AC01
    AO --> AC06

    AC01 --> BLOCK
    AC02 --> BLOCK
    AC03 --> BLOCK
    AC04 --> BLOCK
    AC05 --> BLOCK
    AC06 --> BLOCK
    AC07 --> BLOCK
    AC08 --> BLOCK
    AC01 --> WARN
    AC06 --> WARN
    AC08 --> WARN

    AC01 --> METRICS
    AC02 --> METRICS
```

---

## 5. State Transitions During Debate

```mermaid
stateDiagram-v2
    [*] --> ResolveMode: Phase starts
    ResolveMode --> SingleAgent: debate_mode = false
    ResolveMode --> DebateInit: debate_mode = true

    DebateInit --> CreatorDelegation: round = 1
    CreatorDelegation --> CriticReview: artifacts produced
    CreatorDelegation --> FallbackSingle: critical artifact missing

    CriticReview --> Converged: BLOCKING = 0
    CriticReview --> RefinerDelegation: BLOCKING > 0 AND round < max
    CriticReview --> Unconverged: BLOCKING > 0 AND round = max

    RefinerDelegation --> CriticReview: round += 1

    SingleAgent --> PhaseComplete
    Converged --> GenerateSummary
    Unconverged --> GenerateSummary
    FallbackSingle --> PhaseComplete
    GenerateSummary --> PhaseComplete
    PhaseComplete --> [*]
```
