# Harnesses Are Not Enough: What Comes After AI Writes All the Code

*The industry figured out how to make AI agents productive. The next question is harder: how do you make them trustworthy?*

---

In February 2026, OpenAI published a blog post that gave a name to something many of us had been building in the dark. They called it **harness engineering** — the discipline of designing environments that constrain what an AI agent can do, inform it about what it should do, verify that it did it correctly, and correct it when it goes wrong.

The numbers were staggering. Three engineers. Five months. A million lines of production code. Zero manually written source files.

The post crystallised an insight that had been forming across the industry: the bottleneck was never the agent's ability to write code. It was the lack of structure surrounding it.

But here's what I've been thinking about since: **a harness solves the throughput problem. It doesn't solve the trust problem.**

---

## What a Harness Gets Right

OpenAI identified three pillars, and they're exactly right.

**Context engineering** — the agent can only act on what it can see. If your architectural decisions live in Slack threads, your naming conventions live in someone's head, and your deployment process lives in a wiki nobody updates, the agent is flying blind. Harness engineering says: put everything in the repo. `AGENTS.md`, structured docs, cross-linked design specifications validated by linters. From the agent's perspective, anything it can't access in-context doesn't exist.

**Architectural constraints** — rather than telling the agent to "write good code," you mechanically enforce what good code looks like. Dependency layers. Structural tests. Custom linters that catch violations before they land. The counterintuitive finding: constraining the solution space makes agents *more* productive, not less. Clear boundaries reduce token waste exploring dead ends.

**Entropy management** — code decays. Documentation drifts. Naming conventions diverge. Harness engineering addresses this with scheduled cleanup agents that run on cadence — verifying docs match code, scanning for constraint violations, enforcing pattern consistency.

These three pillars work. They turn a powerful but directionless model into a productive contributor. LangChain demonstrated this concretely: by changing only the harness (not the model), their coding agent jumped from 52.8% to 66.5% on Terminal Bench 2.0 — from Top 30 to Top 5.

If you're building software with AI agents and you don't have a harness, start here. This is table stakes.

But it's not the finish line.

---

## The Question the Harness Doesn't Answer

OpenAI's experiment produced a million lines of code. The code compiles, passes tests, and ships to production. Impressive.

Now imagine you're a regulated enterprise. Or a defence contractor. Or a healthcare company. Or simply a team that needs to maintain this system for the next five years. You have some questions:

**Does the code implement what was specified?** Not "does it work" — does it implement the *specific requirements* that were agreed upon? Can you trace from a business requirement through design decisions through test cases to the exact lines of code that implement it? A harness doesn't track requirements. It tracks code quality.

**Did anyone verify the architect's decisions?** In a harness, one agent (or one engineer) makes architectural choices and the linter checks they don't violate dependency rules. But who checks whether the architecture was *the right choice*? Who challenges the tradeoffs? In a team of humans, the senior engineer reviews the junior's architecture. In a harnessed agent, the architecture is whatever the agent decided within the constraints.

**Can you prove security was assessed?** Not "the linter didn't flag anything" — can you demonstrate that a security-focused review occurred, that threat modelling was performed, that the specific attack surface of this change was evaluated? Compliance auditors don't accept "the agent passed CI."

**Why was this decision made?** When something breaks in production eighteen months from now and someone asks "why did we build it this way?" — is there a trail? Architecture Decision Records? A design document that explains the tradeoffs? Or just a git history of agent-generated PRs with commit messages that say "implement feature X"?

A harness ensures the agent writes *correct code*. It doesn't ensure the agent builds *the right thing*, that the right thing was *verified*, or that the verification is *provable*.

---

## From Harness to Lifecycle

What I've been building — and what I believe the industry will converge on — is the layer that sits on top of the harness. Call it lifecycle engineering, process engineering, or governed AI development. The name matters less than the shift in what we're optimising for.

A harness optimises for **throughput with quality constraints**.
A lifecycle optimises for **verified, traceable, auditable software delivery**.

Here's how each harness concept extends:

