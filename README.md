# DRCIP — Disaster Response & Coordination Platform

A full-stack disaster-response coordination platform that coordinates incident reporting, situational awareness, resource management, decision support, field execution, notifications, operational knowledge, and reporting.

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
  └── FastAPI integration gateway

intelligence-service/
  ├── FastAPI Python service
  ├── Severity prediction (mock provider)
  ├── Demand forecasting (mock provider)
  ├── Optimization (mock provider)
  └── RAG assistant (mock provider)

shared/contracts/  - Shared TypeScript types and domain contracts
```

**Data flow:**
- REST over WebSocket (authoritative state + real-time updates)
- PostgreSQL/PostGIS as the system of record
- Domain contracts decouple frontend from intelligence implementations
- Intelligence service runs behind the Node API boundary

## Quick Start

### Prerequisites

- Node.js 20+ / npm (npm workspaces)
- Python 3.11+
- PostgreSQL 16+ with PostGIS extension

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
   # Terminal 1: Intelligence service (FastAPI)
   cd intelligence-service
   uvicorn app.main:app --reload

   # Terminal 2: Backend API (Node/Express)
   cd backend
   npm run dev

   # Terminal 3: Frontend (Vite)
   cd frontend
   npm run dev
   ```

4. **Access the application**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:5000
   - Intelligence Service: http://localhost:8000

## Project Structure

```
DRCIP/
├── shared/contracts/              # Shared domain types
│   ├── src/
│   │   ├── index.ts               # Main exports
│   │   ├── domain.ts              # Domain enums and types
│   │   ├── api.ts                 # API contract types
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
│   ├── vite.config.ts             # Vite config with proxy
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
│   │   │   ├── IntelligenceClient.ts  # FastAPI client
│   │   │   └── WebSocketService.ts    # WebSocket management
│   │   ├── index.ts              # Entry point
│   │   └── prisma/
│   │       └── schema.prisma      # Database schema
│   ├── .env                       # Environment configuration
│   ├── tsconfig.json
│   └── package.json
│
├── intelligence-service/          # FastAPI intelligence service
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
npm run dev              # Install all and run all services
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
cd intelligence-service && python -m pytest   # Intelligence Service
```

Backend and frontend tests require a running local PostgreSQL instance and a
seeded test database (see `backend/.env`).

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

Server-side (Node → FastAPI) only; not public API.

- `/internal/v1/predict/severity` - Severity prediction
- `/internal/v1/forecast/demand` - Demand forecasting
- `/internal/v1/optimize/allocation` - Allocation optimization
- `/internal/v1/rag/query` - RAG assistant

## Documentation

All authoritative specifications are in `docs/`:

1. `01_PRD.md` - Product Requirements Document
2. `02_Functional_Specification.md` - Functional specifications
3. `03_System_Architecture.md` - Technical architecture
4. `04_Database_Schema.md` - Database schema
5. `05_API_Contract.md` - API contracts
6. `06_UI_UX_Specification.md` - UI/UX requirements
7. `07_Acceptance_Criteria.md` - Definition of Done
8. `08_Coding_Standards_Project_Conventions.md` - Coding standards

## Testing

The repository ships four automated test suites (534 tests total):

1. **Backend — 360 tests** (Vitest + Supertest): RBAC, incident lifecycle, assignment lifecycle incl. completion and cancellation reversal, field updates, incident resolution, media validation, notifications, weather, capacity, reports, admin, degraded/AI-fallback paths.
2. **Frontend — 145 tests** (Vitest + Testing Library): routing/guards, portal pages, forms, realtime reconciliation and critical UI workflows.
3. **Shared contracts — 18 tests** (Vitest): domain and API contract validation (zod).
4. **Intelligence Service — 11 tests** (pytest + FastAPI TestClient): mock severity/demand/optimization/RAG providers.

A v1 test scenario executes the supported workflow:
- Admin provisions accounts
- Field team is created
- Citizen submits an incident
- Severity prediction is attempted (falls back to manual triage when AI is unavailable)
- Coordinator manually triages and creates the assignment (manual-assignment flow is authoritative; the AI optimize/recommend/approve workflow is deferred)
- Field officer records field updates and completes the assignment
- Incident is resolved once all assignments are complete or cancelled
- Audit trail is complete
- RAG answers contain citations
- Application continues operating

## Design Principles

- **Operational truth lives in the core application** - PostgreSQL/PostGIS
- **Intelligence is replaceable** - Pluggable providers behind stable contracts
- **Human operational authority is preserved** - Coordinator always has final say
- **Failures degrade gracefully** - Service outages don't block core workflows
- **Security is enforced server-side** - No client-side authorization only
- **Every important action is traceable** - Audit logging on key operations
- **Missing data != zero** - Missing values are distinguishable from zero
- **Model independence** - Frontend and backend don't depend on ML internals

## Project Invariants (Non-Negotiable)

- Roles: `CITIZEN`, `FIELD_OFFICER`, `DISASTER_COORDINATOR`, `ADMINISTRATOR`
- Accounts are administrator-provisioned
- One Field Officer leads exactly one Field Team
- Field Team membership is distinct from authentication identity
- RAG lives behind authentication and RBAC
- AI never autonomous_dispatches resources
- Coordinator review is the operational decision point
- AI/ML outage must not block incident management
- Optimization is logically part of Intelligence Service but remains a separate module
- Original AI recommendations and final human decisions are stored separately
- PostgreSQL/PostGIS is the operational system of record

## License

Academic project - See repository for license details.