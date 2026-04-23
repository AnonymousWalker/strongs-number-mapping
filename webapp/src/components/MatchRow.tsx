import { useEffect } from 'react'

type MatchRowProps = {
  word: string
  verseRef: string
  verseText?: string
  onResolveVerseText: (verseRef: string) => Promise<void>
}

function MatchRow({ word, verseRef, verseText, onResolveVerseText }: MatchRowProps) {
  useEffect(() => {
    if (!verseText) {
      void onResolveVerseText(verseRef)
    }
  }, [onResolveVerseText, verseRef, verseText])

  return (
    <li>
      <strong className="match-word">{word}</strong>
      <span className="verse-ref">{verseRef}</span>
      <span className="verse-text">{verseText ?? 'Loading verse text...'}</span>
    </li>
  )
}

export default MatchRow
