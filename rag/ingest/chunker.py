"""
PDF chunker — extracts page-aware text chunks suitable for RAG ingestion.

Strategy
────────
• Extract text per page with pypdf.
• For pages that contain a disaster-event table, parse the table rows from
  pypdf's layout-preserving extraction so each event record stays together.
• Apply a character-level sliding window to ordinary paragraph text so chunks
  never span page boundaries — this keeps source citations page-accurate.
• Skip pages with fewer than MIN_CHARS useful characters (blank / image-only).
• Normalise whitespace for ordinary text.

Chunk IDs
─────────
Each chunk gets a deterministic UUID derived from (source, page, char_offset)
so re-running ingestion on the same PDF is idempotent (Qdrant upsert).
"""
from __future__ import annotations

import os
import re
import uuid
from collections.abc import Generator, Iterable
from typing import TypedDict

from pypdf import PdfReader

# ── Tuneable constants ────────────────────────────────────────────────────────
CHUNK_SIZE = 900       # characters  (~180-220 tokens for English prose)
CHUNK_OVERLAP = 120    # characters  (~13 % overlap to preserve context at seams)
MIN_CHARS = 60         # skip chunks / pages shorter than this

_EVENT_HEADER_RE = re.compile(r"\bEvent\b", re.IGNORECASE)
_DATE_HEADER_RE = re.compile(r"\bDate\b", re.IGNORECASE)
_PLACE_HEADER_RE = re.compile(r"\bPlace\b", re.IGNORECASE)
_FACTS_HEADER_RE = re.compile(r"\bKey facts\b", re.IGNORECASE)
_SECTION_START_RE = re.compile(r"^\s*(?:Part\s+\d+|\d+(?:\.\d+)+\s|\[SEC\s)", re.IGNORECASE)
_BOILERPLATE_RE = re.compile(
    r"^(?:DRCIP Knowledge Base|Not an official government publication|Page\s+\d+)\b",
    re.IGNORECASE,
)


class Chunk(TypedDict):
    id: str            # deterministic UUID string
    text: str
    source: str        # filename
    page: int          # 1-based
    chunk_index: int   # global sequence number across the whole PDF


def _make_id(source: str, page: int, char_offset: int) -> str:
    """Create a deterministic UUID5 from (source, page, offset)."""
    key = f"{source}::{page}::{char_offset}"
    return str(uuid.uuid5(uuid.NAMESPACE_DNS, key))


def _normalise(text: str) -> str:
    return " ".join(text.split())


def _make_chunk(source: str, page: int, offset: int, text: str) -> Chunk:
    return Chunk(
        id=_make_id(source, page, offset),
        text=text,
        source=source,
        page=page,
        chunk_index=0,
    )


def _chunk_text(
    text: str,
    *,
    source: str,
    page: int,
    base_offset: int = 0,
    chunk_size: int = CHUNK_SIZE,
    chunk_overlap: int = CHUNK_OVERLAP,
) -> Generator[Chunk, None, None]:
    """Yield sliding-window chunks for ordinary paragraph text."""
    text = _normalise(text)
    if len(text) < MIN_CHARS:
        return

    start = 0
    while start < len(text):
        end = min(start + chunk_size, len(text))
        chunk_text = text[start:end].strip()

        if len(chunk_text) >= MIN_CHARS:
            yield _make_chunk(source, page, base_offset + start, chunk_text)

        if end >= len(text):
            break
        start = end - chunk_overlap


def _event_header_columns(line: str) -> tuple[int, int, int, int] | None:
    """Return table column start positions when *line* is an event-table header."""
    matches = [
        _EVENT_HEADER_RE.search(line),
        _DATE_HEADER_RE.search(line),
        _PLACE_HEADER_RE.search(line),
        _FACTS_HEADER_RE.search(line),
    ]
    if any(match is None for match in matches):
        return None

    positions = tuple(match.start() for match in matches)  # type: ignore[union-attr]
    if not positions[0] < positions[1] < positions[2] < positions[3]:
        return None
    return positions  # type: ignore[return-value]


def _line_offsets(lines: list[str]) -> list[int]:
    offsets: list[int] = []
    position = 0
    for line in lines:
        offsets.append(position)
        position += len(line) + 1
    return offsets


def _join_field(current: str, addition: str) -> str:
    if not current:
        return addition
    if not addition:
        return current
    return f"{current} {addition}"


def _parse_event_rows(
    lines: list[str],
    *,
    start: int,
    columns: tuple[int, int, int, int],
    offsets: list[int],
) -> tuple[list[dict[str, str]], list[int], int]:
    """Parse event rows using fixed layout columns.

    Returns ``(rows, row_offsets, last_consumed_line)``. A row starts when the
    event column is populated together with at least one other column. An
    event-only line (for example a wrapped ``(Kedarnath)``) is a continuation
    of the previous event name.
    """
    event_start, date_start, place_start, facts_start = columns
    rows: list[dict[str, str]] = []
    row_offsets: list[int] = []
    current: dict[str, str] | None = None
    current_offset = 0
    last_consumed = start

    for index in range(start, len(lines)):
        line = lines[index]
        if not line.strip():
            continue

        stripped = _normalise(line)
        if _SECTION_START_RE.match(stripped) or _BOILERPLATE_RE.match(stripped):
            break

        event = line[event_start:date_start].strip()
        date = line[date_start:place_start].strip()
        place = line[place_start:facts_start].strip()
        facts = line[facts_start:].strip()
        if not any((event, date, place, facts)):
            continue

        if event and not date and not place and current is not None and event[:1] in "([":
            current["event"] = _join_field(current["event"], event)
            if facts:
                current["facts"] = _join_field(current["facts"], facts)
        elif event:
            if date or place or facts:
                if current is not None:
                    rows.append(current)
                    row_offsets.append(current_offset)
                current = {
                    "event": event,
                    "date": date,
                    "place": place,
                    "facts": facts,
                }
                current_offset = offsets[index]
            elif current is not None:
                current["event"] = _join_field(current["event"], event)
            else:
                current = {"event": event, "date": "", "place": "", "facts": ""}
                current_offset = offsets[index]
        elif current is not None:
            if date:
                current["date"] = _join_field(current["date"], date)
            if place:
                current["place"] = _join_field(current["place"], place)
            if facts:
                current["facts"] = _join_field(current["facts"], facts)

        last_consumed = index + 1

    if current is not None:
        rows.append(current)
        row_offsets.append(current_offset)

    return rows, row_offsets, last_consumed


