export const HIGHLIGHT_STORAGE_KEY = 'strongs-mapping-verse-highlights'
export const HIGHLIGHT_EXPORT_VERSION = 1

export type HighlightRange = {
  start: number
  end: number
}

export type HighlightsDocument = {
  version: number
  highlights: Record<string, HighlightRange[]>
}

export function mergeRanges(ranges: HighlightRange[]): HighlightRange[] {
  if (ranges.length === 0) return []
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end)
  const merged: HighlightRange[] = []
  let current = { ...sorted[0]! }
  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i]!
    if (next.start <= current.end) {
      current.end = Math.max(current.end, next.end)
    } else {
      merged.push(current)
      current = { ...next }
    }
  }
  merged.push(current)
  return merged
}

export function loadHighlightsFromStorage(): Record<string, HighlightRange[]> {
  try {
    const raw = localStorage.getItem(HIGHLIGHT_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    const doc = parsed as HighlightsDocument
    if (doc.version !== HIGHLIGHT_EXPORT_VERSION || typeof doc.highlights !== 'object')
      return {}
    const out: Record<string, HighlightRange[]> = {}
    for (const [rowId, list] of Object.entries(doc.highlights)) {
      if (!Array.isArray(list)) continue
      const ranges: HighlightRange[] = []
      for (const item of list) {
        if (
          item &&
          typeof item === 'object' &&
          typeof (item as HighlightRange).start === 'number' &&
          typeof (item as HighlightRange).end === 'number'
        ) {
          const start = Math.round((item as HighlightRange).start)
          const end = Math.round((item as HighlightRange).end)
          if (start >= 0 && end > start) ranges.push({ start, end })
        }
      }
      if (ranges.length) out[rowId] = mergeRanges(ranges)
    }
    return out
  } catch {
    return {}
  }
}

export function saveHighlightsToStorage(highlights: Record<string, HighlightRange[]>) {
  const doc: HighlightsDocument = {
    version: HIGHLIGHT_EXPORT_VERSION,
    highlights,
  }
  localStorage.setItem(HIGHLIGHT_STORAGE_KEY, JSON.stringify(doc))
}

export function parseHighlightsImport(json: string): Record<string, HighlightRange[]> | null {
  try {
    const parsed = JSON.parse(json) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    const doc = parsed as HighlightsDocument
    if (typeof doc.highlights !== 'object' || doc.highlights === null) return null
    const out: Record<string, HighlightRange[]> = {}
    for (const [rowId, list] of Object.entries(doc.highlights)) {
      if (!Array.isArray(list)) continue
      const ranges: HighlightRange[] = []
      for (const item of list) {
        if (
          item &&
          typeof item === 'object' &&
          typeof (item as HighlightRange).start === 'number' &&
          typeof (item as HighlightRange).end === 'number'
        ) {
          const start = Math.round((item as HighlightRange).start)
          const end = Math.round((item as HighlightRange).end)
          if (start >= 0 && end > start) ranges.push({ start, end })
        }
      }
      if (ranges.length) out[rowId] = mergeRanges(ranges)
    }
    return out
  } catch {
    return null
  }
}

export function mergeHighlightMaps(
  base: Record<string, HighlightRange[]>,
  incoming: Record<string, HighlightRange[]>,
): Record<string, HighlightRange[]> {
  const next: Record<string, HighlightRange[]> = { ...base }
  for (const [rowId, list] of Object.entries(incoming)) {
    const combined = [...(next[rowId] ?? []), ...list]
    next[rowId] = mergeRanges(combined)
  }
  return next
}
