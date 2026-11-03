#!/usr/bin/env python3
"""
Ingest PDF documents into Qdrant Cloud.

Run this script LOCALLY before deploying the API. The API on Render is
read-only - it never ingests.

Embeddings are produced by Cloudflare Workers AI (BGE-small-en-v1.5). The
canonical collection is ``disaster_docs`` and must contain only this vector
space (384 dimensions, L2-normalized, COSINE).

Usage
-----
    # Create/upsert the canonical collection (QDRANT_COLLECTION or disaster_docs)
    python -m ingest.ingest --pdf disaster.pdf

    # Explicit collection name
    python -m ingest.ingest --pdf disaster.pdf --collection disaster_docs

Environment variables required (loaded from .env automatically):
    QDRANT_URL
    QDRANT_API_KEY
    CLOUDFLARE_ACCOUNT_ID
    CLOUDFLARE_API_TOKEN
"""
from __future__ import annotations

import argparse
import os
import sys
import time
from collections.abc import Callable, Sequence

from dotenv import load_dotenv
from qdrant_client import QdrantClient
from qdrant_client.http import models as qmodels

from ingest.chunker import CHUNK_OVERLAP, CHUNK_SIZE, Chunk, extract_chunks

load_dotenv()

EMBEDDING_DIM = 384
DEFAULT_MODEL = "@cf/baai/bge-small-en-v1.5"
UPSERT_BATCH_SIZE = 32


def _get_env(key: str) -> str:
    val = os.environ.get(key, "").strip()
    if not val:
        print(f"[ERROR] Environment variable '{key}' is not set.", file=sys.stderr)
        sys.exit(1)
    return val


def embed_and_upsert(
    client: QdrantClient,
    collection: str,
    chunks: Sequence[Chunk],
    batch_size: int = UPSERT_BATCH_SIZE,
    embed_many: Callable[[Sequence[str]], list[list[float]]] | None = None,
) -> int:
    """Embed *chunks* and upsert them into *collection*. Returns the count."""
    if embed_many is None:
        from app.services.embedder import embed_many as provider_embed
    else:
        provider_embed = embed_many

    total = len(chunks)
    upserted = 0
    t0 = time.perf_counter()

    for i in range(0, total, batch_size):
        batch = chunks[i : i + batch_size]
        vectors = provider_embed([c["text"] for c in batch])
        if len(vectors) != len(batch):
            raise RuntimeError(
                f"Embedding provider returned {len(vectors)} vectors for {len(batch)} chunks."
            )

        points = [
            qmodels.PointStruct(
                id=c["id"],
                vector=vector,
                payload={
                    "text": c["text"],
                    "source": c["source"],
                    "page": c["page"],
                    "chunk_index": c["chunk_index"],
                },
            )
            for c, vector in zip(batch, vectors)
        ]
        client.upsert(collection_name=collection, points=points)
        upserted += len(points)

        pct = upserted / total * 100
        bar = "#" * int(pct / 5) + "." * (20 - int(pct / 5))
        print(f"\r      [{bar}] {upserted}/{total} ({pct:.0f}%)", end="", flush=True)

    elapsed = time.perf_counter() - t0
    print(f"\n      Embedded and upserted {upserted} chunks in {elapsed:.1f}s")
    return upserted


def main() -> None:
    model_name = os.environ.get("CLOUDFLARE_EMBEDDING_MODEL", DEFAULT_MODEL).strip()

    parser = argparse.ArgumentParser(
        description="Ingest a PDF into Qdrant Cloud for the DRCIP RAG API."
    )
    parser.add_argument("--pdf", required=True, help="Path to the PDF file.")
    parser.add_argument(
        "--collection",
        default=os.environ.get("QDRANT_COLLECTION", "disaster_docs").strip()
        or "disaster_docs",
        help="Qdrant collection name (default: QDRANT_COLLECTION or disaster_docs).",
    )
    args = parser.parse_args()

    if not os.path.isfile(args.pdf):
        print(f"[ERROR] File not found: {args.pdf}", file=sys.stderr)
        sys.exit(1)

    qdrant_url = _get_env("QDRANT_URL")
    qdrant_api_key = _get_env("QDRANT_API_KEY")

    print(f"[1/5] Connecting to Qdrant at {qdrant_url} ...")
    client = QdrantClient(url=qdrant_url, api_key=qdrant_api_key)

    print(f"[2/5] Setting up collection '{args.collection}' ...")
    if not client.collection_exists(args.collection):
        client.create_collection(
            collection_name=args.collection,
            vectors_config=qmodels.VectorParams(
                size=EMBEDDING_DIM,
                distance=qmodels.Distance.COSINE,
            ),
        )
        print(f"      Collection '{args.collection}' created (dim={EMBEDDING_DIM}, COSINE).")
    else:
        print(f"      Collection '{args.collection}' already exists - upserting into it.")

    print(f"[3/5] Extracting chunks from '{args.pdf}' ...")
    print(f"      chunk_size={CHUNK_SIZE} chars, overlap={CHUNK_OVERLAP} chars")
    t0 = time.perf_counter()
    chunks = list(extract_chunks(args.pdf))
    elapsed = time.perf_counter() - t0
    print(f"      -> {len(chunks)} chunks extracted in {elapsed:.2f}s")

    if not chunks:
        print("[WARN] No chunks extracted - the PDF may be empty or image-only.")
        sys.exit(0)

    print(f"[4/5] Embedding model: '{model_name}' (Cloudflare Workers AI)")
    print(f"[5/5] Embedding and upserting {len(chunks)} chunks (batch_size={UPSERT_BATCH_SIZE}) ...")
    embed_and_upsert(client, args.collection, chunks)

    print("\nDone! Ingestion complete.")
    print(f"  Collection : {args.collection}")
    print(f"  Chunks     : {len(chunks)}")
    print(f"  Model      : {model_name} (dim={EMBEDDING_DIM})")
    print(f"\nCanonical collection: QDRANT_COLLECTION={args.collection}")


if __name__ == "__main__":
    main()
