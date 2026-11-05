#!/bin/bash
set -e

echo "Installing DRCIP project dependencies..."

# npm workspaces install frontend, backend and shared/contracts together.
npm install

# Optional intelligence mock/scaffold and the document RAG service.
PYTHON="${PYTHON:-python}"
"$PYTHON" -m pip install -e "./intelligence-service[dev]"
"$PYTHON" -m pip install -r rag/requirements.txt -r rag/requirements-dev.txt

echo "✓ All dependencies installed successfully"
echo ""
echo "Next steps:"
echo "1. Copy backend/.env.example to backend/.env and configure it"
echo "2. Ensure PostgreSQL with PostGIS is running"
echo "3. Run 'cd backend && npm run db:push && npm run db:seed'"
echo "4. Run 'cd backend && npm run dev' to start the backend API"
echo "5. Run 'cd frontend && npm run dev' to start the frontend"
echo "6. Optional: run the RAG service from rag/ on port 8001"
echo "7. Optional: run the intelligence mock from intelligence-service/ on port 8000"