### Context Engineering Becomes an Artifact Pipeline

In a harness, context is documentation. `AGENTS.md`, architecture specs, style guides — static files the agent reads before it starts.

In a lifecycle, context is a *structured pipeline of artifacts*. Requirements specifications flow into impact analyses, which flow into architecture decisions, which flow into detailed designs, which flow into test strategies, which flow into code. Each artifact is a first-class deliverable with its own quality gate.

This isn't bureaucracy — it's the same principle as the harness (agents need context to be effective) applied to the full development process, not just the coding step. An agent writing code is more effective when it can read the test strategy that was written by a different agent who read the design spec that was reviewed against the architecture that was evaluated against the requirements.

The pipeline IS the context. And because each stage produces a concrete artifact, you get traceability for free.

### Constraints Become Constitutional Governance

A harness enforces constraints through linters and structural tests. "Dependencies flow left to right." "No function exceeds 50 lines." Mechanical, deterministic, binary.

A lifecycle elevates this to governance. Think of it as a project constitution — a set of immutable articles that every agent in every phase must uphold. Not just code constraints, but process constraints:

- *Specification Primacy*: Code serves specifications. Any deviation must be documented and justified.
- *Test-First Development*: Tests must exist before implementation. Not after. Not "we'll add them later."
- *Security by Design*: Security considerations must precede implementation decisions. Not a scan after the fact.
- *Artifact Traceability*: Every code element must trace back to a requirement. No orphan code. No orphan requirements.

Constitutional articles are enforced at phase boundaries — you literally cannot advance from design to implementation if the security assessment hasn't been completed. This is a stronger guarantee than a linter. A linter checks code style. A constitution checks process integrity.

### Entropy Management Becomes Continuous Verification

Harness engineering's entropy management runs cleanup agents on a schedule. Good. But entropy in software isn't just code drift — it's *requirements drift*, *architecture drift*, *documentation drift*, and *process drift*.

A lifecycle extends entropy management in two directions:

**Between workflows**: Scheduled sweep agents detect doc-code inconsistencies, constitution violations in recent commits, pattern drift, dead code, and orphan artifacts. Similar to harness entropy management, but scoped to the full artifact pipeline — not just code.

**Across time**: Specification reconciliation — periodically verifying that the codebase still implements the requirements it claims to. Code evolves through bug fixes, refactors, and quick patches. Requirements documents don't always keep up. A lifecycle framework can detect when spec and code have diverged and flag the gap.

### Single Agent Becomes Specialised Teams

This is perhaps the most significant evolution.

In a harness, you have one powerful agent constrained by an environment. The same agent writes the code, generates the tests, and responds to review feedback.

In a lifecycle, you have specialised agents with distinct expertise. A requirements analyst that thinks about user needs and acceptance criteria. A solution architect that evaluates tradeoffs and makes technology decisions. A test design engineer that creates test strategies from requirements. A security auditor that evaluates the attack surface. A quality engineer that reviews the implementation.

And critically: these agents *challenge each other*. A creator agent produces an artifact. A critic agent reviews it for gaps, inconsistencies, and blind spots. A refiner agent incorporates the critique and produces an improved version. This debate loop runs until the artifact meets quality standards.

No single agent is trusted unconditionally. Every artifact passes through verification by a differently-configured agent with a different objective function. This is the AI equivalent of code review, design review, and architecture review — except it happens at every phase, not just at the PR stage.

---

## When Each Layer Makes Sense

Not every project needs a full lifecycle. The right level of engineering depends on what you're building and the consequences of getting it wrong.

**No harness** — you're experimenting. Prototyping. Exploring. The agent writes code, you eyeball it, you ship it. Fine for side projects, hackathons, and throwaway scripts. Most AI-assisted coding today lives here.

**Basic harness** — you're building something real but the stakes are moderate. `CLAUDE.md` with project conventions. Pre-commit hooks for linting. A test suite the agent can self-verify against. Clear directory structure. This prevents the most common agent mistakes and gives you consistent output. Takes a few hours to set up. Every professional project should have at least this.

