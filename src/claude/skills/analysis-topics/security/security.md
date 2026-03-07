---
topic_id: "security"
topic_name: "Security Considerations"
primary_persona: "solutions-architect"
contributing_personas:
  - "system-designer"
coverage_criteria:
  - "Authentication and authorization requirements assessed"
  - "Data protection needs identified (encryption, sanitization, PII handling)"
  - "Input validation strategy defined for all external inputs"
  - "Dependency security evaluated (known vulnerabilities, supply chain)"
  - "Threat model considered for the change's attack surface"
artifact_sections:
  - artifact: "requirements-spec.md"
    sections: ["5. Quality Attributes and Risks"]
  - artifact: "architecture-overview.md"
    sections: ["2. Selected Architecture"]
  - artifact: "error-taxonomy.md"
    sections: ["security-related error codes"]
depth_guidance:
  brief:
    behavior: "High-level security checklist. Assess auth, data protection, and input validation at surface level."
    acceptance: "Security implications considered. Critical concerns flagged if present."
    inference_policy: "Infer security posture from existing codebase patterns (auth flows, validation, dependency audit). Tag inferences as Medium confidence."
  standard:
    behavior: "Security assessment per concern area. Evaluate auth, data protection, input validation, and dependencies."
    acceptance: "All coverage criteria met. Threat model proportionate to change risk. Dependency security evaluated."
    inference_policy: "Infer only standard security patterns from existing codebase. Tag inferences as Medium confidence."
  deep:
    behavior: "Full threat model with attack surface analysis. STRIDE methodology. Evaluate all concern areas exhaustively."
    acceptance: "All coverage criteria met with exhaustive detail. Threat actors identified. All attack vectors assessed."
    inference_policy: "Minimize inference. Assess each security concern against actual code. Only infer standard security defaults."
source_step_files: []
---

## Analytical Knowledge

### Authentication and Authorization

- Does this change affect authentication flows? (Login, session management, token handling)
- Does this change introduce new authorization checks? (Role-based, permission-based)
- Are there any privilege escalation risks?
- Does the change handle credentials, API keys, or secrets?
- Are session management practices sound? (Timeout, invalidation, secure cookies)

### Data Protection

- Does this change handle sensitive data? (PII, financial, health)
- Is encryption needed? (At rest, in transit)
- Are there data sanitization requirements? (Preventing injection, XSS, path traversal)
- Does the change involve data retention or deletion policies?
- Are there compliance requirements? (GDPR, HIPAA, PCI-DSS)

### Input Validation

- What are all the external inputs this change processes?
- For each input: what validation is applied? What happens on invalid input?
- Are there any injection vectors? (SQL, command, path, template)
- Is output encoding applied where needed? (HTML, URL, JSON)
- Are file uploads handled? If so: type validation, size limits, path sanitization

### Dependency Security

- Does this change introduce new dependencies?
- Are existing dependencies up to date? Known CVEs?
- Is there a dependency review process?
- Are there supply chain risks? (Compromised packages, typosquatting)

### Threat Modeling

- What is the attack surface of this change?
- Who are the potential threat actors? (External attackers, malicious insiders, automated bots)
- What are the highest-value targets? (Data, functionality, availability)
- What are the most likely attack vectors?
- Are there any security controls that this change bypasses or weakens?

## Validation Criteria

- Security implications of the change have been considered
- If the change handles sensitive data: encryption and sanitization requirements documented
- If the change processes external input: validation strategy defined
- If new dependencies introduced: security evaluation completed
- Threat model is proportionate to the change's risk level

## Artifact Instructions

- **requirements-spec.md** Section 5: Include security-related quality attributes and risks
- **architecture-overview.md** Section 2: Include security considerations in ADR consequences
- **error-taxonomy.md**: Include security-related error codes (authentication failures, authorization denied, input validation errors)
