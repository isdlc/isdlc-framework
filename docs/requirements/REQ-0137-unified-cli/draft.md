# Unified CLI with provider auto-detection

| Field       | Value                                      |
|-------------|--------------------------------------------|
| ID          | REQ-0137                                   |
| Slug        | REQ-0137-unified-cli                       |
| GitHub      | GH-203                                     |
| Codex       | CODEX-068                                  |
| Workstream  | G                                          |
| Phase       | 10                                         |
| Depends on  | REQ-0134, REQ-0135, REQ-0136              |

## Summary

bin/isdlc.js detects active provider, loads runtime adapter, passes to core orchestration. Single entry point for all providers. On init/install, auto-detects or accepts explicit --provider flag to configure and generate the appropriate system instruction file.
