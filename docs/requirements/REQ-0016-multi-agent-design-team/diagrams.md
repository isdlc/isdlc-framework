# Architecture Diagrams: Multi-Agent Design Team

**Feature:** REQ-0016-multi-agent-design-team
**Phase:** 03-architecture
**Created:** 2026-02-15

---

## 1. Component Diagram -- Phase 04 Debate Agents

```mermaid
graph TB
    subgraph "iSDLC Framework"
        subgraph "Orchestrator"
            ORC["00-sdlc-orchestrator.md<br/>Section 7.5: DEBATE_ROUTING"]
        end

        subgraph "Phase 04 Debate Agents"
            CR["03-system-designer.md<br/>(Creator)<br/>[MODIFIED]"]
            CT["03-design-critic.md<br/>(Critic)<br/>[NEW]"]
            RF["03-design-refiner.md<br/>(Refiner)<br/>[NEW]"]
        end

        subgraph "Phase 04 Artifacts"
            IS["interface-spec.yaml<br/>(or openapi.yaml)"]
            MD["module-designs/"]
            ET["error-taxonomy.md"]
            VR["validation-rules.json"]
            RC["round-N-critique.md"]
            DS["debate-summary.md"]
        end

        subgraph "State"
            ST[".isdlc/state.json<br/>debate_state"]
        end
    end

    ORC -->|"1. DEBATE_CONTEXT<br/>mode=creator"| CR
    CR -->|"produces"| IS
    CR -->|"produces"| MD
    CR -->|"produces"| ET
    CR -->|"produces"| VR
    ORC -->|"2. round N"| CT
    CT -->|"reads"| IS
    CT -->|"reads"| MD
    CT -->|"reads"| ET
    CT -->|"reads"| VR
    CT -->|"produces"| RC
    ORC -->|"3. round N + critique"| RF
    RF -->|"reads"| RC
    RF -->|"updates"| IS
    RF -->|"updates"| MD
    RF -->|"updates"| ET
    RF -->|"updates"| VR
    ORC -->|"4. post-convergence"| DS
    ORC -->|"reads/writes"| ST
```

---

## 2. Sequence Diagram -- Phase 04 Debate Loop (2-Round Convergence)

```mermaid
sequenceDiagram
    participant U as Developer
    participant CMD as isdlc.md
    participant ORC as Orchestrator
    participant SD as System Designer<br/>(Creator)
    participant DC as Design Critic
    participant DR as Design Refiner
    participant ST as state.json

    U->>CMD: /isdlc feature "desc" (standard)
    CMD->>ORC: debate flags + feature desc
    ORC->>ST: resolveDebateMode() = true
    ORC->>ORC: DEBATE_ROUTING["04-design"] found

    Note over ORC: --- ROUND 1 ---

    ORC->>SD: Task(DEBATE_CONTEXT: creator, round: 1)
    SD-->>ORC: interface-spec.yaml, module-designs/,<br/>error-taxonomy.md, validation-rules.json

    ORC->>ORC: Verify critical artifact exists

    ORC->>DC: Task(artifacts, round: 1)
    DC-->>ORC: round-1-critique.md<br/>(4 BLOCKING, 3 WARNING)

    ORC->>ORC: Parse BLOCKING count = 4 > 0
    ORC->>ST: Update debate_state.round = 1

    ORC->>DR: Task(artifacts + critique, round: 1)
    DR-->>ORC: Updated artifacts + changes section

    Note over ORC: --- ROUND 2 ---

    ORC->>DC: Task(updated artifacts, round: 2)
    DC-->>ORC: round-2-critique.md<br/>(0 BLOCKING, 2 WARNING)

    ORC->>ORC: BLOCKING = 0 --> CONVERGED
    ORC->>ST: debate_state.converged = true
    ORC->>ORC: Generate debate-summary.md

    Note over ORC: Phase 04 complete
```

---

## 3. DEBATE_ROUTING Table Diagram (All 3 Phases)

