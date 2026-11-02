"""
Shared pytest fixtures and environment setup.

All external services (Qdrant, Groq) are mocked — tests run offline.
"""
from __future__ import annotations

import os

import pytest

# Set env vars before any app module is imported
os.environ.setdefault("QDRANT_URL", "http://localhost:6333")
os.environ.setdefault("QDRANT_API_KEY", "test_qdrant_key")
os.environ.setdefault("GROQ_API_KEY", "test_groq_key")
os.environ.setdefault("API_KEYS", "test_bearer_key_123")
os.environ.setdefault("QDRANT_COLLECTION", "test_collection")


@pytest.fixture(autouse=True)
def _never_load_embedding_model(monkeypatch):
    """
    Keep the suite offline and fast.

    The app loads the embedding model lazily on the first ``embed()`` call.
    This guard makes any accidental model construction fail loudly instead of
    downloading all-MiniLM-L6-v2 (~80 MB on a cold cache).
    """
    def _blocked(*args, **kwargs):
        raise AssertionError("embedding model must not be loaded in tests")

    # Patch the constructor, not the cached wrapper, so is_model_loaded() and
    # the lru_cache semantics remain testable without importing torch.
    monkeypatch.setattr(
        "app.services.embedder._create_model",
        _blocked,
    )
