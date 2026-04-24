import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react'
import FileDownload from '@mui/icons-material/FileDownload'
import FileUpload from '@mui/icons-material/FileUpload'
import Button from '@mui/material/Button'
import TermGroup, {
  type StrongIndex,
  type TermsMap,
} from './components/TermGroup'
import {
  HIGHLIGHT_EXPORT_VERSION,
  loadHighlightsFromStorage,
  mergeHighlightMaps,
  mergeRanges,
  parseHighlightsImport,
  saveHighlightsToStorage,
  type HighlightRange,
} from './highlightStorage'
import './App.css'

const INITIAL_RESULTS = 50
const RESULT_PAGE_SIZE = 50
const DATA_BUCKET_URL = import.meta.env.VITE_DATA_BUCKET_URL?.replace(/\/+$/, '') ?? ''

function dataUrl(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return DATA_BUCKET_URL ? `${DATA_BUCKET_URL}${normalizedPath}` : normalizedPath
}

function mergeRangesWithWhitespaceBridge(
  ranges: HighlightRange[],
  verseText: string,
): HighlightRange[] {
  if (ranges.length === 0) return []
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end)
  const merged: HighlightRange[] = []
  let current = { ...sorted[0]! }

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i]!
    const bridge = verseText.slice(current.end, next.start)
    if (next.start <= current.end || bridge.trim() === '') {
      current.end = Math.max(current.end, next.end)
    } else {
      merged.push(current)
      current = { ...next }
    }
  }

  merged.push(current)
  return merged
}

function removeWordFromRanges(
  ranges: HighlightRange[],
  wordRange: HighlightRange,
  verseText: string,
): HighlightRange[] {
  const next: HighlightRange[] = []

  for (const range of ranges) {
    if (wordRange.end <= range.start || wordRange.start >= range.end) {
      next.push(range)
      continue
    }

    let leftStart = range.start
    let leftEnd = Math.min(wordRange.start, range.end)
    while (leftEnd > leftStart && /\s/.test(verseText[leftEnd - 1]!)) {
      leftEnd -= 1
    }
    if (leftEnd > leftStart) {
      next.push({ start: leftStart, end: leftEnd })
    }

    let rightStart = Math.max(wordRange.end, range.start)
    const rightEnd = range.end
    while (rightStart < rightEnd && /\s/.test(verseText[rightStart]!)) {
      rightStart += 1
    }
    if (rightEnd > rightStart) {
      next.push({ start: rightStart, end: rightEnd })
    }
  }

  return mergeRanges(next)
}

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

  const [highlightsByRow, setHighlightsByRow] = useState<
    Record<string, HighlightRange[]>
  >(() => loadHighlightsFromStorage())
  const [highlightImportMessage, setHighlightImportMessage] = useState<string | null>(null)

  useEffect(() => {
    saveHighlightsToStorage(highlightsByRow)
  }, [highlightsByRow])

  const addHighlight = useCallback(
    (rowId: string, start: number, end: number, verseText: string) => {
      setHighlightsByRow((prev) => {
        const appended = [...(prev[rowId] ?? []), { start, end }]
        const nextList = mergeRangesWithWhitespaceBridge(appended, verseText)
        return { ...prev, [rowId]: nextList }
      })
    },
    [],
  )

  const removeHighlight = useCallback(
    (rowId: string, start: number, end: number, verseText: string) => {
      setHighlightsByRow((prev) => {
        const current = prev[rowId] ?? []
        const list = removeWordFromRanges(current, { start, end }, verseText)
        const next = { ...prev }
        if (list.length === 0) delete next[rowId]
        else next[rowId] = list
        return next
      })
    },
    [],
  )

  const exportHighlights = useCallback(() => {
    const doc = { version: HIGHLIGHT_EXPORT_VERSION, highlights: highlightsByRow }
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `verse-highlights-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }, [highlightsByRow])

  const importHighlightsFromFile = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (!file) return
      void file.text().then((text) => {
        const parsed = parseHighlightsImport(text)
        if (!parsed) {
          setHighlightImportMessage('Invalid highlights file.')
          return
        }
        setHighlightsByRow((prev) => mergeHighlightMaps(prev, parsed))
        const rowCount = Object.keys(parsed).length
        setHighlightImportMessage(`Imported highlights for ${rowCount} row key(s).`)
      })
    },
    [],
  )

  useEffect(() => {
    const controller = new AbortController()

    async function loadData() {
      try {
        setLoadingTerms(true)
        setLoadingIndex(true)
        setError(null)

        const termsResponse = await fetch('/OTTerms.json', {
          signal: controller.signal,
        })
        if (!termsResponse.ok) {
          throw new Error(`Failed to load OTTerms.json (${termsResponse.status})`)
        }
        const termsJson = (await termsResponse.json()) as TermsMap
        setTerms(termsJson)
        setLoadingTerms(false)

        let indexResponse: Response
        try {
          indexResponse = await fetch(dataUrl('/strong-index-min.json'), {
            signal: controller.signal,
          })
          if (!indexResponse.ok) {
            throw new Error(`Failed to load remote index (${indexResponse.status})`)
          }
        } catch {
          indexResponse = await fetch('/strong-index-min.json', {
            signal: controller.signal,
          })
          if (!indexResponse.ok) {
            throw new Error(`Failed to load local index (${indexResponse.status})`)
          }
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
        <div className="app-header-main">
          <h1>OT Terms and Strongs Numbers</h1>
          <div className="highlight-toolbar">
            <Button
              type="button"
              size="small"
              color="inherit"
              startIcon={<FileUpload />}
              onClick={exportHighlights}
            >
              Export
            </Button>
            <input
              id="hl-import-input"
              className="sr-only"
              type="file"
              accept="application/json,.json"
              onChange={importHighlightsFromFile}
            />
            <Button
              component="label"
              htmlFor="hl-import-input"
              size="small"
              color="inherit"
              startIcon={<FileDownload />}
            >
              Import
            </Button>
            {highlightImportMessage && (
              <span className="toolbar-message">{highlightImportMessage}</span>
            )}
          </div>
        </div>
      </header>

      {loadingTerms && <p className="status">Loading OTerms.json...</p>}
      {!loadingTerms && loadingIndex && (
        <p className="status">Loading data...</p>
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
          highlightsByRow={highlightsByRow}
          onToggleTerm={toggleTerm}
          onToggleStrongs={toggleStrongs}
          onShowMore={showMoreForStrong}
          onResolveVerseText={resolveVerseText}
          onAddHighlight={addHighlight}
          onRemoveHighlight={removeHighlight}
        />
      )}
    </main>
  )
}

export default App
