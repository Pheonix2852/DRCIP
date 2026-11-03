"""Shared pytest fixtures and environment setup.

All external services (Qdrant, Groq, Cloudflare Workers AI) are mocked, so the
suite runs offline.
"""
from __future__ import annotations

import os

# Set env vars before any app module is imported.
os.environ.setdefault("QDRANT_URL", "http://localhost:6333")
os.environ.setdefault("QDRANT_API_KEY", "test_qdrant_key")
os.environ.setdefault("GROQ_API_KEY", "test_groq_key")
os.environ.setdefault("API_KEYS", "test_bearer_key_123")
os.environ.setdefault("QDRANT_COLLECTION", "test_collection")
os.environ.setdefault("CLOUDFLARE_ACCOUNT_ID", "test_account_id")
os.environ.setdefault("CLOUDFLARE_API_TOKEN", "test_cloudflare_token")
