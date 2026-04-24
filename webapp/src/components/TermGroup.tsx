import MatchRow from './MatchRow'
import type { HighlightRange } from '../highlightStorage'

type TermEntry = {
  HEBREW: string
  STRONGS: string
}

type TermsMap = Record<string, TermEntry[]>

type IndexEntry = {
  word: string
  verse_ref: string
}

type StrongIndex = Record<string, IndexEntry[]>

type TermCategoryProps = {
  termNames: string[]
  terms: TermsMap
  strongIndex: StrongIndex | null
  expandedTerms: Set<string>
  expandedStrongs: Set<string>
  visibleCountByStrong: Record<string, number>
  initialResults: number
  resultPageSize: number
  verseTextByRef: Record<string, string>
  highlightsByRow: Record<string, HighlightRange[]>
  onToggleTerm: (term: string) => void
  onToggleStrongs: (strongKey: string) => void
  onShowMore: (strongKey: string) => void
  onResolveVerseText: (verseRef: string) => Promise<void>
  onAddHighlight: (rowId: string, start: number, end: number, verseText: string) => void
  onRemoveHighlight: (rowId: string, start: number, end: number, verseText: string) => void
}

function TermGroup({
  termNames,
  terms,
  strongIndex,
  expandedTerms,
  expandedStrongs,
  visibleCountByStrong,
  initialResults,
  resultPageSize,
  verseTextByRef,
  highlightsByRow,
  onToggleTerm,
  onToggleStrongs,
  onShowMore,
  onResolveVerseText,
  onAddHighlight,
  onRemoveHighlight,
}: TermCategoryProps) {
  return (
    <section className="accordion-list" aria-label="Terms list">
      {termNames.map((term) => {
        const isTermOpen = expandedTerms.has(term)
        const entries = terms[term]

        return (
          <article key={term} className="accordion-item">
            <button
              type="button"
              className="accordion-button"
              onClick={() => onToggleTerm(term)}
              aria-expanded={isTermOpen}
            >
              <span>{term}</span>
            </button>

            {isTermOpen && (
              <div className="panel">
                {entries.map((entry, index) => {
                  const strongsId = entry.STRONGS
                  const strongKey = `${term}::${strongsId}::${index}`
                  const isStrongOpen = expandedStrongs.has(strongKey)
                  const allMatches = strongIndex?.[strongsId] ?? []
                  const visibleCount = visibleCountByStrong[strongKey] ?? initialResults
                  const visibleMatches = allMatches.slice(0, visibleCount)
                  const hasMore = visibleCount < allMatches.length

                  return (
                    <article key={strongKey} className="accordion-subitem">
                      <button
                        type="button"
                        className={`accordion-button secondary ${allMatches.length === 0 ? 'is-unavailable' : ''}`}
                        onClick={() => onToggleStrongs(strongKey)}
                        aria-expanded={isStrongOpen}
                        aria-disabled={allMatches.length === 0}
                      >
                        <span className="strong-row-main">
                          Strongs: <strong>{strongsId}</strong>
                          <span className="hebrew">({entry.HEBREW})</span>
                        </span>
                        <span className="meta">
                          {allMatches.length === 0 ? 'No references' : `${allMatches.length} refs`}
                        </span>
                      </button>

                      {isStrongOpen && (
                        <div className="panel nested">
                          {visibleMatches.length === 0 && (
                            <p className="status">No references for {strongsId} in the ASV</p>
                          )}

                          {visibleMatches.length > 0 && (
                            <>
                              <div className="match-list-header" role="presentation">
                                <span>ASV Word</span>
                                <span>Verse Ref</span>
                                <span>ULB Verse Text</span>
                              </div>
                              <ul className="match-list">
                                {visibleMatches.map((match, matchIndex) => {
                                  const rowId = `${strongKey}::${matchIndex}`
                                  return (
                                    <MatchRow
                                      key={rowId}
                                      rowId={rowId}
                                      word={match.word}
                                      verseRef={match.verse_ref}
                                      verseText={verseTextByRef[match.verse_ref]}
                                      highlights={highlightsByRow[rowId] ?? []}
                                      onResolveVerseText={onResolveVerseText}
                                      onAddHighlight={onAddHighlight}
                                      onRemoveHighlight={onRemoveHighlight}
                                    />
                                  )
                                })}
                              </ul>
                            </>
                          )}
                          {/* When there are too many results (more than initial size), show a "Load more" button. */}
                          {hasMore && (
                            <button
                              type="button"
                              className="load-more"
                              onClick={() => onShowMore(strongKey)}
                            >
                              Load {Math.min(resultPageSize, allMatches.length - visibleCount)}{' '}
                              more
                            </button>
                          )}
                  
                        </div>
                      )}
                    </article>
                  )
                })}
              </div>
            )}
          </article>
        )
      })}
    </section>
  )
}

export default TermGroup
export type { IndexEntry, StrongIndex, TermEntry, TermsMap }
