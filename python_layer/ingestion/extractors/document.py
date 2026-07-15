"""
ingestion/extractors/document.py
Extracts unstructured documents into ontology-friendly text rows.

The ingestion pipeline expects tabular rows. For PDFs, Word files, plain text,
Markdown, and images, we preserve the same contract by emitting one row per
page/paragraph/chunk with document metadata plus extracted text.
"""
from __future__ import annotations

import io
from pathlib import Path
from typing import Any

_SAMPLE_ROWS = 8
_MAX_ROWS = 10_000
_ANALYSIS_ROWS = 1_000
_CHUNK_SIZE = 3500


def _chunks(text: str, chunk_size: int = _CHUNK_SIZE) -> list[str]:
    cleaned = "\n".join(line.strip() for line in (text or "").splitlines() if line.strip())
    if not cleaned:
        return []
    return [cleaned[i:i + chunk_size] for i in range(0, len(cleaned), chunk_size)]


def _rows_from_chunks(chunks: list[str], filename: str, document_type: str, unit: str = "chunk") -> list[dict[str, Any]]:
    title = Path(filename).stem or filename
    rows = []
    for idx, text in enumerate(chunks, start=1):
        rows.append({
            "document_title": title,
            "document_type": document_type,
            "source_file": filename,
            "section_type": unit,
            "section_index": idx,
            "text": text,
        })
    return rows


def _extract_pdf(file_bytes: bytes, filename: str) -> list[dict[str, Any]]:
    try:
        from pypdf import PdfReader
    except Exception:
        try:
            from PyPDF2 import PdfReader
        except Exception as exc:
            raise ValueError("PDF support requires pypdf or PyPDF2. Install pypdf in the Python backend.") from exc

    try:
        reader = PdfReader(io.BytesIO(file_bytes))
        rows: list[dict[str, Any]] = []
        title = Path(filename).stem or filename
        for page_idx, page in enumerate(reader.pages, start=1):
            text = page.extract_text() or ""
            for chunk_idx, chunk in enumerate(_chunks(text), start=1):
                rows.append({
                    "document_title": title,
                    "document_type": "pdf",
                    "source_file": filename,
                    "page_number": page_idx,
                    "section_type": "page_text",
                    "section_index": chunk_idx,
                    "text": chunk,
                })
        return rows
    except Exception as exc:
        raise ValueError(f"Could not parse PDF '{filename}': {exc}") from exc


def _extract_docx(file_bytes: bytes, filename: str) -> list[dict[str, Any]]:
    try:
        from docx import Document
    except Exception as exc:
        raise ValueError("Word support requires python-docx in the Python backend.") from exc

    try:
        doc = Document(io.BytesIO(file_bytes))
        paragraphs = [p.text.strip() for p in doc.paragraphs if p.text and p.text.strip()]
        return _rows_from_chunks(paragraphs, filename, "word", unit="paragraph")
    except Exception as exc:
        raise ValueError(f"Could not parse Word document '{filename}': {exc}") from exc


def _extract_text(file_bytes: bytes, filename: str) -> list[dict[str, Any]]:
    text = file_bytes.decode("utf-8", errors="replace")
    ext = Path(filename).suffix.lower().lstrip(".") or "text"
    return _rows_from_chunks(_chunks(text), filename, ext, unit="chunk")


def _extract_image(file_bytes: bytes, filename: str) -> list[dict[str, Any]]:
    try:
        from PIL import Image
        image = Image.open(io.BytesIO(file_bytes))
        width, height = image.size
        mode = image.mode
    except Exception:
        width = height = None
        mode = None

    return [{
        "document_title": Path(filename).stem or filename,
        "document_type": "image",
        "source_file": filename,
        "section_type": "image_metadata",
        "section_index": 1,
        "text": "Image uploaded for ontology review. OCR text was not extracted by the local backend.",
        "image_width": width,
        "image_height": height,
        "image_mode": mode,
    }]


def extract(file_bytes: bytes, filename: str) -> dict[str, Any]:
    ext = Path(filename).suffix.lower()
    if ext == ".pdf":
        rows = _extract_pdf(file_bytes, filename)
    elif ext == ".docx":
        rows = _extract_docx(file_bytes, filename)
    elif ext == ".doc":
        raise ValueError("Legacy .doc files are not supported yet. Convert to .docx or PDF.")
    elif ext in {".txt", ".md", ".markdown", ".rtf"}:
        rows = _extract_text(file_bytes, filename)
    elif ext in {".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff"}:
        rows = _extract_image(file_bytes, filename)
    else:
        raise ValueError(f"Unsupported document format: {filename}")

    rows = rows[:_MAX_ROWS]
    columns = list(rows[0].keys()) if rows else []
    return {
        "columns": columns,
        "rows": rows,
        "row_count": len(rows),
        "rows_stored": len(rows),
        "rows_capped": False,
        "analysis_rows": rows[:_ANALYSIS_ROWS],
        "sample_rows": rows[:_SAMPLE_ROWS],
    }