**Full harness** — you're building at scale with a team. Architectural constraints enforced by CI. Structural tests. Documentation-as-code validated by linters. Entropy management agents. Agent-specific review checklists. This is what OpenAI described. It works for teams that are primarily optimising for development velocity with a known architecture.

**Lifecycle framework** — you need more than velocity. You need traceability from requirements through deployment. You need provable security assessment. You need multi-agent verification, not just linter validation. You need an audit trail that answers "why was it built this way?" You need constitutional governance that ensures process integrity, not just code quality. This is where regulated industries, enterprise software, and long-lived systems need to operate.

The lifecycle doesn't replace the harness. It contains it. Context engineering, architectural constraints, and entropy management are all still there — they're the foundation. The lifecycle adds the governance, verification, and traceability layers that turn agent output from "probably correct code" into "verified, traceable, auditable software."

---

## The Emerging Landscape

I'm not the only one thinking about this. A growing ecosystem of frameworks is converging on the same insight — that AI-assisted development needs more structure than a harness provides. What's interesting is how differently each project interprets "more structure."

### Spec-Driven Development

The lightest approach is what Martin Fowler calls **spec-driven development** (SDD): write a specification first, then let the agent implement it. The specification becomes the contract between human intent and machine output.

**Kiro** (AWS) is the gentlest entry point. You write requirements, it generates a design, then breaks implementation into tasks that reference back to requirements by number. It's traceability through convention — lightweight, effective for small projects, but with no enforcement mechanism if the agent drifts.

**cc-sdd** takes the same Kiro-style approach and makes it work across eight different AI coding agents. Write a spec, get an implementation. The spec is the harness.

**Tessl** pushes further into what Fowler calls "spec-as-source" — the specification isn't just an input to the agent, it *is* the source of truth. Code is generated from specs, and changes flow bidirectionally. `@generate` and `@test` tags in the spec trigger code generation. It's an ambitious vision, though it focuses on the spec-to-code link rather than the full development process.

These tools solve a real problem: they give the agent a target to aim at. But they don't address verification, security assessment, or multi-agent review. The specification is trusted because a human wrote it. The implementation is trusted because it matches the spec. Nobody challenges whether the spec was complete.

### Multi-Agent Lifecycle Frameworks

The next tier introduces multiple specialised agents, phase-based workflows, and some form of governance.

**BMAD** (Breakthrough Method of Agile AI-Driven Development) is the most mature framework in this space. Version 6 deploys 19+ specialised agents — a product manager, an architect, a tech lead, developers, QA — orchestrated through a structured workflow. What makes BMAD interesting is its approach to enforcement: **Control Manifests** that restrict which files each agent can access, combined with Claude Code's Agent Teams SDK for tool-level restrictions. BMAD also implements adversarial review through what its creator calls "the agent that says no" — a dedicated QA agent that challenges other agents' outputs. Recent versions add Langfuse integration for observability and a "party mode" for rapid prototyping that relaxes the governance constraints.

**GitHub Spec Kit** approaches the problem from a different angle: cross-artifact consistency. Its `/analyze` command checks whether requirements, architecture, and implementation actually agree with each other — catching the kind of drift that happens when artifacts are written at different times by different agents (or people). Spec Kit also introduces `/checklist`, which it describes as "unit tests for English" — automated validation that natural language specifications meet quality standards. It has a constitution concept, though enforcement is advisory rather than blocking.

**AWS AI-DLC** (AI-Driven Development Lifecycle) takes an adaptive approach with three workflow phases (Inception, Construction, Operations) that flex based on project context. Its distinguishing feature is platform independence — it works across six different AI coding platforms, using file-based rules rather than platform-specific enforcement hooks.

Each of these frameworks represents genuine progress beyond the harness. They introduce requirements as first-class artifacts. They deploy multiple agents with different roles. They implement some form of review or challenge process.

### Where the Differences Matter

