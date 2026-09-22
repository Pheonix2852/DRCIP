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

- Node.js 20+ / npm
- Python 3.11+
- PostgreSQL 16+ with PostGIS extension
- pnpm / npm (recommended) or yarn

### Installation

1. **Install dependencies**
   ```bash
   # Option 1: Run the installer
   ./install.sh

   # Option 2: Install manually
   npm install
   cd shared/contracts && npm install && cd ..
   cd frontend && npm install && cd ..
   ```

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
│   │   │   ├── incidents.ts      # Incident API
│   │   │   ├── resources.ts      # Resources API
│   │   │   ├── teams.ts          # Team management
│   │   │   ├── shelters.ts       # Shelter management
│   │   │   ├── assignments.ts    # Assignments API
│   │   │   ├── notifications.ts  # Notifications API
│   │   │   ├── internal.ts       # FastAPI integration gateway
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
│   └── .env                      # Environment configuration
│
├── docs/                         # Authoritative specifications
│   ├── 01_PRD.md
│   ├── 02_Functional_Specification.md
│   ├── 03_System_Architecture.md
│   ├── 04_Database_Schema.md
│   ├── 05_API_Contract.md
│   ├── 06_UI_UX_Specification.md
│   ├── 07_Acceptance_Criteria.md
│   └── 08_Coding_Standards_Project_Conventions.md
│
├── install.sh                    # Dependency installer
├── verify-setup.sh                # Verification script
├── package.json                  # Root workspace configuration
└── AGENTS.md                     # OpenCode agent instructions
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

Run the verification script to check setup completeness:

```bash
./verify-setup.sh
```

This verifies:
- Directory structure
- Core configuration files
- Dependency presence
- Database schema availability

## Role-Based Access Control

- **CITIZEN**: Report incidents, view own incidents, notifications
- **FIELD_OFFICER**: Field operations, RAG assistant, team management
- **DISASTER_COORDINATOR**: Coordinaton dashboard, assignments, RAG assistant
- **ADMINISTRATOR**: User provisioning, system configuration, full access

## API Documentation

### Public API endpoints
- `/api/v1/auth/*` - Authentication
- `/api/v1/users` - User management (admin only)
- `/api/v1/incidents` - Incident operations
- `/api/v1/resources` - Resource management
- `/api/v1/teams` - Team management
- `/api/v1/shelters` - Shelter management
- `/api/v1/assignments` - Assignment operations
- `/api/v1/notifications` - Notifications

### Intelligence Service endpoints (internal)
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

The project includes placeholder test configurations. In the v1 implementation:

1. Unit tests for core business logic (RBAC, invariants, state transitions)
2. Integration tests for API contracts
3. End-to-end tests for critical workflows
4. Browser runtime verification for UI behavior

A v1 test scenario executes the complete workflow:
- Admin provisions accounts
- Field team is created
- Citizen submits an incident
- Severity prediction is attempted
- Demand forecasting is attempted
- Optimization produces recommendation
- Coordinator approves
- Field officer updates status
- Incident is resolved
- Audit trail is complete
- RAG answers contain citations
- Coordinator manually triages when AI unavailable
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