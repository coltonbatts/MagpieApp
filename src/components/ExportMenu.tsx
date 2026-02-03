import { useCallback, useEffect, useMemo, useState } from 'react'
import { useExport } from '@/hooks/useExport'
import { usePatternStore } from '@/store/pattern-store'
import { exportLegendCsv } from '@/exports/csv-export'
import { generatePatternSVG } from '@/exports/pattern-svg-export'

export function ExportMenu() {
  const [includeGrid, setIncludeGrid] = useState(true)
  const [includeLegend, setIncludeLegend] = useState(false)
  const [stitchSizePx, setStitchSizePx] = useState(10)
  const [lastExportNote, setLastExportNote] = useState<string | null>(null)
  const [statusNote, setStatusNote] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [isExportingPng, setIsExportingPng] = useState(false)
  const [isExportingCsv, setIsExportingCsv] = useState(false)
  const [isExportingSvg, setIsExportingSvg] = useState(false)
  const isDev = import.meta.env.DEV
  const pattern = usePatternStore((state) => state.pattern)
  const processingConfig = usePatternStore((state) => state.processingConfig)
  const { canExport, exportCurrentPng } = useExport()

  const exportDisabled = !canExport || isExportingPng || isExportingCsv || isExportingSvg

  const shortcutHint = useMemo(() => {
    const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform)
    return isMac ? '⌘S' : 'Ctrl+S'
  }, [])

  const handleExport = useCallback(async () => {
    if (!pattern) return

    try {
      setExportError(null)
      setStatusNote(null)
      setIsExportingPng(true)
      const result = await exportCurrentPng({
        includeGrid,
        includeLegend,
        stitchSizePx,
      })

      if (result) {
        setStatusNote(`Downloaded ${result.fileName}`)
      }

      if (!result || !isDev) {
        return
      }

      setLastExportNote(
        `${result.width}x${result.height} | stitch ${result.stitchSizePx}px | palette ${result.paletteEntryCount} | mode ${pattern.activePaletteMode}`
      )
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown PNG export failure.'
      console.error('export failed', { reason: message })
      setExportError(message)
    } finally {
      setIsExportingPng(false)
    }
  }, [
    exportCurrentPng,
    includeGrid,
    includeLegend,
    isDev,
    pattern,
    stitchSizePx,
  ])

  const handleExportCsv = useCallback(() => {
    if (!pattern) return
    try {
      setExportError(null)
      setStatusNote(null)
      setIsExportingCsv(true)
      const result = exportLegendCsv(pattern, processingConfig)
      setStatusNote(`Downloaded ${result.fileName}`)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown CSV export failure.'
      console.error('csv export failed', { reason: message })
      setExportError(message)
    } finally {
      setIsExportingCsv(false)
    }
  }, [pattern])

  const handleExportSvg = useCallback(() => {
    if (!pattern) return
    try {
      setExportError(null)
      setStatusNote(null)
      setIsExportingSvg(true)
      const svg = generatePatternSVG(pattern, processingConfig)
      const blob = new Blob([svg], { type: 'image/svg+xml' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `magpie-pattern-${Date.now()}.svg`
      link.click()
      URL.revokeObjectURL(url)
      setStatusNote(`Downloaded SVG pattern`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown SVG export failure.'
      console.error('svg export failed', { reason: message })
      setExportError(message)
    } finally {
      setIsExportingSvg(false)
    }
  }, [pattern, processingConfig])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isSave =
        (event.key === 's' || event.key === 'S') && (event.metaKey || event.ctrlKey)
      if (!isSave) return
      if (event.defaultPrevented) return
      if (!canExport) return
      event.preventDefault()
      if (!isExportingPng && !isExportingCsv) {
        void handleExport()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [canExport, handleExport, isExportingCsv, isExportingPng])

  return (
    <div className="space-y-3 rounded border border-gray-200 p-3">
      <div className="text-sm font-medium text-gray-800">Export</div>

      <label className="flex items-center gap-2 text-xs text-gray-700">
        <input
          type="checkbox"
          checked={includeGrid}
          onChange={(e) => setIncludeGrid(e.target.checked)}
          className="h-4 w-4 accent-gray-900"
        />
        Include grid overlay
      </label>

      <label className="flex items-center gap-2 text-xs text-gray-700">
        <input
          type="checkbox"
          checked={includeLegend}
          onChange={(e) => setIncludeLegend(e.target.checked)}
          className="h-4 w-4 accent-gray-900"
        />
        Include legend overlay
      </label>

      <label className="block text-xs text-gray-700">
        <span className="mb-1 block">Stitch size (px)</span>
        <select
          value={stitchSizePx}
          onChange={(e) => setStitchSizePx(parseInt(e.target.value, 10))}
          className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-800"
        >
          {[4, 8, 10, 12, 16].map((size) => (
            <option key={size} value={size}>
              {size}px
            </option>
          ))}
        </select>
      </label>

      <div className="space-y-2">
        <button
          type="button"
          onClick={handleExport}
          disabled={exportDisabled}
          className="w-full rounded bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isExportingPng ? 'Downloading…' : 'Download Preview PNG'}
        </button>

        <button
          type="button"
          onClick={handleExportCsv}
          disabled={exportDisabled}
          className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isExportingCsv ? 'Downloading…' : 'Download Palette/Thread List CSV'}
        </button>

        <button
          type="button"
          onClick={handleExportSvg}
          disabled={exportDisabled}
          className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isExportingSvg ? 'Downloading…' : 'Download Printable Pattern SVG'}
        </button>
      </div>

      {!canExport && (
        <p className="text-xs text-amber-700">Load an image/pattern first.</p>
      )}

      {canExport && (
        <p className="text-[11px] text-gray-500">Shortcut: {shortcutHint}</p>
      )}

      {statusNote && <p className="text-xs text-gray-600">{statusNote}</p>}
      {exportError && <p className="text-xs text-red-600">Export failed: {exportError}</p>}

      {isDev && lastExportNote && (
        <p className="text-[11px] font-mono text-gray-500">
          Export checksum: {lastExportNote}
        </p>
      )}
    </div>
  )
}
