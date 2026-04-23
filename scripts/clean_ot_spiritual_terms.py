#!/usr/bin/env python3
"""
Clean OT spiritual terms CSV with the full pipeline used in chat:
1) Remove fully empty rows.
2) Fill empty first-column values from the nearest category above.
3) Remove rows missing first or third column values.
4) Normalize third column to Strong's token: (H|h)\\d{1,4}.

This script reads/writes CSV safely (including quoted multiline cells).
"""

from __future__ import annotations

import argparse
import csv
import re
from pathlib import Path
from typing import List

STRONGS_PATTERN = re.compile(r"(?i)\b(h\d{1,4})\b")


def is_blank(value: str) -> bool:
    return value.strip() == ""


def row_is_fully_empty(row: List[str]) -> bool:
    return len(row) == 0 or all(is_blank(cell) for cell in row)


def ensure_len(row: List[str], size: int = 3) -> List[str]:
    if len(row) >= size:
        return row
    return row + [""] * (size - len(row))


def clean_rows(rows: List[List[str]]) -> tuple[List[List[str]], dict]:
    stats = {
        "input_rows": len(rows),
        "removed_empty_rows": 0,
        "filled_first_column": 0,
        "removed_missing_first_or_third": 0,
        "third_column_normalized": 0,
        "third_column_emptied_no_match": 0,
        "output_rows": 0,
    }

    if not rows:
        stats["output_rows"] = 0
        return rows, stats

    header = rows[0]
    data = rows[1:]

    # 1) Remove fully empty rows
    step1: List[List[str]] = []
    for row in data:
        if row_is_fully_empty(row):
            stats["removed_empty_rows"] += 1
            continue
        step1.append(ensure_len(row, 3))

    # 2) Fill down first column from nearest category above
    step2: List[List[str]] = []
    current_category = ""
    for row in step1:
        first = row[0].strip()
        if first:
            current_category = row[0]
        elif current_category:
            row[0] = current_category
            stats["filled_first_column"] += 1
        step2.append(row)

    # 3) Remove rows missing first or third column
    step3: List[List[str]] = []
    for row in step2:
        if is_blank(row[0]) or is_blank(row[2]):
            stats["removed_missing_first_or_third"] += 1
            continue
        step3.append(row)

    # 4) Normalize third column to only Strong's H/h + digits
    final_rows: List[List[str]] = []
    for row in step3:
        original = row[2]
        match = STRONGS_PATTERN.search(original)
        normalized = match.group(1) if match else ""
        if normalized != original:
            stats["third_column_normalized"] += 1
            if normalized == "":
                stats["third_column_emptied_no_match"] += 1
        row[2] = normalized
        final_rows.append(row)

    cleaned = [header] + final_rows
    stats["output_rows"] = len(cleaned)
    return cleaned, stats


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Clean OTSpiritualTerms CSV using the chat cleanup pipeline."
    )
    parser.add_argument(
        "-i",
        "--input",
        default="input/OTSpiritualTerms.csv",
        help="Input CSV path (default: input/OTSpiritualTerms.csv)",
    )
    parser.add_argument(
        "-o",
        "--output",
        help="Output CSV path. If omitted, input file is overwritten.",
    )
    args = parser.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output) if args.output else input_path

    with input_path.open("r", encoding="utf-8-sig", newline="") as f:
        rows = list(csv.reader(f))

    cleaned, stats = clean_rows(rows)

    with output_path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f, lineterminator="\n")
        writer.writerows(cleaned)

    print(f"Input path:  {input_path}")
    print(f"Output path: {output_path}")
    for key, value in stats.items():
        print(f"{key}: {value}")


if __name__ == "__main__":
    main()
