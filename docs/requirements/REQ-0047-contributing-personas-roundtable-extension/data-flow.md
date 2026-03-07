---
Status: Draft
Confidence: High
Last Updated: 2026-03-07
Coverage: specification 85%
Source: REQ-0047 / GH-108a
---

# Data Flow: Contributing Personas -- Roundtable Extension

## 1. Startup Flow

```
[Framework Start]
       |
       v
[common.cjs: buildSessionCache()]
       |
       +---> Read src/claude/agents/persona-*.md (all built-in personas)
       +---> Read .isdlc/personas/*.md (user personas)
       +---> Apply override-by-copy (filename match -> user wins)
       +---> Compare version fields -> collect DriftWarning[]
       +---> Read .isdlc/roundtable.yaml -> parse verbosity + default_personas
       +---> Inject into session cache:
       |       ROUNDTABLE_CONTEXT (all resolved persona content)
       |       ROUNDTABLE_CONFIG (verbosity, default_personas)
       |       DRIFT_WARNINGS (if any)
       v
[analyze-item.cjs: getPersonaPaths()]
       |
       +---> Same scan + override logic
       +---> Return { paths[], driftWarnings[] }
       v
[Dispatch Prompt Assembly]
       |
       +---> PERSONA_CONTEXT: resolved persona file contents
       +---> ROUNDTABLE_VERBOSITY: "bulleted" | "conversational" | "silent"
       +---> ROUNDTABLE_ROSTER_DEFAULTS: ["security-reviewer", ...]
       +---> ROUNDTABLE_DRIFT_WARNINGS: [warning strings]
       v
[Roundtable Agent Receives Dispatch]
```

## 2. Roster Proposal Flow (conversational + bulleted modes)

```
[Roundtable Agent Start]
       |
       v
[Check ROUNDTABLE_VERBOSITY]
       |
       +---> "silent": SKIP roster proposal entirely --> go to analysis
       |
       +---> "conversational" or "bulleted":
               |
               v
       [Read draft/issue content]
               |
               v
       [Extract keywords from content]
               |
               v
       [Match keywords against persona triggers[] arrays]
               |
               +---> 2+ hits: CONFIDENT match
               +---> 1 hit: UNCERTAIN match
               +---> 0 hits: NO match
               v
       [Build roster proposal]
               |
               +---> Always include: Maya (BA), Alex (Arch), Jordan (Design)
               +---> Always include: default_personas from config
               +---> Include: CONFIDENT matches
               +---> Flag: UNCERTAIN matches ("also considering...")
               +---> Flag: domain needs without persona file
               v
       [Present to user]
               |
               "Based on this issue, I think we need: [confident list]."
               "I'm also considering [uncertain list] given [reason]."
               "What do you think?"
               |
               v
       [User confirms / amends]
               |
               v
       [Finalize active roster for session]
```

## 3. Verbosity Rendering Flow

```
[Internal Deliberation (always happens regardless of mode)]
       |
       +---> Maya analyzes requirements
       +---> Alex analyzes architecture
       +---> Jordan analyzes design
       +---> Contributing personas flag domain concerns
       +---> Cross-checks and inter-persona discussion (internal)
       |
       v
[Check ROUNDTABLE_VERBOSITY]
       |
       +---> "conversational":
       |       Render full dialogue with persona names
       |       Show cross-talk and inter-persona questions
       |       "Maya: I think we need to consider..."
       |       "Alex: Building on that, the codebase shows..."
       |
       +---> "bulleted":
       |       Render domain-labeled conclusion bullets only
       |       No persona names, no cross-talk
       |       **Requirements**:
       |       - conclusion 1
       |       - conclusion 2
       |       **Architecture**:
       |       - conclusion 1
       |       **Security**:
       |       - contributing persona conclusion
       |
       +---> "silent":
               Render unified analysis without any persona framing
               No persona names, no domain labels, no attribution
               "Looking at this feature, the key considerations are:
                - The authentication boundary needs..."
               Questions to user still appear naturally
```

## 4. Mid-Conversation Late-Join Flow

```
[Conversation in progress]
       |
       v
[Topic shift detected -> domain not in active roster]
       |
       v
[Check ROUNDTABLE_VERBOSITY]
       |
       +---> "silent":
       |       Use persona knowledge internally
       |       No announcement, no persona naming
       |       Weave domain analysis into unified output
       |
       +---> "conversational" or "bulleted":
               |
               v
       [Check available personas (built-in + user)]
               |
               +---> Persona found for domain:
               |       Read persona file on demand
               |       Announce: "[Name] joining for [domain] perspective"
               |       Add to active roster
               |       Persona contributes from this point
               |
               +---> No persona found:
                       Note gap: "This would benefit from [domain],
                       but no persona is configured for that"
```

## 5. Override-by-Copy Resolution Flow

```
[Scan src/claude/agents/persona-*.md]
       |
       v
[Build builtInMap: Map<filename, {path, version, content}>]
       |
       v
[Scan .isdlc/personas/*.md]
       |
       v
[For each user file:]
       |
       +---> Filename in builtInMap?
       |       YES: Override (use user file)
       |             Compare user.version vs builtin.version
       |             If builtin is newer: add DriftWarning
       |       NO: Add as new persona
       |
       v
[Return merged persona list + DriftWarning[]]
```

## 6. Version Drift Notification Flow

```
[DriftWarning[] from persona loading]
       |
       v
[Roundtable Agent Start]
       |
       v
[If warnings exist (all modes, including silent):]
       |
       "Note: Your override of security-reviewer.md is based on
        v1.0.0 but the framework now ships v1.1.0. Review the changes?"
       |
       v
[Proceed with analysis (non-blocking)]
```
