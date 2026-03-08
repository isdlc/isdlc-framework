# Project Knowledge — Enhancing the Harness with Your Documents

iSDLC builds project knowledge from two sources: **code scans** (automatic during `/discover`) and **your documents** (Markdown, HTML, plain text you provide). Both are chunked, embedded, and loaded into the vector store so agents can search them semantically during workflows.

## How It Works

```
Your documents (Markdown, HTML, text)
    ↓
Document chunker (structure-aware: headings, sections, paragraphs)
    ↓
Embedding engine (CodeBERT local, Voyage cloud, or OpenAI cloud)
    ↓
.emb package (vectors + metadata)
    ↓
MCP server (FAISS + SQLite vector store)
    ↓
Agents query via semantic_search() during workflows
```

Code embeddings follow the same pipeline but use AST-aware chunking (Tree-sitter, 100+ languages) instead of document chunking.

## Adding Your Documents

### Programmatic API

```javascript
import { createKnowledgePipeline } from 'isdlc/lib/embedding/knowledge';
import { embed } from 'isdlc/lib/embedding/engine';

// 1. Create a pipeline with your embedding provider
const pipeline = createKnowledgePipeline({
  embedFn: async (texts) => {
    const result = await embed(texts, { provider: 'codebert' });
    return result.vectors;
  },
  model: 'codebert',
  dimensions: 768,
});

// 2. Process your documents
const result = await pipeline.processDocuments([
  { content: '# API Design Guidelines\n...', filePath: 'docs/api-guidelines.md', format: 'markdown' },
  { content: '<html>...</html>', filePath: 'docs/compliance.html', format: 'html' },
  { content: 'Plain text notes...', filePath: 'notes/decisions.txt', format: 'text' },
]);

// result.chunks  — DocumentChunk[] with IDs, section paths, offsets
// result.vectors — Float32Array[] ready for vector store
// result.contentType — 'knowledge-base' (distinguishes from code embeddings)
```

### Supported Document Formats

| Format | Chunking Strategy | Auto-detected Extensions |
|--------|------------------|--------------------------|
| **Markdown** | Split on headings, code blocks kept atomic, breadcrumb paths (e.g., "Chapter > Section") | `.md`, `.mdx`, `.markdown` |
| **HTML** | Split on block elements (`<h1>`-`<h6>`, `<p>`, `<div>`, `<section>`), tags stripped | `.html`, `.htm` |
| **Plain text** | Split on paragraph breaks (double newlines), sentence-boundary-aware sizing | Everything else |

### Embedding Providers

| Provider | Type | Setup | Dimensions |
|----------|------|-------|------------|
| **CodeBERT** | Local | `npm install onnxruntime-node` (optional — model downloads on first use) | 768 |
| **Voyage-code-3** | Cloud | Set `VOYAGE_API_KEY` | Configurable |
| **OpenAI text-embedding-3-small** | Cloud | Set `OPENAI_API_KEY` | Configurable |

You can also provide any custom `embedFn` — the pipeline only requires a function that takes `string[]` and returns `Float32Array[]`.

## What You Can Embed

Anything that helps agents understand your project:

- **Architecture decisions** — ADRs, design docs, whiteboard notes
- **Domain knowledge** — business rules, regulatory requirements, compliance docs
- **API documentation** — external service contracts, integration guides
- **Team conventions** — coding standards, review checklists, naming rules
- **Onboarding material** — project history, key decisions, why things are the way they are

Documents tagged as `knowledge-base` are searchable alongside code during all workflow phases. Agents don't distinguish between code knowledge and document knowledge — both answer semantic queries.

## Custom Skills as Baseline Knowledge

Custom skills (`.isdlc/skills/`) are another form of project knowledge. While documents provide searchable context, skills provide actionable instructions that agents follow during specific phases. Together they form the baseline knowledge the harness works with:

| Knowledge type | How it's consumed | When it's used |
|---------------|-------------------|----------------|
| **Code embeddings** | Semantic search during any phase | Always (generated during `/discover`) |
| **Document embeddings** | Semantic search during any phase | When you provide documents |
| **Custom skills** | Injected into agent prompts | During the phase the skill targets |
| **Constitution** | Validated at every gate | Always (generated during `/discover`) |

## Vector Store

The current vector store is FAISS + SQLite — packaged as `.emb` archives containing flat vector serialization and chunk metadata. This is hardcoded; swapping to a different vector DB (Qdrant, Milvus, Weaviate) requires replacing the MCP server implementation.

## Content Security

Embeddings support 3-tier content redaction for sharing across trust boundaries:

| Tier | What's included | Use case |
|------|----------------|----------|
| **Interface** | Public signatures only — zero source reconstruction | External distribution |
| **Guided** | Signatures + AI-generated behavioral summaries | Extended access partners |
| **Full** | Complete source content | Internal development |

Packages are encrypted with AES-256-GCM. See `lib/embedding/redaction/` for implementation.
