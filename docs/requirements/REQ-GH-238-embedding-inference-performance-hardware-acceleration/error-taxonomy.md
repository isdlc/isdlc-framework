# Error Taxonomy: REQ-GH-238

| Code | Description | Trigger | Severity | Recovery |
|------|-------------|---------|----------|----------|
| ERR-POOL-001 | Worker crashed | Worker thread exits unexpectedly | Warning | Respawn worker, retry batch (max 2 retries) |
| ERR-POOL-002 | All retries exhausted | Batch fails after 2 respawn+retry cycles | Error | Throw to caller with failed batch info |
| ERR-POOL-003 | Shutdown timeout | Workers don't exit within 2s | Warning | Force terminate (SIGKILL equivalent) |
| ERR-DEV-001 | EP load failed | Requested execution provider unavailable | Warning | Fall back to CPU, log reason |
| ERR-DEV-002 | GPU detection failed | /proc or /sys check throws | Info | Default to CPU, no warning needed |
| ERR-DEV-003 | Invalid device string | Config contains unrecognized device | Warning | Fall back to CPU, log valid options |
| ERR-BATCH-001 | Batched inference unsupported | ext(texts[]) throws | Info | Sequential fallback within worker |
| ERR-CFG-001 | Invalid parallelism | Non-numeric, negative, or zero value | Warning | Default to 'auto' |
| ERR-CFG-002 | Invalid dtype | Unrecognized dtype string | Warning | Default to 'auto' |

## Graceful Degradation

| Failure | What Still Works | Performance Impact |
|---------|-----------------|-------------------|
| EP fails to load | CPU inference | No hardware accel — slower but correct |
| Worker crashes | Remaining workers + respawned worker | Brief pause for respawn, retry overhead |
| Batched inference unsupported | Sequential per-text in each worker | No batch speedup — parallelism still helps |
| All workers crash | Inline single-threaded fallback | Back to current ~55 min performance |
| Config file missing | Auto defaults | Sensible behavior without config |