def _split_text(text: str, limit: int) -> Generator[str, None, None]:
    """Split text on word boundaries without losing content."""
    text = text.strip()
    while text:
        if len(text) <= limit:
            yield text
            return
        cut = text.rfind(" ", 0, limit)
        if cut <= 0:
            cut = limit
        yield text[:cut].strip()
        text = text[cut:].strip()


def _chunk_event_row(
    row: dict[str, str],
    *,
    source: str,
    page: int,
    offset: int,
    chunk_size: int = CHUNK_SIZE,
) -> Generator[Chunk, None, None]:
    """Yield one chunk per event record, splitting only if the record is huge."""
    prefix_parts = [f"Event: {row['event'].strip()}"]
    if row["date"]:
        prefix_parts.append(f"Date: {row['date'].strip()}")
    if row["place"]:
        prefix_parts.append(f"Place: {row['place'].strip()}")
    prefix = " | ".join(prefix_parts)
    facts = row["facts"].strip()
    if facts:
        prefix = f"{prefix} | Key facts: "

    record = f"{prefix}{facts}".strip()
    if len(record) <= chunk_size:
        if len(record) >= MIN_CHARS:
            yield _make_chunk(source, page, offset, record)
        return

    available = chunk_size - len(prefix)
    if available < MIN_CHARS:
        parts = list(_split_text(record, chunk_size))
    else:
        parts = [f"{prefix}{part}" for part in _split_text(facts, available)]

    for part_index, part in enumerate(parts):
        if len(part) >= MIN_CHARS:
            yield _make_chunk(source, page, offset + part_index, part)


def _without_page_boilerplate(lines: Iterable[str]) -> list[str]:
    return [line for line in lines if not _BOILERPLATE_RE.match(line.strip())]


def _find_event_header(lines: list[str]) -> tuple[int, tuple[int, int, int, int]] | None:
    for index, line in enumerate(lines):
        columns = _event_header_columns(line)
        if columns is not None:
            return index, columns
    return None


def _page_chunks(
    *,
    source: str,
    page_obj,
    page_number: int,
    plain_text: str,
    chunk_size: int,
    chunk_overlap: int,
) -> Generator[Chunk, None, None]:
    plain_text = plain_text or ""
    if len(_normalise(plain_text)) < MIN_CHARS:
        return

    layout_text = ""
    if _EVENT_HEADER_RE.search(plain_text) and _FACTS_HEADER_RE.search(plain_text):
        try:
            layout_text = page_obj.extract_text(extraction_mode="layout") or ""
        except Exception:
            # Layout extraction is an enhancement; fall back to plain text.
            layout_text = ""

    layout_lines = layout_text.splitlines() if layout_text.strip() else []
    header = _find_event_header(layout_lines) if layout_lines else None
    if header is None:
        yield from _chunk_text(
            plain_text,
            source=source,
            page=page_number,
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
        )
        return

    header_index, columns = header
    offsets = _line_offsets(layout_lines)
    rows, row_offsets, last_consumed = _parse_event_rows(
        layout_lines,
        start=header_index + 1,
        columns=columns,
        offsets=offsets,
    )
    if not rows:
        yield from _chunk_text(
            plain_text,
            source=source,
            page=page_number,
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
        )
        return

    before_text = " ".join(_without_page_boilerplate(layout_lines[:header_index]))
    yield from _chunk_text(
        before_text,
        source=source,
        page=page_number,
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
    )

    for row, row_offset in zip(rows, row_offsets):
        yield from _chunk_event_row(
            row,
            source=source,
            page=page_number,
            offset=row_offset,
            chunk_size=chunk_size,
        )

    after_text = " ".join(_without_page_boilerplate(layout_lines[last_consumed:]))
    after_offset = offsets[last_consumed] if last_consumed < len(offsets) else 0
    yield from _chunk_text(
        after_text,
        source=source,
        page=page_number,
        base_offset=after_offset,
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
    )


def extract_chunks(
    pdf_path: str,
    chunk_size: int = CHUNK_SIZE,
    chunk_overlap: int = CHUNK_OVERLAP,
) -> Generator[Chunk, None, None]:
    """
    Yield Chunk dicts from *pdf_path*.

    Parameters
    ----------
    pdf_path:     Path to the PDF file.
    chunk_size:   Maximum characters per chunk.
    chunk_overlap: Characters shared between adjacent chunks on the same page.
    """
    source_name = os.path.basename(pdf_path)
    reader = PdfReader(pdf_path)
    global_index = 0

    for page_num, page in enumerate(reader.pages, start=1):
        plain_text = page.extract_text() or ""

        for chunk in _page_chunks(
            source=source_name,
            page_obj=page,
            page_number=page_num,
            plain_text=plain_text,
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
        ):
            chunk["chunk_index"] = global_index
            global_index += 1
            yield chunk
