# Security Architecture: Backlog Management Integration

**Feature:** REQ-0008-backlog-management-integration
**Phase:** 03-architecture
**Created:** 2026-02-14

---

## 1. Security Overview

This feature has a **low security surface area** because:
1. All external API communication is delegated to the Atlassian MCP server (managed by Atlassian and Claude Code)
2. The iSDLC framework never handles, stores, or transmits authentication credentials
3. Data flows are read-heavy (Jira/Confluence to local) with minimal write-back (status transitions only)
4. No user-facing authentication flows are introduced

---

## 2. Authentication Architecture

### 2.1 Authentication Flow

```
Developer
  |
  v
Claude Code CLI
  |
  +-- claude mcp add atlassian https://mcp.atlassian.com/v1/sse
  |     (one-time setup, OAuth2 flow handled by MCP server)
  |
  v
Atlassian MCP Server (external)
  |
  +-- OAuth2 token management
  +-- Atlassian account authentication
  +-- Token refresh (automatic)
  +-- Re-authentication prompts (when token expires)
  |
  v
Jira Cloud API / Confluence Cloud API
```

**Key Security Decision:** The iSDLC framework **never touches authentication**. The entire auth lifecycle is managed by:
- **Claude Code** -- MCP server configuration and lifecycle
- **Atlassian MCP Server** -- OAuth2 token management, refresh, re-authentication

This is the most secure design: zero credential surface in the framework code.

### 2.2 MCP Prerequisite Check

Before any Jira/Confluence operation, the CLAUDE.md instructions direct Claude Code to verify MCP availability:

1. Check if `atlassian` MCP server is registered in Claude Code configuration
2. If not registered: display setup instructions, do not attempt any API calls
3. If registered but auth expired: MCP server returns auth error, framework displays re-auth instructions

**Fail-Safe (Article X):** If MCP check fails for any reason, the framework defaults to local-only mode. No Jira operations are attempted.

---

## 3. Authorization Model

### 3.1 Access Control

The framework operates under the **developer's own Jira/Confluence permissions**. There is no framework-level authorization layer.

| Operation | Required Jira Permission | Scope |
|-----------|------------------------|-------|
| Read ticket (getTicket) | Browse Projects | Read-only |
| Read Confluence page (getLinkedDocument) | View Space | Read-only |
| Transition ticket (updateStatus) | Transition Issues | Write (status only) |

**Principle of Least Privilege (Article X):**
- The framework only requests the minimum operations needed
- Read operations (browse, view) for all data retrieval
- Write operations (transition) only for status sync on workflow completion
- The framework NEVER creates, deletes, or modifies ticket content in Jira
- The framework NEVER writes to Confluence

### 3.2 One-Way Content Flow (CON-003)

```
Jira        --[read title, description, priority, status]--> BACKLOG.md
Confluence  --[read page content]----------------------------> Requirements context
BACKLOG.md  --[transition status to Done]--------------------> Jira (status ONLY)
```

**Security invariant:** Content flows FROM external systems INTO the framework. The framework NEVER writes content back to Jira or Confluence. Only atomic status transitions flow outward.

---

## 4. Data Protection

### 4.1 Data at Rest

