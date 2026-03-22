# Provider instruction generation (CLAUDE.md/CODEX.md/cursorrules)

| Field       | Value                                      |
|-------------|--------------------------------------------|
| ID          | REQ-0136                                   |
| Slug        | REQ-0136-provider-instruction-generation   |
| GitHub      | GH-202                                     |
| Codex       | CODEX-067                                  |
| Workstream  | G                                          |
| Phase       | 10                                         |
| Depends on  | REQ-0128, REQ-0099, REQ-0100, REQ-0101, REQ-0102 |

## Summary

On install, generate provider-specific system instructions file. Uses content classifications from Phase 5 to extract RoleSpec sections and provider-specific RuntimePackaging templates. Produces CLAUDE.md, CODEX.md, .cursorrules, or .windsurfrules depending on the active provider.
