# Error Taxonomy: Knowledge Management Service (GH-263)

| Code | Description | Trigger | Severity | Recovery |
|---|---|---|---|---|
| ERR-CONN-001 | Source unreachable | Connector can't reach Git/SVN/Confluence/URL | Warning | Log in refresh history, skip source, continue with others |
| ERR-CONN-002 | Authentication failed | Invalid credentials for source | Error | Log error, notify via web UI, skip source |
| ERR-MODEL-001 | Model load failed | ONNX file corrupt or incompatible | Error | Fall back to cloud API if configured, otherwise fail job |
| ERR-MODEL-002 | Cloud API error | Rate limit, auth failure, network | Warning | Retry with backoff (3 attempts), then fail job |
| ERR-MODEL-003 | Model not found | Requested model not downloaded | Error | Prompt download via web UI |
| ERR-VDB-001 | Vector DB unreachable | Remote DB down or credentials invalid | Error | Fail job, notify via web UI |
| ERR-VDB-002 | Index corrupt | Local DB file damaged | Error | Delete index, trigger full rebuild |
| ERR-VDB-003 | Write failed | Disk full or permission error | Error | Fail job, log disk usage |
| ERR-QUEUE-001 | Job failed max retries | 3 consecutive failures | Error | Move to dead letter, notify via web UI |
| ERR-QUEUE-002 | Queue database locked | Concurrent access conflict | Warning | Retry after 100ms, max 5 retries |
| ERR-CORR-001 | Correlation failed | Unable to match sources | Warning | Embed without correlation (degraded) |
| ERR-API-001 | Invalid project | Unknown project ID in request | Error | Return 404 / MCP INVALID_PROJECT |
| ERR-API-002 | No index | Project exists but has no embeddings | Warning | Return empty results with NO_INDEX code |
| ERR-API-003 | Content too large | add_content payload exceeds limit | Error | Return 413 / MCP CONTENT_TOO_LARGE |
| ERR-SETUP-001 | Prerequisite missing | Node.js version too old, disk space insufficient | Error | Display requirement, exit setup |
| ERR-SETUP-002 | Model download failed | Network error during model download | Warning | Retry, offer skip + cloud API alternative |
| ERR-SETUP-003 | Vector DB install failed | Package install or connectivity validation failed | Error | Display error, offer alternative backend |
