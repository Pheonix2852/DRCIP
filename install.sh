#!/bin/bash

echo "Installing DRCIP project dependencies..."

# Initialize submodules
git submodule update --init --recursive

# Install shared contracts dependencies
cd shared/contracts
npm install
cd ..

# Install backend dependencies
cd backend
npm install
cd ..

# Install intelligence service dependencies
cd intelligence-service
pip install -e .
cd ..

# Install frontend dependencies
cd frontend
npm install
cd ..

echo "✓ All dependencies installed successfully"
echo ""
echo "Next steps:"
echo "1. Ensure PostgreSQL with PostGIS is running"
echo "2. Run 'cd backend && npm run db:push' to initialize the database"
echo "3. Run 'cd frontend && npm run dev' to start the frontend"
echo "4. Run 'cd intelligence-service && uvicorn app.main:app --reload' to start the intelligence service"
echo "5. Run 'cd backend && npm run dev' to start the backend API"