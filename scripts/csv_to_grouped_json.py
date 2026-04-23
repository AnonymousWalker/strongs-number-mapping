#!/usr/bin/env python3
"""
Convert a CSV file to a JSON map grouped by the first column.

Example:
    CATEGORY,HEBREW,STRONGS
    Abomination (abominable),פִגּוּל,H6292
    Abomination (abominable),שִׁקּוּץ,H8251

Becomes:
    {
      "Abomination (abominable)": [
        {"HEBREW": "פִגּוּל", "STRONGS": "H6292"},
        {"HEBREW": "שִׁקּוּץ", "STRONGS": "H8251"}
      ]
    }
"""

from __future__ import annotations

import argparse
import csv
import json
from collections import defaultdict
from pathlib import Path


def csv_to_grouped_map(input_path: Path) -> dict[str, list[dict[str, str]]]:
    grouped: dict[str, list[dict[str, str]]] = defaultdict(list)

    with input_path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f)
        rows = list(reader)

    if not rows:
        return {}

    header = rows[0]
    if len(header) < 2:
        raise ValueError("CSV must have at least 2 columns.")

    key_name = header[0]
    value_columns = header[1:]

    for row in rows[1:]:
        if not row:
            continue

        # Pad short rows so indexing is safe.
        if len(row) < len(header):
            row = row + [""] * (len(header) - len(row))

        group_key = row[0].strip()
        if not group_key:
            continue

        payload: dict[str, str] = {}
        for i, col_name in enumerate(value_columns, start=1):
            payload[col_name] = row[i].strip() if i < len(row) else ""

        grouped[group_key].append(payload)

    # Keep insertion order from first encounter of each group key.
    return dict(grouped)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Convert CSV to grouped JSON map keyed by column 1."
    )
    parser.add_argument(
        "-i",
        "--input",
        required=True,
        help="Input CSV path",
    )
    parser.add_argument(
        "-o",
        "--output",
        required=True,
        help="Output JSON path",
    )
    parser.add_argument(
        "--indent",
        type=int,
        default=2,
        help="JSON indentation spaces (default: 2)",
    )
    args = parser.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)

    grouped = csv_to_grouped_map(input_path)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as f:
        json.dump(grouped, f, ensure_ascii=False, indent=args.indent)

    total_groups = len(grouped)
    total_items = sum(len(items) for items in grouped.values())
    print(f"Input: {input_path}")
    print(f"Output: {output_path}")
    print(f"Groups: {total_groups}")
    print(f"Items: {total_items}")


if __name__ == "__main__":
    main()
