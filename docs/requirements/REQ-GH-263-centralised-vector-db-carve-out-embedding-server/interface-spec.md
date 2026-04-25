# Interface Specification: Knowledge Management Service (GH-263)

## MCP Tools

### semantic_search
```
Input:  { query: string, projects: string[] }
Output: { results: [{ content: string, score: number, project: string, source_type: string, source_url: string, related_sources: [{ path: string, relationship: string }] }] }
Errors: INVALID_PROJECT (unknown project ID), NO_INDEX (project has no embeddings yet)
```

### add_content
```
Input:  { content: string | { path: string, text: string }[], project: string }
Output: { job_id: string, status: "queued" }
Errors: INVALID_PROJECT, CONTENT_TOO_LARGE
```

### list_projects
```
Input:  {}
Output: { projects: [{ id: string, name: string, version: string, status: string, document_count: number, last_refresh: string }] }
```

### list_modules
```
Input:  { project: string }
Output: { sources: [{ type: string, url: string, document_count: number, last_crawled: string }] }
Errors: INVALID_PROJECT
```

## REST API

### POST /api/refresh
```
Input:  { source_type: "git"|"svn", repo_id: string, changes: [{ path: string, action: string }] }
Output: { job_id: string, status: "queued" }
Errors: 400 (unknown repo_id), 404 (no project uses this repo)
```

### GET /api/projects
```
Output: { projects: [{ id, name, version, status, document_count, last_refresh, staleness }] }
```

### POST /api/projects
```
Input:  { name: string, version: string, description?: string, sources?: Source[], model_config?: ModelConfig, vectordb_config?: VectorDbConfig }
Output: { project: ProjectConfig }
Errors: 400 (validation), 409 (duplicate name+version)
```

### PUT /api/projects/:id
```
Input:  { name?, version?, description?, sources?, model_config?, vectordb_config? }
Output: { project: ProjectConfig }
Errors: 404, 400
```

### DELETE /api/projects/:id
```
Output: { deleted: true }
Errors: 404
```

### POST /api/projects/:id/rebuild
```
Output: { job_id: string, status: "queued" }
Errors: 404
```

### GET /api/projects/:id/status
```
Output: { staleness: "fresh"|"stale"|"unknown", document_count: number, last_refresh: string, active_jobs: Job[], refresh_history: RefreshRecord[] }
Errors: 404
```

### GET /api/models
```
Output: { models: [{ name, type: "local"|"cloud", loaded: boolean, pinned: boolean, memory_mb?: number, dimensions: number }] }
```

### POST /api/models/:name/pin
```
Output: { pinned: true }
Errors: 404 (model not found), 400 (cloud model — cannot pin)
```

### DELETE /api/models/:name/pin
```
Output: { pinned: false }
Errors: 404
```

### GET /api/system/health
```
Output: { api: "up"|"down", worker: "up"|"down", projects: number, total_documents: number, memory_used_mb: number, memory_available_mb: number }
```

### GET /metrics
```
Output: Prometheus text format — job_queue_depth, job_success_total, job_failure_total, project_document_count, project_staleness_seconds, model_memory_bytes, embedding_throughput_chunks_per_second, api_request_duration_seconds
```

### GET /api/audit
```
Input (query params): ?project=X&action=Y&from=ISO&to=ISO&limit=100&offset=0
Output: { entries: AuditEntry[], total: number }
```

## Data Structures

### ProjectConfig
```json
{
  "id": "payments-2.7",
  "name": "Payments",
  "version": "2.7",
  "description": "Payment processing module",
  "sources": [
    { "type": "git", "url": "git.company.com/payments", "branch": "release/2.7" },
    { "type": "confluence", "url": "confluence.company.com/display/PAY27/" },
    { "type": "website", "url": "docs.payments.com/v2.7/" }
  ],
  "model_config": {
    "source": "local",
    "model_name": "jina-v2-base-code",
    "precision": "fp16"
  },
  "vectordb_config": {
    "backend": "sqlite-vec",
    "path": "data/projects/payments-2.7/index.db"
  },
  "created_at": "2026-04-25T09:00:00Z",
  "updated_at": "2026-04-25T09:00:00Z"
}
```

### AuditEntry
```json
{
  "timestamp": "2026-04-25T09:00:00Z",
  "action": "project.created",
  "project_id": "payments-2.7",
  "details": { "name": "Payments", "version": "2.7" },
  "ip_address": "192.168.1.100"
}
```

### RefreshRecord
```json
{
  "timestamp": "2026-04-25T10:00:00Z",
  "type": "incremental",
  "trigger_source": "github-actions",
  "duration_seconds": 45,
  "documents_processed": 12,
  "status": "success",
  "error": null
}
```
