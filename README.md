# DRCIP — Disaster Response & Coordination Platform

A full-stack disaster-response coordination platform that coordinates incident reporting, situational awareness, resource management, decision support, field execution, notifications, operational knowledge, and reporting.

DRCIP v1 is the non-AI operational release: the core platform runs independently of AI/ML model inference. AI/ML model development was stopped and the post-baseline AI/ML implementation/research work was removed from the v1 tree. The pre-existing `intelligence-service` mock/scaffold remains intentionally — it predates that work and is not the active v1 AI/ML implementation.

## Architecture

The DRCIP platform follows a modular architecture designed for stability and replaceability:

```
frontend/          - React/Vite + TypeScript + Tailwind CSS
  ├── Shared UI components (shadcn/ui)
  ├── Leaflet maps
  ├── Chart.js analytics
  └── React Router routing

backend/           - Node/Express API
  ├── Authentication & RBAC
  ├── Incident management
  ├── Resource & team management
  ├── WebSocket real-time updates
  └── Intelligence integration gateway (mock scaffold)

intelligence-service/   - Pre-existing FastAPI mock/scaffold (not active v1 AI/ML)
  ├── Severity prediction (mock provider)
  ├── Demand forecasting (mock provider)
  ├── Optimization (mock provider)
  └── RAG assistant (mock provider)

shared/contracts/  - Shared TypeScript types and domain contracts
```

**Data flow:**
- REST is authoritative; WebSockets distribute real-time updates
- PostgreSQL/PostGIS as the system of record
- Domain contracts decouple frontend from intelligence implementations
- The intelligence scaffold runs behind the Node API boundary

## Quick Start

### Prerequisites

- Node.js 20+ / npm (npm workspaces)
- PostgreSQL 16+ with PostGIS extension
- Python 3.11+ (only for the optional `intelligence-service` mock/scaffold)

### Installation

1. **Install dependencies**
   ```bash
   # Option 1: Run the installer
   ./install.sh

   # Option 2: Install manually (npm workspaces)
   npm install        # installs frontend, backend and shared/contracts
   ```
   The repository is an npm workspace; a single root `npm install` installs all workspaces. No per-package installs are required.

2. **Database setup**
   ```bash
   # Start PostgreSQL with PostGIS enabled
   # Then initialize the schema
   cd backend && npm run db:push
   ```

3. **Start services**
   ```bash
   # Terminal 1: Backend API (Node/Express)
   cd backend
   npm run dev

   # Terminal 2: Frontend (Vite)
   cd frontend
   npm run dev

   # Optional: pre-existing intelligence mock/scaffold
   # (not required for the core v1 workflow)
   cd intelligence-service
   uvicorn app.main:app --reload
   ```

4. **Access the application**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:5000
   - Intelligence Service (optional mock/scaffold): http://localhost:8000

## Project Structure

```
DRCIP/
├── shared/contracts/              # Shared domain types
│   ├── src/
│   │   ├── index.ts               # Main exports
│   │   ├── domain.ts              # Domain enums and types
│   │   ├── api.ts                 # API contract types
│   │   ├── schemas.ts             # Zod validation schemas
│   │   └── intelligence.ts        # Intelligence contract types
│   └── package.json
│
├── frontend/                      # React/Vite UI
│   ├── src/
│   │   ├── components/           # UI components
│   │   ├── contexts/              # React contexts (Auth)
│   │   ├── pages/                # Page components
│   │   ├── router.tsx             # Route definitions
│   │   ├── main.tsx               # Application entry
│   │   └── index.css              # Tailwind styles
│   ├── package.json
│   ├── vite.config.ts             # Vite config (proxy + robots/sitemap generation)
│   └── tailwind.config.ts
│
├── backend/                       # Node/Express API
│   ├── src/
│   │   ├── lib/
│   │   │   ├── prisma.ts         # Prisma client
│   │   │   ├── auth.ts           # JWT/auth utilities
│   │   │   └── RequestIdService.ts
│   │   ├── middleware/
│   │   │   ├── auth.ts           # JWT verification
│   │   │   ├── errorHandler.ts   # Error handling
│   │   │   └── index.ts          # Combined middleware
│   │   ├── routes/
│   │   │   ├── auth.ts           # Authentication routes
│   │   │   ├── users.ts          # User management
│   │   │   ├── incidents.ts      # Incident + severity prediction
│   │   │   ├── resources.ts      # Resources API
│   │   │   ├── teams.ts          # Team management
│   │   │   ├── shelters.ts       # Shelter management
│   │   │   ├── assignments.ts    # Assignments API
│   │   │   ├── notifications.ts  # Notifications API
│   │   │   └── health.ts         # Health checks
│   │   ├── services/
│   │   │   ├── IntelligenceClient.ts  # Intelligence client (mock scaffold)
│   │   │   └── WebSocketService.ts    # WebSocket management
│   │   └── index.ts              # Entry point
│   ├── prisma/
│   │   └── schema.prisma          # Database schema
│   ├── .env                       # Environment configuration
│   ├── tsconfig.json
│   └── package.json
│
├── intelligence-service/          # Pre-existing FastAPI mock/scaffold
│   ├── app/
│   │   ├── modules/
│   │   │   ├── severity.py       # Severity prediction (mock)
│   │   │   ├── demand.py         # Demand forecasting (mock)
│   │   │   ├── optimization.py   # Allocation optimization (mock)
│   │   │   └── rag.py            # RAG assistant (mock)
│   │   └── main.py               # FastAPI application
│   ├── requirements.txt
│   ├── pyproject.toml
│
├── install.sh                    # Dependency installer
├── package.json                  # Root workspace configuration
```

