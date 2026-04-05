---
name: priority-scoring
description: Score targets by risk, business impact, and test coverage
skill_id: RE-008
owner: feature-mapper
collaborators: []
project: sdlc-framework
version: 1.0.0
when_to_use: Prioritizing which code to reverse engineer first
dependencies: []
---

# Priority Scoring

## Purpose
Score and prioritize code targets for reverse engineering based on risk factors, business criticality, test coverage gaps, and complexity. This ensures the most important and risky code paths are documented and tested first.

## When to Use
- Starting a reverse engineering effort
- Triaging what to analyze first
- Reporting coverage priorities
- Resource allocation decisions

## Prerequisites
- Feature map from discover
- Test evaluation report (coverage data)
- Git history (for change frequency)

## Process

### Step 1: Calculate Business Criticality Score (30%)
```
Factors:
- Revenue impact (payments, orders, subscriptions)
- User impact (authentication, registration, profiles)
- Compliance requirements (PII handling, audit logs)
- Core domain (primary business function)

Scoring:
- 100: Revenue/payment processing
- 90: Authentication/authorization
- 80: Core business domain
- 70: User-facing features
- 50: Supporting features
- 30: Internal tools
- 10: Utilities/helpers
```

### Step 2: Calculate Test Coverage Gap Score (25%)
```
Factors:
- Current test coverage percentage
- Presence of unit tests
- Presence of integration tests
- Presence of E2E tests

Scoring:
- 100: 0% coverage, no tests
- 80: <20% coverage
- 60: 20-50% coverage
- 40: 50-80% coverage
- 20: 80-95% coverage
- 0: >95% coverage
```

### Step 3: Calculate Complexity Score (20%)
```
Factors:
- Cyclomatic complexity
- Number of dependencies
- Lines of code
- Nesting depth
- Number of branches

Scoring:
- 100: Cyclomatic complexity > 20
- 80: Cyclomatic complexity 15-20
- 60: Cyclomatic complexity 10-15
- 40: Cyclomatic complexity 5-10
- 20: Cyclomatic complexity < 5
```

### Step 4: Calculate Change Frequency Score (15%)
```
Factors:
- Number of commits in last 6 months
- Number of distinct authors
- Recent bug fixes
- Open issues related to code

Scoring:
- 100: >20 commits, multiple bugs fixed
- 80: 10-20 commits
- 60: 5-10 commits
- 40: 2-5 commits
- 20: 1 commit
- 0: No changes in 6 months
```

### Step 5: Calculate External Dependency Score (10%)
```
Factors:
- Number of external API calls
- Database operations
- Message queue interactions
- File system operations

Scoring:
- 100: Multiple external services + DB + queue
- 80: External API + database
- 60: Database operations only
- 40: Cache/file operations
- 20: Event emissions only
- 0: Pure functions, no side effects
```

### Step 6: Calculate Final Priority Score
```
Priority = (Business × 0.30) + (Coverage × 0.25) +
           (Complexity × 0.20) + (Changes × 0.15) +
           (External × 0.10)

Priority Tiers:
- P0 (Critical): Score 80-100
- P1 (High): Score 60-79
- P2 (Medium): Score 40-59
- P3 (Low): Score 0-39
```

## Domain-Based Criticality

### High Criticality Domains
| Domain | Base Score | Rationale |
|--------|------------|-----------|
| Payments | 100 | Revenue, compliance |
| Authentication | 95 | Security, access control |
| User Management | 90 | PII, account security |
| Orders | 85 | Core business, revenue |
| Inventory | 80 | Business operations |
| Notifications | 70 | User experience |

### Medium Criticality Domains
| Domain | Base Score | Rationale |
|--------|------------|-----------|
| Reporting | 50 | Business intelligence |
| Search | 50 | User experience |
| Admin Panel | 45 | Internal tools |
| Logging | 40 | Operations |

### Low Criticality Domains
| Domain | Base Score | Rationale |
|--------|------------|-----------|
| Documentation | 20 | Non-functional |
| Utilities | 15 | Supporting code |
| Migrations | 10 | One-time execution |

