"""Đọc kho tài liệu chính sách (data/policies/*.md), chỉ đọc. Mỗi file có front matter:
doc_code, title, doc_type, version, effective_date, is_active, source_file (Mục 21.3.2)."""
from __future__ import annotations

from pathlib import Path

META_KEYS = ("doc_code", "title", "doc_type", "version", "effective_date", "is_active", "source_file")


def parse_doc(text: str) -> tuple[dict, str]:
    meta: dict = {}
    body = text
    if text.startswith("---"):
        end = text.find("\n---", 3)
        if end != -1:
            for line in text[3:end].strip().splitlines():
                if ":" in line:
                    k, v = line.split(":", 1)
                    meta[k.strip()] = v.strip()
            body = text[end + 4:].lstrip("\n")
    meta["is_active"] = str(meta.get("is_active", "true")).lower() == "true"
    return meta, body


def load_docs(policies_dir: Path) -> list[dict]:
    docs = []
    if not policies_dir.is_dir():
        return docs
    for p in sorted(policies_dir.glob("*.md")):
        meta, body = parse_doc(p.read_text(encoding="utf-8"))
        if not meta.get("doc_code"):
            continue
        meta.setdefault("title", p.stem)
        meta.setdefault("source_file", p.name)
        docs.append({**{k: meta.get(k) for k in META_KEYS}, "content": body})
    return sorted(docs, key=lambda d: d["doc_code"])
