#!/usr/bin/env python3
"""
Convert USFM files to plain text verse lines.

- Starts at chapter 1 (\\c 1)
- Removes formatting markers (\\p, \\cl, \\q, \\q#, \\qs, \\qs*, \\b, \\m, \\s5, \\d)
- Merges multi-line verses into one line
- Emits each verse as: BOOK CHAPTER:VERSE text
"""

import argparse
import re
from pathlib import Path


def get_book_code_from_filename(filename: str) -> str | None:
    """Extract 3-letter book code from filename pattern {number}-{book_code}.usfm"""
    stem = Path(filename).stem
    parts = stem.split("-", 1)
    return parts[1] if len(parts) >= 2 else None


def process_usfm(content: str, book_code: str) -> str:
    lines = content.splitlines()

    # 1. Delete from start until (and including the line before) the first \c 1
    start = 0
    for i, line in enumerate(lines):
        if re.match(r"^\\c\s+1\b", line.strip()):
            start = i
            break
    lines = lines[start:]

    # 2. Remove \p and \cl lines
    lines = [
        ln
        for ln in lines
        if ln.strip() not in (r"\p",)
        and not ln.strip().startswith((r"\p ", r"\cl"))
    ]

    # 3. Build verse lines in the format: BOOK CHAPTER:VERSE text
    result = []
    current_chapter: str | None = None
    current_verse_num: str | None = None
    current_verse_parts: list[str] = []
    marker_pattern = re.compile(r"\\(?:q\d*|qs\*?|b|m|s5|d)(?=\s|$)")

    def flush_verse() -> None:
        if current_chapter and current_verse_num and current_verse_parts:
            verse_text = " ".join(current_verse_parts)
            verse_text = marker_pattern.sub("", verse_text)
            verse_text = re.sub(r"\s+", " ", verse_text).strip()
            if verse_text:
                result.append(f"{book_code} {current_chapter}:{current_verse_num} {verse_text}")
        current_verse_parts.clear()

    for line in lines:
        stripped = line.strip()
        if re.match(r"^\\c\s+\d+", stripped):
            flush_verse()
            match = re.match(r"^\\c\s+(\d+)", stripped)
            if match:
                current_chapter = match.group(1)
                current_verse_num = None
        elif stripped.startswith(r"\v "):
            flush_verse()
            match = re.match(r"^\\v\s+(\S+)\s*(.*)$", stripped)
            if match:
                current_verse_num = match.group(1)
                verse_start = match.group(2).strip()
                if verse_start:
                    current_verse_parts.append(verse_start)
        elif stripped and current_verse_num:
            # Continuation of previous verse -> merge into current verse
            current_verse_parts.append(stripped)

    flush_verse()

    # 4. Trim top and bottom
    while result and not result[0].strip():
        result.pop(0)
    while result and not result[-1].strip():
        result.pop()

    return "\n".join(result)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Convert USFM files to plain verse text (BOOK CHAPTER:VERSE text)."
    )
    parser.add_argument(
        "input_dir",
        type=Path,
        help="Directory containing .usfm files",
    )
    parser.add_argument(
        "output_dir",
        type=Path,
        help="Directory where .txt files will be written",
    )
    args = parser.parse_args()

    input_dir: Path = args.input_dir
    output_dir: Path = args.output_dir

    if not input_dir.is_dir():
        raise SystemExit(f"Input directory does not exist: {input_dir}")

    output_dir.mkdir(parents=True, exist_ok=True)

    usfm_files = list(input_dir.glob("*.usfm"))
    if not usfm_files:
        print(f"No .usfm files found in {input_dir}")
        return

    for path in sorted(usfm_files):
        book_code = get_book_code_from_filename(path.name)
        if not book_code:
            print(f"Skipping (no book code in name): {path.name}")
            continue

        text = path.read_text(encoding="utf-8", errors="replace")
        out_content = process_usfm(text, book_code)
        out_path = output_dir / f"{book_code}.txt"
        out_path.write_text(out_content, encoding="utf-8")
        print(f"Wrote {out_path}")


if __name__ == "__main__":
    main()