The honest assessment is that these frameworks are converging. BMAD's Control Manifests and adversarial QA agent are solving the same problem as constitutional governance — ensuring agents don't skip steps or produce unchallenged work. Spec Kit's cross-artifact analysis is solving the same problem as traceability matrices — ensuring the pieces fit together.

The differences that remain are differences of *degree* and *mechanism*:

**Enforcement rigor.** BMAD restricts agent access at the SDK level — agents physically cannot touch files outside their manifest. Spec Kit's constitution is advisory — agents should follow it, but nothing prevents them from proceeding if they don't. A hook-based enforcement system makes governance deterministic: the phase literally cannot advance until conditions are met, regardless of what the agent decides.

**Structured debate.** BMAD has "the agent that says no." But there's a difference between a QA agent that reviews the final output and a formal creator→critic→refiner loop that runs at every phase. When every artifact — requirements, architecture, design, test strategy — passes through structured debate before advancing, the verification is deeper and earlier.

**Traceability depth.** Most frameworks trace from requirements to code. Fewer maintain a formal matrix from FR→AC→test case→code element that updates as artifacts evolve. The question isn't whether traceability exists, but whether it's mechanical (the framework maintains it) or aspirational (the agents are told to maintain it).

**Process prescription.** Adaptive frameworks like AI-DLC flex their workflow based on context — sometimes you need heavy process, sometimes you don't. Prescribed frameworks define fixed phase sequences with non-skippable gates. The tradeoff is flexibility versus auditability. If a compliance auditor asks "was a security assessment performed for every change?" a prescribed process can answer definitively. An adaptive process can answer "usually."

None of these differences make one framework universally better. They make different frameworks better for different contexts. A startup prototyping its MVP doesn't need prescribed phase gates. A defence contractor building mission-critical software does.

### The Convergence

What's telling is the direction of travel. Every framework that starts simple eventually adds governance. Kiro added requirement tracing. BMAD added Control Manifests and adversarial review. Spec Kit added constitutional governance and cross-artifact analysis.

The industry is converging on a common set of capabilities: specifications as first-class artifacts, multiple specialised agents, some form of review or challenge process, and traceability from intent to implementation. The open questions are about enforcement mechanism, verification depth, and how much process is appropriate for a given context.

This convergence validates the core thesis: harnesses aren't enough. The question is no longer whether we need lifecycle governance — it's how much, enforced how.

---

## The Uncomfortable Implication

Here's what this means for engineering teams:

If 2025 was the year AI agents proved they could write code, and 2026 is the year we learned the harness is the hard part — then the next realisation is this:

**The harness is necessary but not sufficient. The hard part after the harness is governance.**

Not governance in the bureaucratic sense. Governance in the engineering sense — the systems, processes, and verification mechanisms that let you trust the output of autonomous agents at scale.

We've solved "can the agent write code?" (yes). We've solved "can we make the agent's code consistent and correct?" (yes, with a harness). The open question is: "can we prove that the agent built the right thing, the right way, and we can explain why?"

That's the problem lifecycle engineering solves. And it's the problem every team will face as they move from "AI helps me code" to "AI builds our systems."

---

## Where This Goes

Martin Fowler, reflecting on OpenAI's harness engineering post, imagined a future where teams pick from a set of harnesses for common application topologies — like today's service templates, but for agent-assisted development.

I think he's right, and I think it goes further. Harnesses will become the service templates. And lifecycle frameworks will become the development methodology — the way a team encodes not just "how should the code look" but "how should the software be built, verified, and governed."

The horse metaphor from harness engineering is apt. The AI is the horse — powerful, fast, directionless. The harness is the reins — constraints and feedback that keep the horse on the road.

But a harness and a horse don't give you a destination. They don't give you a route. They don't tell you when to stop and check the map. They don't verify you arrived where you intended.

For that, you need a journey plan. And that's what comes after the harness.

---

*I'm building an open-source lifecycle framework that implements these ideas. If the evolution from harness to lifecycle resonates with how you're thinking about AI-assisted development, I'd love to hear from you.*
