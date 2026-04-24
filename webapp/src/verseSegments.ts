import type { HighlightRange } from './highlightStorage'
import { mergeRanges } from './highlightStorage'

export type VerseSegment =
  | { type: 'text'; text: string; key: string }
  | { type: 'hl'; text: string; start: number; end: number; key: string }

const PLACEHOLDER_PREFIXES = [
  'Loading verse text',
  'Verse text not found',
  'Unable to load verse text',
  'Invalid verse reference',
]

export function isVerseTextHighlightable(verseText: string | undefined): verseText is string {
  if (!verseText || verseText.length < 2) return false
  return !PLACEHOLDER_PREFIXES.some((p) => verseText.startsWith(p))
}

export function verseTextToSegments(
  text: string,
  ranges: HighlightRange[],
  keyPrefix: string,
): VerseSegment[] {
  const clipped = ranges
    .map((r) => ({
      start: Math.max(0, Math.min(r.start, text.length)),
      end: Math.max(0, Math.min(r.end, text.length)),
    }))
    .filter((r) => r.end > r.start)

  const merged = mergeRanges(clipped)
  if (merged.length === 0) {
    return [{ type: 'text', text, key: `${keyPrefix}-t0` }]
  }

  const segments: VerseSegment[] = []
  let cursor = 0
  let index = 0
  for (const r of merged) {
    if (r.start > cursor) {
      segments.push({
        type: 'text',
        text: text.slice(cursor, r.start),
        key: `${keyPrefix}-t${index++}`,
      })
    }
    segments.push({
      type: 'hl',
      text: text.slice(r.start, r.end),
      start: r.start,
      end: r.end,
      key: `${keyPrefix}-h${r.start}-${r.end}`,
    })
    cursor = r.end
  }
  if (cursor < text.length) {
    segments.push({
      type: 'text',
      text: text.slice(cursor),
      key: `${keyPrefix}-t${index}`,
    })
  }
  return segments
}
