"""DRCIP FastAPI Intelligence Service"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .modules.severity import router as severity_router
from .modules.demand import router as demand_router
from .modules.optimization import router as optimization_router
from .modules.rag import router as rag_router

app = FastAPI(
    title="DRCIP Intelligence Service",
    description="FastAPI intelligence service for DRCIP",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(severity_router, prefix="/internal/v1/predict", tags=["severity"])
app.include_router(demand_router, prefix="/internal/v1/forecast", tags=["demand"])
app.include_router(optimization_router, prefix="/internal/v1/optimize", tags=["optimization"])
app.include_router(rag_router, prefix="/internal/v1/rag", tags=["rag"])


@app.get("/health")
async def health():
    return {"status": "healthy", "timestamp": "2026-09-21T12:00:00Z"}


@app.get("/version")
async def version():
    return {
        "service": "drcip-intelligence",
        "version": "1.0.0",
        "modules": {
            "severity": "severity-v1-mock",
            "demand": "demand-v1-mock",
            "optimization": "optimizer-v1-mock",
            "rag": "rag-v1-mock",
        },
        "models": {
            "severity": "mock-v1",
            "demand": "mock-v1",
            "optimization": "mock-v1",
            "rag": "mock-v1",
        },
    }