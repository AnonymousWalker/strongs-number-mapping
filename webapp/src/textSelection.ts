/** Character offset from start of `root` to (node, offset), using Range.toString().length. */
export function getTextOffsetInElement(root: HTMLElement, node: Node, offset: number): number {
  const doc = root.ownerDocument
  if (!doc || !root.contains(node)) return 0
  const range = doc.createRange()
  range.setStart(root, 0)
  range.setEnd(node, offset)
  return range.toString().length
}

/** Collapsed range at viewport point for mapping click → text offset. */
export function getCollapsedRangeAtPoint(doc: Document, clientX: number, clientY: number): Range | null {
  const docWithCaret = doc as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null
    caretPositionFromPoint?: (x: number, y: number) => CaretPosition | null
  }
  if (typeof docWithCaret.caretRangeFromPoint === 'function') {
    return docWithCaret.caretRangeFromPoint(clientX, clientY)
  }
  const caret = docWithCaret.caretPositionFromPoint?.(clientX, clientY)
  if (!caret?.offsetNode) return null
  const range = doc.createRange()
  const node = caret.offsetNode
  const off = caret.offset
  if (node.nodeType === Node.TEXT_NODE) {
    range.setStart(node, Math.min(off, node.textContent?.length ?? 0))
    range.setEnd(node, Math.min(off, node.textContent?.length ?? 0))
    return range
  }
  return null
}

/** Word-like span at offset for click-to-highlight (ULB English). */
export function getWordLikeRangeAtOffset(
  text: string,
  offset: number,
): { start: number; end: number } | null {
  if (!text) return null
  const clamped = Math.max(0, Math.min(offset, text.length))
  const lookup =
    clamped === text.length && text.length > 0 ? Math.max(0, text.length - 1) : clamped

  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter('en', { granularity: 'word' })
    const segments = Array.from(segmenter.segment(text))
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i]!
      const segStart = segment.index
      const segEnd = segment.index + segment.segment.length
      if (lookup >= segStart && lookup < segEnd) {
        if (segment.isWordLike) {
          return { start: segStart, end: segEnd }
        }

        const prev = segments[i - 1]
        if (prev?.isWordLike) {
          const prevStart = prev.index
          return { start: prevStart, end: prevStart + prev.segment.length }
        }

        const next = segments[i + 1]
        if (next?.isWordLike) {
          const nextStart = next.index
          return { start: nextStart, end: nextStart + next.segment.length }
        }

        return null
      }
    }
    return null
  }

  return getWordLikeRangeFallback(text, lookup)
}

function getWordLikeRangeFallback(
  text: string,
  offset: number,
): { start: number; end: number } | null {
  const isWordChar = (ch: string) => /[\p{L}\p{M}\p{N}']/u.test(ch)

  let i = Math.min(Math.max(0, offset), text.length - 1)
  if (!isWordChar(text[i]!)) {
    const prev = i - 1
    const next = i + 1
    if (prev >= 0 && isWordChar(text[prev]!)) {
      i = prev
    } else if (next < text.length && isWordChar(text[next]!)) {
      i = next
    } else {
      return null
    }
  }

  let start = i
  while (start > 0 && isWordChar(text[start - 1]!)) start--
  let end = i + 1
  while (end < text.length && isWordChar(text[end]!)) end++
  return { start, end }
}
