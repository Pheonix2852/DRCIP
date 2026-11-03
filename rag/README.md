# DRCIP Disaster Management RAG API

A lightweight RAG (Retrieval-Augmented Generation) API that answers questions
about disaster-management documents with page citations. Built with **FastAPI +
Qdrant Cloud + Groq + Cloudflare Workers AI**.

Embeddings run remotely through Cloudflare Workers AI, so the Render container
does not load PyTorch, Transformers, or a local model.

---

## Architecture

```
Developer machine (local, run once)
  disaster.pdf -> ingest.py -> Cloudflare Workers AI embeddings -> Qdrant Cloud

Render Docker service
  POST /query
    1. Embed question   (Cloudflare Workers AI, BGE-small-en-v1.5)
    2. Vector search    (Qdrant Cloud, canonical disaster_docs, cosine)
    3. Threshold check  (abstain when similarity is low)
    4. Generate answer  (Groq LLM)
    5. Return answer + page citations
```

| Component | Technology |
|---|---|
| Framework | FastAPI + Uvicorn |
| Embedding | Cloudflare Workers AI `@cf/baai/bge-small-en-v1.5` (384-dim, CLS pooling, L2-normalized) |
| LLM | Groq (`openai/gpt-oss-20b`) |
| Vector DB | Qdrant Cloud, collection `disaster_docs` |
| PDF parsing | pypdf |
| Deployment | Render (Docker) |

---

## Prerequisites