## Development Commands

### Root workspace
```bash
npm install              # Install all dependencies
npm run dev              # Run all workspace dev servers
npm run typecheck        # Type check all workspaces
npm run build           # Build all workspaces
npm run lint            # Lint all workspaces
npm run test            # Test all workspaces
```

### Shared Contracts
```bash
cd shared/contracts
npm install
npm run build           # Build TypeScript types
npm run typecheck       # Run type checking
```

### Backend
```bash
cd backend
npm install
npm run dev              # Start development server with hot reload
npm run build           # Production build
npm run start            # Start production server
npm run typecheck       # TypeScript type checking
npm run lint            # ESLint
npm run test            # Run tests
npm run db:generate     # Generate Prisma client
npm run db:migrate      # Run migrations
npm run db:push         # Push schema (dev)
npm run db:studio       # Open Prisma Studio
```

### Frontend
```bash
cd frontend
npm install
npm run dev              # Start development server
npm run build           # Production build
npm run preview         # Preview production build
npm run typecheck       # TypeScript type checking
npm run lint            # ESLint
npm run test            # Vitest tests
```

### Intelligence Service
```bash
cd intelligence-service
pip install -e .
uvicorn app.main:app --reload    # Development server
uvicorn app.main:app             # Production server
pytest                           # Run tests
```

## Verification

Run the project test suites (see Testing below) to verify setup and behavior:

```bash
npm test                  # All workspaces (backend, frontend, shared/contracts)
```

Backend and frontend tests require a running local PostgreSQL instance and a
seeded test database (see `backend/.env`).

v1 verification results:

- Typecheck: PASS (all workspaces)
- Lint: PASS (all workspaces)
- Production build: PASS
- End-to-end tests: 14/14 passing (Chromium + mobile viewports)
- Load/stress verification completed; concurrency protections verified
- Lighthouse (production build): Accessibility 100, Best Practices 100, SEO 100

## Role-Based Access Control

- **CITIZEN**: Report incidents, view own incidents, notifications
- **FIELD_OFFICER**: Field operations, RAG assistant, team management
- **DISASTER_COORDINATOR**: Coordination dashboard, assignments, RAG assistant
- **ADMINISTRATOR**: User provisioning, system configuration, full access

## API Documentation

### Public API endpoints
- `/health`, `/health/version` - Health and version
- `/api/v1/auth/*` - Authentication (login, logout, password reset)
- `/api/v1/users` - User management (admin only)
- `/api/v1/me` - Profile, password change, field-officer team/assignments
- `/api/v1/incidents` - Incident operations (create, list, detail, triage, resolve, media)
- `/api/v1/assignments` - Assignment operations (including events, field-updates)
- `/api/v1/resources` - Resource management
- `/api/v1/teams` - Team management
- `/api/v1/shelters` - Shelter management
- `/api/v1/capacity` - Coordinator capacity summary
- `/api/v1/response-zones` - Response zone list
- `/api/v1/reports` - Reports & analytics (+ CSV/XLSX/PDF export)
- `/api/v1/notifications` - Notifications (read state, broadcast)
- `/api/v1/audit-logs` - Audit logs (coordinator/admin)
- `/api/v1/weather` - Weather observations
- `/api/v1/admin/overview` and `/api/v1/admin/leader-candidates` - Admin dashboard

### Intelligence Service endpoints (internal)

Server-side (Node → FastAPI) only; not public API. These routes belong to the
pre-existing mock/scaffold and are not an active v1 AI/ML implementation.

- `/internal/v1/predict/severity` - Severity prediction
- `/internal/v1/forecast/demand` - Demand forecasting
- `/internal/v1/optimize/allocation` - Allocation optimization
- `/internal/v1/rag/query` - RAG assistant

## Testing

The repository ships four automated test suites (554 tests total):

1. **Backend — 375 tests** (Vitest + Supertest): RBAC, incident lifecycle, assignment lifecycle incl. completion and cancellation reversal, field updates, incident resolution, media validation, notifications, weather, capacity, reports, admin, degraded/severity-fallback paths.
2. **Frontend — 150 tests** (Vitest + Testing Library): routing/guards, portal pages, forms, realtime reconciliation and critical UI workflows.
3. **Shared contracts — 18 tests** (Vitest): domain and API contract validation (zod).
4. **Intelligence Service — 11 tests** (pytest + FastAPI TestClient): pre-existing mock/scaffold severity/demand/optimization/RAG providers.

A v1 test scenario executes the supported workflow:
- Admin provisions accounts
- Field team is created
- Citizen submits an incident
- Severity prediction is optional; when the intelligence scaffold is unavailable, the incident falls back to manual triage (AI/ML model inference is not active in v1)
- Coordinator manually triages and creates the assignment (manual-assignment flow is authoritative; the AI optimize/recommend/approve workflow is deferred)
- Field officer records field updates and completes the assignment
- Incident is resolved once all assignments are complete or cancelled
- Audit trail is complete
- RAG (mock/scaffold) answers contain citations
- Application continues operating