| Data | Storage | Encryption | Sensitivity |
|------|---------|-----------|-------------|
| Jira ticket titles/descriptions | BACKLOG.md (git-tracked) | None (user's responsibility) | Low-Medium (ticket titles are not secrets) |
| Confluence page content | In-memory only (requirements context) | N/A (never persisted) | Medium (may contain proprietary specs) |
| Jira ticket ID | BACKLOG.md + state.json | None | Low (ticket IDs are not sensitive) |
| MCP auth tokens | Claude Code config (managed by Claude Code) | Claude Code's encryption | High (never touched by framework) |

**Key Decision:** Confluence page content is injected as **ephemeral context** for the requirements agent. It is never written to disk. It exists only in the LLM conversation context for the duration of Phase 01 requirements elicitation.

### 4.2 Data in Transit

| Path | Transport | Encryption | Managed By |
|------|-----------|-----------|------------|
| Developer <-> Claude Code | Local process | N/A (same machine) | Claude Code |
| Claude Code <-> Atlassian MCP | HTTPS (SSE) | TLS 1.2+ | Atlassian MCP |
| Atlassian MCP <-> Jira/Confluence | HTTPS | TLS 1.2+ | Atlassian |
| Framework <-> BACKLOG.md | Local filesystem | None (user's responsibility) | Framework |

All external communication uses HTTPS with TLS, managed entirely by the MCP infrastructure.

### 4.3 Secrets Management

The iSDLC framework manages **zero secrets** for this feature:

| Secret | Owner | Storage |
|--------|-------|---------|
| Jira/Confluence OAuth2 tokens | Atlassian MCP Server | MCP server internal state |
| Atlassian API credentials | Atlassian MCP Server | OAuth2 flow (browser-based) |
| Claude Code API key | Claude Code | Claude Code config |

**Article III Compliance:** No secrets are committed to the repository. No secrets are stored in framework files. No secrets are logged.

---

## 5. Threat Model (STRIDE)

### 5.1 Threat Analysis

| Threat | Category | Risk | Mitigation |
|--------|----------|------|------------|
| Malicious Jira ticket content injected into BACKLOG.md | Tampering | Low | BACKLOG.md is markdown -- no code execution. Descriptions truncated to 200 chars. |
| Confluence page content with malicious instructions | Tampering | Medium | Content is context for LLM, not executed as code. LLM has its own safety boundaries. Truncate large pages. |
| MCP auth token theft | Information Disclosure | Low | Tokens managed by Atlassian MCP, not by framework. Framework has no access to tokens. |
| Unauthorized Jira status transition | Elevation of Privilege | Low | Uses developer's own Jira permissions. Framework cannot escalate beyond the user's access level. |
| MCP server spoofing | Spoofing | Very Low | MCP server URL is configured by the user. TLS certificate validation prevents MITM. |
| Denial of service via large Confluence page | Denial of Service | Low | Truncate Confluence content to reasonable size (configurable, default ~5000 chars). |
| BACKLOG.md data exfiltration via Jira sync | Information Disclosure | Very Low | Only ticket ID and status transition are sent to Jira. No BACKLOG.md content is uploaded. |

### 5.2 Risk Mitigations

**Content Injection (Tampering):**
- Jira descriptions are truncated to 200 characters (FR-002)
- Confluence content is used as LLM context only, never executed
- BACKLOG.md is markdown -- no script execution risk
- Git tracking provides full audit trail and revert capability

**Auth Resilience (NFR-005):**
- MCP auth failures produce actionable error messages
- Framework never caches or stores auth state
- Re-authentication is handled by the MCP server's OAuth2 flow
- Known issue: SSE transport requires frequent re-auth. Mitigated by clear instructions.

---

## 6. Compliance Considerations

### 6.1 Data Handling

| Regulation | Applicability | Notes |
|------------|--------------|-------|
| GDPR | Low | Jira ticket data may contain personal data (assignee names). BACKLOG.md is local-only. Data subject requests handled at Jira level. |
| SOC 2 | N/A | Framework is a local CLI tool, not a SaaS service |
| HIPAA | N/A | Not a healthcare application |
| PCI-DSS | N/A | No payment data handled |

### 6.2 Audit Trail

All workflow completions with Jira sync are recorded in `state.json > workflow_history`:
- `jira_ticket_id`: Which ticket was associated
- `jira_sync_status`: Whether sync succeeded (`synced`) or failed (`failed`)
- `completed_at`: When the workflow completed
- `merged_commit`: Git commit hash for traceability

---

## 7. Security Review Checklist

- [x] No secrets stored in framework code or config
- [x] No authentication handled by the framework
- [x] All external communication via TLS (MCP server)
- [x] Content injection mitigated (truncation, markdown-only)
- [x] Principle of least privilege (read-only for data, status-only for writes)
- [x] One-way content flow (CON-003) prevents data leakage
- [x] Graceful degradation on auth failure (NFR-005)
- [x] Audit trail in state.json workflow_history
- [x] No user-facing auth flows introduced
- [x] Article III (Security by Design) compliance verified
- [x] Article X (Fail-Safe Defaults) compliance verified
