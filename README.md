# DRCIP — Disaster Response & Coordination Platform

A full-stack disaster-response coordination platform for incident reporting,
situational awareness, resource management, decision support, field execution,
notifications, operational knowledge, and reporting.

## Architecture

The DRCIP platform keeps the operational system of record in PostgreSQL/PostGIS
and exposes it through the Node API. Supporting intelligence and RAG services sit
behind that boundary and are replaceable.

```
frontend/                 React + Vite + TypeScript + Tailwind CSS
  ├── shadcn/ui components
  ├── Leaflet maps
  ├── Chart.js analytics
  └── React Router

backend/                  Node/Express public API
  ├── Authentication and RBAC
  ├── Incident, resource, team, shelter and assignment management
  ├── Notifications, reports, weather and audit logs
  ├── WebSocket real-time updates
  ├── Intelligence gateway
  └── RAG orchestration, live-tool authorization and audit

rag/                      FastAPI document RAG service
  ├── Qdrant Cloud + Cloudflare Workers AI embeddings
  ├── Groq answer generation
  ├── Page-cited document answers
  └── RAG 2.0 tool proposals (executed only by the Node backend)

intelligence-service/     Optional FastAPI mock/scaffold
  ├── Severity prediction (mock provider; called by the Node backend)
  ├── Demand forecasting (mock provider)
  ├── Optimization (mock provider)
  └── Mock RAG endpoint

shared/contracts/         Shared TypeScript types, Zod schemas and domain contracts
e2e/                      Playwright end-to-end tests
```

**Data flow:**

- REST is authoritative; WebSockets distribute updates and missed events are
  recovered by reconciliation/refetch.
- PostgreSQL/PostGIS is the operational system of record.
- The frontend talks only to the public Node API, never directly to PostgreSQL,
  Qdrant, private intelligence endpoints, or provider secrets.
- The Node API supplies approved tool definitions to the RAG service, validates
  and authorizes proposed tool calls, executes them through domain services, and
  audits the result.
- The optional intelligence service is not required for the core incident
  workflow. Severity prediction falls back to manual triage when unavailable.

## Quick Start

### Prerequisites

- Node.js 20+ and npm (npm workspaces)
- PostgreSQL 16+ with the PostGIS extension
- Python 3.11+ for the RAG service and the optional intelligence mock
- Qdrant Cloud, Groq, and Cloudflare Workers AI credentials for RAG
- Cloudinary credentials for incident media uploads
- Git Bash on Windows if using `install.sh`

### Installation

```bash
# Install Node workspaces and Python dependencies
./install.sh
```

Manual equivalent:

```bash
npm install
python -m pip install -e "./intelligence-service[dev]"
python -m pip install -r rag/requirements.txt -r rag/requirements-dev.txt
```

Copy the environment templates and fill in real values:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
cp rag/.env.example rag/.env
```

Never commit `.env` files. For a local RAG service, point the backend at it:

```dotenv
RAG_PROVIDER=hosted
RAG_SERVICE_URL=http://localhost:8001
RAG_API_KEY=<must match one value in rag/API_KEYS>
```

### Database setup

```bash
cd backend
npm run db:push
npm run db:seed
```

`db:seed` creates or updates the administrator account from `ADMIN_EMAIL` and
`ADMIN_PASSWORD` in `backend/.env`.

### Start services

```bash
# Terminal 1: Backend API
cd backend
npm run dev

# Terminal 2: Frontend
cd frontend
npm run dev

# Terminal 3: RAG service
cd rag
uvicorn app.main:app --reload --port 8001

