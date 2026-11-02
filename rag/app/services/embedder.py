"""
Embedding service.

Uses all-MiniLM-L6-v2 (384-dim, ~22 MB weights) for query encoding.
The model is loaded lazily on the first embedding request and cached for the
process lifetime. On Render's 512 MB free tier this avoids paying the model's
resident memory cost at startup, before a query actually needs it.

CPU-only PyTorch is installed in the Dockerfile to avoid the ~2 GB GPU variant.
"""
from __future__ import annotations

from functools import lru_cache
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from sentence_transformers import SentenceTransformer

MODEL_NAME = "all-MiniLM-L6-v2"
EMBEDDING_DIM = 384


def _create_model() -> "SentenceTransformer":
    """Construct the SentenceTransformer (deferred import keeps startup light)."""
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer(MODEL_NAME)


@lru_cache(maxsize=1)
def _load_model() -> "SentenceTransformer":
    """Load and cache the model on first use."""
    return _create_model()


def is_model_loaded() -> bool:
    """Report whether the cached model is resident without loading it."""
    return _load_model.cache_info().currsize > 0


def embed(text: str) -> list[float]:
    """
    Encode *text* into a normalised 384-dimensional vector.

    Normalisation (L2) ensures cosine similarity equals dot product,
    which is what Qdrant uses for COSINE distance collections.
    """
    model = _load_model()
    vector = model.encode(text, normalize_embeddings=True, show_progress_bar=False)
    return vector.tolist()
