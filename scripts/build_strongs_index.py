#!/usr/bin/env python3
"""
Scan USFM files in a directory and build an index keyed by Strong's numbers.

Each ``\\w ... \\w*`` word with a ``strong="..."`` attribute becomes one index
record. The same Strong's number may appear many times; the index stores a list
of ``{"word": ..., "book": ..., "chapter": ..., "verse": ...}`` entries per key.

Usage:
    python build_strongs_index.py input/ASV
    python build_strongs_index.py input/ASV -o strongs_index.json
"""

from __future__ import annotations

import argparse
import csv
import json
import re
from collections import defaultdict
from pathlib import Path

# Sequential markers so chapter/verse stay aligned with following \\w content.
_TOKEN_RE = re.compile(
    r'\\id\s+(\S+)'
    r'|\\c\s+(\d+)'
    r'|\\v\s+(\d+)'
    r'|\\w\s+((?:(?!\\w\*).)+)\\w\*',
    re.DOTALL,
)

_STRONG_RE = re.compile(r'strong="([^"]+)"')


def _surface_word(w_body: str) -> str:
    """Text before the first pipe is the rendered word; collapse whitespace."""
    text = w_body.split("|", 1)[0] if "|" in w_body else w_body
    return re.sub(r"\s+", " ", text).strip()


def parse_usfm_path(path: Path) -> list[tuple[str, str, str, int, int]]:
    """
    Return list of (strongs_number, word, book, chapter, verse) for one file.

    Skips \\w units with no strong= attribute, or any \\w before the first \\v.
    """
    content = path.read_text(encoding="utf-8", errors="replace")
    book: str | None = None
    chapter: int | None = None
    verse: int | None = None
    out: list[tuple[str, str, str, int, int]] = []

    for m in _TOKEN_RE.finditer(content):
        if m.group(1) is not None:
            book = m.group(1)
        elif m.group(2) is not None:
            chapter = int(m.group(2))
        elif m.group(3) is not None:
            verse = int(m.group(3))
        elif m.group(4) is not None:
            if book is None or chapter is None or verse is None:
                continue
            w_body = m.group(4)
            sm = _STRONG_RE.search(w_body)
            if not sm:
                continue
            strong = sm.group(1)
            word = _surface_word(w_body)
            out.append((strong, word, book, chapter, verse))

    return out


def build_index(input_dir: Path) -> dict[str, list[dict[str, str | int]]]:
    """Merge all ``*.usfm`` files under ``input_dir`` into one Strong's index."""
    index: dict[str, list[dict[str, str | int]]] = defaultdict(list)
    usfm_files = sorted(input_dir.glob("*.usfm"))
    for fp in usfm_files:
        for strong, word, book, chapter, verse in parse_usfm_path(fp):
            index[strong].append(
                {"word": word, "book": book, "chapter": chapter, "verse": verse}
            )
    return dict(index)


def write_csv(index: dict[str, list[dict[str, str | int]]], output_path: Path) -> None:
    """Write index rows as CSV: strong, word, book, chapter, verse."""
    with output_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["strong", "word", "book", "chapter", "verse"])
        for strong in sorted(index):
            for entry in index[strong]:
                writer.writerow(
                    [strong, entry["word"], entry["book"], entry["chapter"], entry["verse"]]
                )


def main() -> None:
    parser = argparse.ArgumentParser(description="Build Strong's index from USFM.")
    parser.add_argument(
        "input_dir",
        type=Path,
        help="Directory containing .usfm files",
    )
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        help="Write output to this path (JSON or CSV)",
    )
    parser.add_argument(
        "--format",
        choices=("json", "csv"),
        default="csv",
        help="Output format (default: csv)",
    )
    args = parser.parse_args()
    input_dir = args.input_dir
    if not input_dir.is_dir():
        raise SystemExit(f"Not a directory: {input_dir}")

    if args.format == "csv" and not args.output:
        raise SystemExit("CSV output requires --output path.")

    index = build_index(input_dir)
    if args.format == "csv":
        write_csv(index, args.output)
    elif args.output:
        args.output.write_text(
            json.dumps(index, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
    else:
        print(json.dumps(index, ensure_ascii=False))


if __name__ == "__main__":
    main()