## Scoring Example

```markdown
## Target: PaymentController.processPayment

### Factor Scores

| Factor | Weight | Score | Weighted |
|--------|--------|-------|----------|
| Business Criticality | 30% | 100 | 30.0 |
| Test Coverage Gap | 25% | 80 | 20.0 |
| Complexity | 20% | 60 | 12.0 |
| Change Frequency | 15% | 40 | 6.0 |
| External Dependencies | 10% | 100 | 10.0 |
| **Total** | | | **78.0** |

### Priority: P1 (High)

### Scoring Rationale
- **Business Criticality (100)**: Payment processing, direct revenue impact
- **Test Coverage Gap (80)**: Only 15% test coverage, no integration tests
- **Complexity (60)**: Cyclomatic complexity of 12, multiple branches
- **Change Frequency (40)**: 4 commits in last 6 months
- **External Dependencies (100)**: Stripe API, database, event queue
```

## Priority Report Format

```markdown
# Reverse Engineering Priority Report

Generated: {timestamp}
Total Targets: 45

## Summary by Priority

| Priority | Count | Percentage |
|----------|-------|------------|
| P0 Critical | 8 | 18% |
| P1 High | 15 | 33% |
| P2 Medium | 14 | 31% |
| P3 Low | 8 | 18% |

## P0 Critical Targets

| Target | Score | Business | Coverage | Complexity |
|--------|-------|----------|----------|------------|
| PaymentController.processPayment | 92 | 100 | 100 | 80 |
| AuthService.validateToken | 88 | 95 | 90 | 60 |
| OrderService.createOrder | 85 | 85 | 80 | 80 |
| UserService.updateProfile | 82 | 90 | 70 | 60 |

## P1 High Targets

| Target | Score | Business | Coverage | Complexity |
|--------|-------|----------|----------|------------|
| InventoryService.reserveStock | 75 | 80 | 60 | 80 |
| NotificationService.sendEmail | 72 | 70 | 80 | 50 |
...

## Recommended Order

Based on priority scores and dependencies:

1. **PaymentController.processPayment** (P0, Score: 92)
   - Critical path, lowest coverage
   - No dependencies on other untested code

2. **AuthService.validateToken** (P0, Score: 88)
   - Used by most authenticated endpoints
   - Test first to enable other testing

3. **OrderService.createOrder** (P0, Score: 85)
   - Core business flow
   - Depends on: InventoryService (P1)
```

## Inputs
| Input | Type | Required | Description |
|-------|------|----------|-------------|
| targets | Array | Yes | List of targets to score |
| coverage_report | Object | Optional | Test coverage data |
| git_history | Object | Optional | Commit history |
| domain_map | Object | Optional | Domain classifications |

## Outputs
| Output | Type | Description |
|--------|------|-------------|
| scored_targets | Array | Targets with priority scores |
| priority_breakdown | Object | P0/P1/P2/P3 counts |
| recommended_order | Array | Suggested analysis order |

## Project-Specific Considerations
- Adjust domain criticality scores based on project context (e.g., healthcare prioritizes compliance over revenue)
- Consider regulatory requirements (PCI-DSS, HIPAA, GDPR) when scoring business criticality
- Factor in upcoming deadlines or release schedules for time-sensitive code
- Account for team knowledge - code owned by departed team members may need higher priority
- Include technical debt indicators if available from static analysis tools

## Integration Points
- **Behavior Analyzer (R1)**: Receives prioritized target list for extraction order
- **Test Evaluator (D2)**: Consumes coverage data from test evaluation report
- **Feature Mapper (D6)**: Uses domain mapping from feature discovery
- **Orchestrator**: Reports priority breakdown for workflow planning
- **ATDD Workflow**: P0/P1 targets recommended for downstream ATDD consumption (atdd-bridge runs by default when `atdd.enabled: true` in `.isdlc/config.json`)

## Validation
- All targets scored
- Factors consistently weighted
- Edge cases handled
- Rationale documented