# Terminal 4: Optional intelligence mock
cd intelligence-service
uvicorn app.main:app --reload --port 8000
```

The RAG service uses port `8001` locally to avoid colliding with the optional
intelligence service on `8000`.

### Access

- Frontend: http://localhost:5173
- Backend API: http://localhost:5000
- RAG service: http://localhost:8001
- Intelligence mock (optional): http://localhost:8000

Deployed v1 environment:

- Frontend: https://drcip.pages.dev
- Backend/API: https://drcip.onrender.com
- Database: NeonDB (PostgreSQL/PostGIS)

## Project Structure

```
DRCIP/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── contexts/
│   │   ├── pages/
│   │   ├── router.tsx
│   │   └── main.tsx
│   ├── .env.example
│   ├── package.json
│   └── vite.config.ts
│
├── backend/
│   ├── src/
│   │   ├── lib/
│   │   ├── middleware/
│   │   ├── routes/
│   │   ├── services/
│   │   └── index.ts
│   ├── prisma/
│   │   └── schema.prisma
│   ├── tests/
│   ├── .env.example
│   ├── package.json
│   └── tsconfig.json
│
├── rag/
│   ├── app/
│   │   ├── routers/
│   │   └── services/
│   ├── ingest/
│   ├── tests/
│   ├── .env.example
│   ├── requirements.txt
│   └── README.md
│
├── intelligence-service/
│   ├── app/
│   │   ├── modules/
│   │   └── main.py
│   ├── tests/
│   ├── requirements.txt
│   └── pyproject.toml
│
├── shared/contracts/
│   ├── src/
│   └── package.json
│
├── e2e/
│   └── basic.spec.ts
├── install.sh
└── package.json
```

## Development Commands

### Root workspace

```bash
npm install              # Install all Node workspaces
npm run dev              # Run all workspace dev servers
npm run typecheck        # Type check all workspaces
npm run build            # Build all workspaces
npm run lint             # Lint all workspaces
npm run test             # Test all workspaces
npm run db:seed          # Seed the backend database
```

### Backend

```bash
cd backend
npm run dev              # Development server with hot reload
npm run build            # Production build
npm run start            # Start production server
npm run typecheck        # TypeScript type checking
npm run lint             # ESLint
npm run test             # Vitest + Supertest
npm run db:generate      # Generate Prisma client
npm run db:migrate       # Run migrations
npm run db:push          # Push schema (development)
npm run db:studio        # Open Prisma Studio
```

### Frontend

```bash
cd frontend
npm run dev              # Vite development server
npm run build            # Type-check and production build
npm run preview          # Preview production build
npm run typecheck        # TypeScript type checking
npm run lint             # ESLint
npm run test             # Vitest + Testing Library
```

Production builds require a non-localhost public origin:

```bash
VITE_SITE_ORIGIN=https://drcip.example.org npm run build --workspace=frontend
```

PowerShell:

```powershell
$env:VITE_SITE_ORIGIN="https://drcip.example.org"; npm run build --workspace=frontend
```

### RAG service

```bash
cd rag
python -m pytest tests/ -v
python -m ruff check app tests ingest
uvicorn app.main:app --reload --port 8001
python -m ingest.ingest --pdf disaster.pdf
```

### Intelligence service

```bash
cd intelligence-service
python -m pip install -e ".[dev]"
python -m pytest
uvicorn app.main:app --reload --port 8000
```

### End-to-end tests

```bash
npx playwright test
```

Set `E2E_BASE_URL`, `E2E_ADMIN_EMAIL`, and `E2E_ADMIN_PASSWORD` when running
against a seeded environment.

## Verification

```bash
npm run typecheck
npm run lint
npm run test
VITE_SITE_ORIGIN=https://drcip.example.org npm run build
```

Backend tests require PostgreSQL/PostGIS. Override the test database with
`DATABASE_URL_TEST`; the default is
`postgresql://postgres:postgres@localhost:5432/drcip_test?schema=public`.

Python checks:

```bash
cd rag && python -m pytest tests/ -v && python -m ruff check app tests ingest
cd intelligence-service && python -m pytest
```

The test suites currently contain:

- Backend — 476 tests (Vitest + Supertest)
- Frontend — 172 tests (Vitest + Testing Library)
- Shared contracts — 29 tests (Vitest)
- RAG — 124 passed, 11 skipped (pytest)
- Intelligence mock — 11 tests (pytest)
- End-to-end — Playwright scenarios in `e2e/`

## Role-Based Access Control

- **CITIZEN**: Report incidents, view own incidents, notifications, and
  approved-document RAG guidance only.
- **FIELD_OFFICER**: Field operations, team management, assignments, and RAG with
  live operational tools.
- **DISASTER_COORDINATOR**: Coordination dashboard, assignments, resources,
  reports, audit logs, and RAG with live operational tools.
- **ADMINISTRATOR**: User provisioning, system configuration, and full access.

RAG authorization is enforced server-side. The frontend never receives live
operational data through RAG for a Citizen, and hiding UI is never the control.

## API Documentation

### Public API endpoints

The frontend calls only the Node API under `/api/v1`.

- `/health`, `/health/version` — Health and version
- `/api/v1/auth/*` — Login, logout, password reset
- `/api/v1/users` — User management (administrator)
- `/api/v1/me` — Profile, password change, field-officer team/assignments
- `/api/v1/incidents` — Incident operations, triage, resolution, media
- `/api/v1/assignments` — Assignment operations, events, field updates
- `/api/v1/resources` — Resource management
- `/api/v1/teams` — Team management
- `/api/v1/shelters` — Shelter management
- `/api/v1/capacity` — Coordinator capacity summary
- `/api/v1/response-zones` — Response zone list
- `/api/v1/reports` — Reports and CSV/XLSX/PDF export
- `/api/v1/notifications` — Notifications and broadcasts
- `/api/v1/audit-logs` — Audit logs (coordinator/administrator)
- `/api/v1/weather` — Weather observations
- `/api/v1/admin` — Administrator dashboard and leader candidates
- `/api/v1/rag/query` — RAG query for all authenticated roles

### Internal service endpoints

These are server-to-server only and are not public API.

Intelligence service (Node → FastAPI):

- `/internal/v1/predict/severity`
- `/internal/v1/forecast/demand`
- `/internal/v1/optimize/allocation`
- `/internal/v1/rag/query`

Only severity prediction is wired into the current incident workflow. Demand and
optimization remain scaffolded for future work. The production document RAG path
uses the separate `rag/` service.

RAG service (Node → FastAPI):

- `POST /query` — Document answer, tool proposals, or continuation synthesis

## RAG 2.0 Live Tool Calls

The Node backend is the only RAG 2.0 orchestrator. For non-Citizen roles it
supplies approved tool definitions to the RAG service. The service may return
`tool_calls` proposals, but it never executes them.

For each proposal, the Node backend validates the tool name and typed arguments,
enforces RBAC, executes the tool through application/domain services, writes an
audit record, and sends structured results back for final synthesis. Tool
execution is single-round and capped at four calls per turn. `UNAVAILABLE` and
`ERROR` results degrade to an explicit limitation rather than being shown as
current data.

Citizens receive document-only RAG answers and no tool definitions.
