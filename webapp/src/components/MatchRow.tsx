import { useCallback, useEffect, useRef, type MouseEvent } from 'react'
import type { HighlightRange } from '../highlightStorage'
import {
  getCollapsedRangeAtPoint,
  getTextOffsetInElement,
  getWordLikeRangeAtOffset,
} from '../textSelection'
import { isVerseTextHighlightable, verseTextToSegments } from '../verseSegments'

type MatchRowProps = {
  rowId: string
  word: string
  verseRef: string
  verseText?: string
  highlights: HighlightRange[]
  onResolveVerseText: (verseRef: string) => Promise<void>
  onAddHighlight: (rowId: string, start: number, end: number) => void
  onRemoveHighlight: (rowId: string, start: number, end: number) => void
}

function MatchRow({
  rowId,
  word,
  verseRef,
  verseText,
  highlights,
  onResolveVerseText,
  onAddHighlight,
  onRemoveHighlight,
}: MatchRowProps) {
  const verseRootRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!verseText) {
      void onResolveVerseText(verseRef)
    }
  }, [onResolveVerseText, verseRef, verseText])

  const handleVerseClick = useCallback(
    (event: MouseEvent<HTMLSpanElement>) => {
      const root = verseRootRef.current
      if (!root || !verseText || !isVerseTextHighlightable(verseText)) return

      const markEl = (event.target as HTMLElement).closest?.('mark.verse-highlight')
      if (markEl && root.contains(markEl)) {
        const start = Number(markEl.getAttribute('data-start'))
        const end = Number(markEl.getAttribute('data-end'))
        if (!Number.isNaN(start) && !Number.isNaN(end)) {
          event.preventDefault()
          event.stopPropagation()
          onRemoveHighlight(rowId, start, end)
        }
        return
      }

      const doc = root.ownerDocument
      const range = getCollapsedRangeAtPoint(doc, event.clientX, event.clientY)
      if (!range || !root.contains(range.startContainer)) return

      const offset = getTextOffsetInElement(root, range.startContainer, range.startOffset)
      const wordRange = getWordLikeRangeAtOffset(verseText, offset)
      if (wordRange && wordRange.end > wordRange.start) {
        onAddHighlight(rowId, wordRange.start, wordRange.end)
      }
    },
    [verseText, rowId, onAddHighlight, onRemoveHighlight],
  )

  const highlightable = Boolean(verseText && isVerseTextHighlightable(verseText))
  const segmentKeyPrefix = rowId.replace(/[^a-zA-Z0-9-]/g, '_')
  const segments = highlightable
    ? verseTextToSegments(verseText!, highlights, segmentKeyPrefix)
    : null

  return (
    <li>
      <strong className="match-word">{word}</strong>
      <span className="verse-ref">{verseRef}</span>
      <span
        ref={verseRootRef}
        className={`verse-text${highlightable ? ' verse-text--selectable' : ''}`}
        onClick={highlightable ? handleVerseClick : undefined}
        title={
          highlightable
            ? 'Click a word to highlight it; click a highlight to remove it'
            : undefined
        }
      >
        {segments
          ? segments.map((seg) =>
              seg.type === 'hl' ? (
                <mark
                  key={seg.key}
                  className="verse-highlight"
                  data-start={seg.start}
                  data-end={seg.end}
                  title="Click to remove highlight"
                >
                  {seg.text}
                </mark>
              ) : (
                <span key={seg.key}>{seg.text}</span>
              ),
            )
          : (verseText ?? 'Loading verse text...')}
      </span>
    </li>
  )
}

export default MatchRow
