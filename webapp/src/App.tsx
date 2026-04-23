import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import TermGroup, {
  type StrongIndex,
  type TermsMap,
} from './components/TermGroup'
import './App.css'

const INITIAL_RESULTS = 50
const RESULT_PAGE_SIZE = 50

function App() {
  const [terms, setTerms] = useState<TermsMap | null>(null)
  const [strongIndex, setStrongIndex] = useState<StrongIndex | null>(null)
  const [loadingTerms, setLoadingTerms] = useState(true)
  const [loadingIndex, setLoadingIndex] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [expandedTerms, setExpandedTerms] = useState<Set<string>>(() => new Set())
  const [expandedStrongs, setExpandedStrongs] = useState<Set<string>>(() => new Set())
  const [visibleCountByStrong, setVisibleCountByStrong] = useState<
    Record<string, number>
  >({})
  const [verseTextByRef, setVerseTextByRef] = useState<Record<string, string>>({})
  const verseBookCacheRef = useRef<Record<string, Record<string, string>>>({})
  const verseBookPromiseRef = useRef<Record<string, Promise<Record<string, string>>>>({})

  useEffect(() => {
    const controller = new AbortController()

    async function loadData() {
      try {
        setLoadingTerms(true)
        setLoadingIndex(true)
        setError(null)

        const termsResponse = await fetch('/OTTerms.json', { signal: controller.signal })
        if (!termsResponse.ok) {
          throw new Error(`Failed to load OTerms.json (${termsResponse.status})`)
        }
        const termsJson = (await termsResponse.json()) as TermsMap
        setTerms(termsJson)
        setLoadingTerms(false)

        const indexResponse = await fetch('/strong-index.json', {
          signal: controller.signal,
        })
        if (!indexResponse.ok) {
          throw new Error(`Failed to load strong-index.json (${indexResponse.status})`)
        }
        const indexJson = (await indexResponse.json()) as StrongIndex
        setStrongIndex(indexJson)
      } catch (loadError) {
        if (controller.signal.aborted) return
        const message =
          loadError instanceof Error ? loadError.message : 'Failed to load data files'
        setError(message)
      } finally {
        if (!controller.signal.aborted) {
          setLoadingTerms(false)
          setLoadingIndex(false)
        }
      }
    }

    void loadData()

    return () => controller.abort()
  }, [])

  const termNames = useMemo(() => {
    if (!terms) return []
    return Object.keys(terms)
  }, [terms])

  function toggleTerm(term: string) {
    setExpandedTerms((current) => {
      const next = new Set(current)
      if (next.has(term)) next.delete(term)
      else next.add(term)
      return next
    })
  }

  function toggleStrongs(strongs: string) {
    setVisibleCountByStrong((visible) =>
      visible[strongs] ? visible : { ...visible, [strongs]: INITIAL_RESULTS },
    )

    setExpandedStrongs((current) => {
      const next = new Set(current)
      if (next.has(strongs)) {
        next.delete(strongs)
      } else {
        next.add(strongs)
      }
      return next
    })
  }

  function showMoreForStrong(strongs: string) {
    setVisibleCountByStrong((current) => ({
      ...current,
      [strongs]: (current[strongs] ?? INITIAL_RESULTS) + RESULT_PAGE_SIZE,
    }))
  }

  const parseBookFile = useCallback((bookText: string) => {
    const verseMap: Record<string, string> = {}
    const lines = bookText.split(/\r?\n/)

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      const firstSpace = trimmed.indexOf(' ')
      if (firstSpace < 0) continue

      const secondSpace = trimmed.indexOf(' ', firstSpace + 1)
      if (secondSpace < 0) continue

      const verseRef = trimmed.slice(0, secondSpace)
      const verseText = trimmed.slice(secondSpace + 1).trim()
      verseMap[verseRef] = verseText
    }

    return verseMap
  }, [])

  const loadBookMap = useCallback(
    async (bookCode: string) => {
      const cached = verseBookCacheRef.current[bookCode]
      if (cached) return cached

      let pending = verseBookPromiseRef.current[bookCode]
      if (!pending) {
        pending = fetch(`/en_ulb_txt/${bookCode}.txt`)
          .then(async (response) => {
            if (!response.ok) {
              throw new Error(`Failed to load ${bookCode}.txt (${response.status})`)
            }
            const text = await response.text()
            const map = parseBookFile(text)
            verseBookCacheRef.current[bookCode] = map
            return map
          })
          .finally(() => {
            delete verseBookPromiseRef.current[bookCode]
          })

        verseBookPromiseRef.current[bookCode] = pending
      }

      return pending
    },
    [parseBookFile],
  )

  const resolveVerseText = useCallback(
    async (verseRef: string) => {
      setVerseTextByRef((current) =>
        current[verseRef] ? current : { ...current, [verseRef]: 'Loading verse text...' },
      )

      const [bookCode] = verseRef.split(' ')
      if (!bookCode) {
        setVerseTextByRef((current) => ({
          ...current,
          [verseRef]: 'Invalid verse reference',
        }))
        return
      }

      try {
        const bookMap = await loadBookMap(bookCode)
        const verseText = bookMap[verseRef] ?? 'Verse text not found'
        setVerseTextByRef((current) => ({ ...current, [verseRef]: verseText }))
      } catch {
        setVerseTextByRef((current) => ({
          ...current,
          [verseRef]: 'Unable to load verse text',
        }))
      }
    },
    [loadBookMap],
  )

  return (
    <main className="app">
      <header className="app-header">
        <h1>OT Terms and Strongs Numbers</h1>
      </header>

      {loadingTerms && <p className="status">Loading OTerms.json...</p>}
      {!loadingTerms && loadingIndex && (
        <p className="status">Preloading strong-index.json into memory...</p>
      )}
      {error && <p className="status error">{error}</p>}

      {!error && terms && (
        <TermGroup
          termNames={termNames}
          terms={terms}
          strongIndex={strongIndex}
          expandedTerms={expandedTerms}
          expandedStrongs={expandedStrongs}
          visibleCountByStrong={visibleCountByStrong}
          initialResults={INITIAL_RESULTS}
          resultPageSize={RESULT_PAGE_SIZE}
          verseTextByRef={verseTextByRef}
          onToggleTerm={toggleTerm}
          onToggleStrongs={toggleStrongs}
          onShowMore={showMoreForStrong}
          onResolveVerseText={resolveVerseText}
        />
      )}
    </main>
  )
}

export default App
