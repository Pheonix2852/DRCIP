"""Lazy embedding-model loading and health-reporting tests (offline)."""
from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app.dependencies import get_groq_client, get_qdrant_client
from app.main import app
from app.services import embedder


class _Vector:
    def tolist(self) -> list[float]:
        return [0.0] * embedder.EMBEDDING_DIM


class _FakeModel:
    def __init__(self, name: str) -> None:
        self.name = name

    def encode(self, text: str, **kwargs) -> _Vector:  # noqa: ARG002
        return _Vector()


def _install_fake_model(monkeypatch) -> list[str]:
    created: list[str] = []

    def factory() -> _FakeModel:
        created.append(embedder.MODEL_NAME)
        return _FakeModel(embedder.MODEL_NAME)

    monkeypatch.setattr("app.services.embedder._create_model", factory)
    return created


@pytest.fixture(autouse=True)
def _clear_model_cache():
    embedder._load_model.cache_clear()
    yield
    embedder._load_model.cache_clear()


@pytest.fixture()
def offline_client():
    app.dependency_overrides[get_qdrant_client] = lambda: MagicMock()
    app.dependency_overrides[get_groq_client] = lambda: MagicMock()
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


def test_startup_does_not_load_embedding_model(offline_client):
    assert offline_client.get("/health").status_code == 200
    assert embedder.is_model_loaded() is False


def test_first_embed_loads_the_model(monkeypatch):
    created = _install_fake_model(monkeypatch)

    assert embedder.is_model_loaded() is False
    vector = embedder.embed("flood guidance")

    assert created == [embedder.MODEL_NAME]
    assert vector == [0.0] * embedder.EMBEDDING_DIM
    assert embedder.is_model_loaded() is True


def test_subsequent_embeds_reuse_the_cached_model(monkeypatch):
    created = _install_fake_model(monkeypatch)

    embedder.embed("one")
    embedder.embed("two")

    assert created == [embedder.MODEL_NAME]


def test_concurrent_first_embeds_load_model_once(monkeypatch):
    created: list[str] = []

    def factory() -> _FakeModel:
        created.append(embedder.MODEL_NAME)
        time.sleep(0.05)
        return _FakeModel(embedder.MODEL_NAME)

    monkeypatch.setattr("app.services.embedder._create_model", factory)

    with ThreadPoolExecutor(max_workers=8) as pool:
        vectors = list(pool.map(lambda _: embedder.embed("flood"), range(8)))

    assert created == [embedder.MODEL_NAME]
    assert all(vector == [0.0] * embedder.EMBEDDING_DIM for vector in vectors)


def test_health_reports_model_state_without_loading_it(monkeypatch, offline_client):
    created = _install_fake_model(monkeypatch)

    assert offline_client.get("/health").json()["model_loaded"] is False
    assert created == []

    embedder.embed("warm the cache")
    assert offline_client.get("/health").json()["model_loaded"] is True
    assert created == [embedder.MODEL_NAME]