```mermaid
graph LR
    subgraph "DEBATE_ROUTING Table"
        direction TB
        P01["Phase 01: 01-requirements"]
        P03["Phase 03: 03-architecture"]
        P04["Phase 04: 04-design<br/>[NEW ROW]"]
    end

    subgraph "Phase 01 Agents"
        P01C["01-requirements-analyst.md"]
        P01T["01-requirements-critic.md"]
        P01R["01-requirements-refiner.md"]
    end

    subgraph "Phase 03 Agents"
        P03C["02-solution-architect.md"]
        P03T["02-architecture-critic.md"]
        P03R["02-architecture-refiner.md"]
    end

    subgraph "Phase 04 Agents"
        P04C["03-system-designer.md"]
        P04T["03-design-critic.md<br/>[NEW]"]
        P04R["03-design-refiner.md<br/>[NEW]"]
    end

    P01 --> P01C
    P01 --> P01T
    P01 --> P01R

    P03 --> P03C
    P03 --> P03T
    P03 --> P03R

    P04 --> P04C
    P04 --> P04T
    P04 --> P04R
```

---

## 4. Data Flow Diagram -- Design Critique Check Categories

```mermaid
flowchart TD
    A["Design Artifacts Input"] --> B{Detect Interface Type}
    B -->|REST API<br/>openapi.yaml| C["Full DC-01..DC-08"]
    B -->|CLI<br/>interface-spec.yaml| D["DC-01,02,03,04,07,08<br/>DC-05 adapted<br/>DC-06 skipped"]
    B -->|Library<br/>interface-spec.yaml| E["DC-01,02,03,04,07,08<br/>DC-05 adapted<br/>DC-06 skipped"]
    B -->|Events<br/>interface-spec.yaml| F["DC-01,02,03,04,07,08<br/>DC-05 adapted<br/>DC-06 skipped"]

    C --> G["8 Mandatory Checks"]
    D --> G
    E --> G
    F --> G

    G --> H["DC-01: Incomplete API Specs"]
    G --> I["DC-02: Inconsistent Patterns"]
    G --> J["DC-03: Module Overlap"]
    G --> K["DC-04: Validation Gaps"]
    G --> L["DC-05: Missing Idempotency"]
    G --> M["DC-06: Accessibility Issues"]
    G --> N["DC-07: Error Taxonomy Holes"]
    G --> O["DC-08: Data Flow Bottlenecks"]

    H --> P["5 Constitutional Checks"]
    I --> P
    J --> P
    K --> P
    L --> P
    M --> P
    N --> P
    O --> P

    P --> Q["Article I: Specification Primacy"]
    P --> R["Article IV: Explicit Over Implicit"]
    P --> S["Article V: Simplicity First"]
    P --> T["Article VII: Artifact Traceability"]
    P --> U["Article IX: Quality Gate Integrity"]

    Q --> V["Produce Critique Report<br/>round-N-critique.md"]
    R --> V
    S --> V
    T --> V
    U --> V
```

---

## 5. State Diagram -- Debate Convergence Flow

```mermaid
stateDiagram-v2
    [*] --> ResolveDebateMode
    ResolveDebateMode --> DebateOFF: debate_mode = false
    ResolveDebateMode --> CheckRouting: debate_mode = true

    DebateOFF --> SingleAgent
    SingleAgent --> [*]: Phase complete

    CheckRouting --> NotInTable: phase NOT in DEBATE_ROUTING
    CheckRouting --> InitDebate: phase IN DEBATE_ROUTING

    NotInTable --> SingleAgent

    InitDebate --> CreatorRound1: round = 1
    CreatorRound1 --> CheckCritical: Creator produces artifacts

    CheckCritical --> AbortFallback: Critical artifact missing
    CheckCritical --> CriticReview: Critical artifact exists

    AbortFallback --> SingleAgent

    CriticReview --> Converged: BLOCKING = 0
    CriticReview --> CheckMaxRounds: BLOCKING > 0

    CheckMaxRounds --> Unconverged: round >= max_rounds
    CheckMaxRounds --> RefinerPass: round < max_rounds

    RefinerPass --> CriticReview: round++

    Converged --> GenerateSummary
    Unconverged --> AppendWarning
    AppendWarning --> GenerateSummary

    GenerateSummary --> [*]: Phase complete
```