- Python 3.11+
- A [Qdrant Cloud](https://cloud.qdrant.io/) account
- A [Groq](https://console.groq.com/) API key
- A Cloudflare account and API token with Workers AI access

---

## Local Setup

### 1. Configure environment

```bash
cp .env.example .env
# Edit .env with real credentials; never commit .env.
```

### 2. Install dependencies

```bash
pip install -r requirements.txt -r requirements-dev.txt
```

### 3. Ingest your PDF

Run this once locally before deploying. The API on Render is read-only.

```bash
python -m ingest.ingest --pdf disaster.pdf
```

By default, ingestion targets `QDRANT_COLLECTION` (default: `disaster_docs`).
The canonical collection contains only BGE-small-en-v1.5 vectors: 384
dimensions, L2-normalized, COSINE distance.

### 4. Run the API locally

```bash
uvicorn app.main:app --reload --port 8000
```

Open `http://localhost:8000/docs` for the interactive Swagger UI.

---

## Canonical Collection

The production collection is `disaster_docs`. It contains the validated 202
BGE-small-en-v1.5 vectors from `disaster.pdf` (384 dimensions, L2-normalized,
COSINE distance). Do not mix embedding spaces in this collection.

If you change the embedding model, create a separate collection, re-embed and
validate it, then migrate to the canonical name before switching traffic.

---

## API Reference

### Authentication

Every `/query` request requires a bearer token:

```
Authorization: Bearer <your_api_key>
```

API keys are set in `API_KEYS` (comma-separated for rotation).

---

### `POST /query`

```json
{
  "question": "What are the evacuation procedures for coastal flooding?"
}
```

| Field | Type | Required | Constraints |
|---|---|---|---|
| `question` | string | yes | 3-500 characters |

**Response - answer found (HTTP 200):**

```json
{
  "answer": "Coastal flooding evacuation procedures include immediate evacuation when Flood Alert Level 3 is declared.",
  "sources": [
    {
      "document": "disaster.pdf",
      "page": 12,
      "excerpt": "Residents must evacuate within 2 hours of a Flood Alert Level 3 declaration..."
    }
  ],
  "model": "openai/gpt-oss-20b",
  "chunks_retrieved": 5
}
```

**Response - abstention (HTTP 200):**

```json
{
  "answer": "I could not find sufficient information in the available disaster-management documents to answer this question reliably. Please consult official sources or rephrase your query.",
  "sources": [],
  "model": "openai/gpt-oss-20b",
  "chunks_retrieved": 0
}
```

Check `sources == []` to detect abstention programmatically.

| HTTP | Condition |
|---|---|
| 401 | Invalid or missing bearer token |
| 422 | Request body fails validation |
| 503 | Qdrant, Cloudflare, or Groq unavailable |

---

### `GET /health`

Public liveness probe; no authentication required.

```json
{
  "status": "ok",
  "qdrant": "connected",
  "collection": "disaster_docs",
  "model": "@cf/baai/bge-small-en-v1.5"
}
```

`qdrant` values: `"connected"` | `"collection_missing"` | `"error"`.

No embedding model is loaded in the API process. `model` is the configured
remote Cloudflare Workers AI embedding model; `/query` verifies inference
availability. There is no local-model status field.

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `QDRANT_URL` | yes | - | Qdrant Cloud cluster URL |
| `QDRANT_API_KEY` | yes | - | Qdrant Cloud API key |
| `GROQ_API_KEY` | yes | - | Groq API key |
| `API_KEYS` | yes | - | Comma-separated bearer tokens |
| `CLOUDFLARE_ACCOUNT_ID` | yes | - | Cloudflare account ID |
| `CLOUDFLARE_API_TOKEN` | yes | - | Token with Workers AI access |
| `QDRANT_COLLECTION` | no | `disaster_docs` | Canonical Qdrant collection name |
| `CLOUDFLARE_EMBEDDING_MODEL` | no | `@cf/baai/bge-small-en-v1.5` | Embedding model |
| `CLOUDFLARE_EMBEDDING_TIMEOUT_SECONDS` | no | `30` | HTTP timeout |
| `CLOUDFLARE_EMBEDDING_BATCH_SIZE` | no | `16` | Texts per provider request |
| `CLOUDFLARE_EMBEDDING_POOLING` | no | `cls` | `cls` or `mean`; must match the ingested vectors |
| `GROQ_MODEL` | no | `openai/gpt-oss-20b` | Groq model ID |
| `TOP_K` | no | `5` | Chunks retrieved per query |
| `SCORE_THRESHOLD` | no | `0.30` | Minimum cosine similarity before abstention |
| `DATABASE_URL` | no | - | Reserved for future use |

---

## Running Tests

```bash
pytest tests/ -v
ruff check app tests ingest
```

Tests run offline; Qdrant, Groq, and Cloudflare Workers AI are mocked.

---

## Render Deployment

### Option A - Blueprint

1. Push the repository to GitHub.
2. In Render, choose **New -> Blueprint** and connect the repo.
3. Set these secrets in Render: `QDRANT_URL`, `QDRANT_API_KEY`,
   `GROQ_API_KEY`, `API_KEYS`, `CLOUDFLARE_ACCOUNT_ID`,
   `CLOUDFLARE_API_TOKEN`.
4. Deploy.

### Option B - Manual

1. Create a **New -> Web Service** from the repository.
2. Set **Language: Docker**.
3. Add the environment variables above.
4. Deploy.

### Memory and cold starts

The container no longer loads a local embedding model, so the previous PyTorch
memory ceiling does not apply. A 512 MB instance is sufficient for the API
process. Rendering the first response still depends on Qdrant, Cloudflare, and
Groq network calls.

---

## Keep-Alive Setup

Render's free tier sleeps after about 15 minutes of inactivity, and Qdrant's
free cluster suspends after about 7 days of inactivity.

Use a free scheduler such as [cron-job.org](https://cron-job.org):

- URL: `https://your-service.onrender.com/health`
- Schedule: every 13 minutes

This keeps both the Render service and the Qdrant client active.

---

## Adding More Documents

```bash
python -m ingest.ingest --pdf new_document.pdf
```

Chunk IDs are deterministic, so re-running the same PDF is idempotent. To
replace the embedding model or rebuild the corpus, create a separate
collection, validate it, and migrate to `disaster_docs` only after verification;
do not delete the only validated copy.

---

## Security Notes

- Bearer tokens are validated server-side against `API_KEYS`.
- The LLM system prompt contains injection-resistance instructions.
- HTTPS is terminated by Render's proxy.
- Never commit `.env`; it is ignored by git.
- Do not log Cloudflare or Qdrant credentials.
