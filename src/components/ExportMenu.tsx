import { useCallback, useEffect, useMemo, useState } from 'react'
import { useExport } from '@/hooks/useExport'
import { usePatternStore } from '@/store/pattern-store'
import { exportLegendCsv } from '@/exports/csv-export'
import { generatePatternSVG } from '@/exports/pattern-svg-export'
import { Button, Input, Panel, Select } from './ui'

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
  }, [pattern, processingConfig])

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
    <Panel
      title={<span className="text-sm font-semibold text-fg">Export</span>}
      variant="inset"
    >
      <div className="space-y-3">
        <div className="space-y-2.5">
          <label className="flex items-center gap-2 text-xs text-fg-muted">
            <Input
              type="checkbox"
              variant="checkbox"
              checked={includeGrid}
              onChange={(e) => setIncludeGrid(e.target.checked)}
            />
            Include grid overlay
          </label>

          <label className="flex items-center gap-2 text-xs text-fg-muted">
            <Input
              type="checkbox"
              variant="checkbox"
              checked={includeLegend}
              onChange={(e) => setIncludeLegend(e.target.checked)}
            />
            Include legend overlay
          </label>
        </div>

        <label className="block text-xs text-fg-muted">
          <span className="mb-1 block">Stitch size (px)</span>
          <Select
            value={stitchSizePx}
            onChange={(e) => setStitchSizePx(parseInt(e.target.value, 10))}
          >
            {[4, 8, 10, 12, 16].map((size) => (
              <option key={size} value={size}>
                {size}px
              </option>
            ))}
          </Select>
        </label>

        <div className="space-y-2">
          <Button
            type="button"
            onClick={handleExport}
            disabled={exportDisabled}
            variant="primary"
            className="w-full"
          >
            {isExportingPng ? 'Downloading…' : 'Download Preview PNG'}
          </Button>

          <Button
            type="button"
            onClick={handleExportCsv}
            disabled={exportDisabled}
            variant="secondary"
            className="w-full"
          >
            {isExportingCsv ? 'Downloading…' : 'Download Palette/Thread List CSV'}
          </Button>

          <Button
            type="button"
            onClick={handleExportSvg}
            disabled={exportDisabled}
            variant="secondary"
            className="w-full"
          >
            {isExportingSvg ? 'Downloading…' : 'Download Printable Pattern SVG'}
          </Button>
        </div>

        {!canExport && (
          <p className="text-xs text-amber-700">Load an image/pattern first.</p>
        )}

        {canExport && (
          <p className="text-[11px] text-fg-subtle">Shortcut: {shortcutHint}</p>
        )}

        {statusNote && <p className="text-xs text-fg-muted">{statusNote}</p>}
        {exportError && <p className="text-xs text-red-600">Export failed: {exportError}</p>}

        {isDev && lastExportNote && (
          <p className="text-[11px] font-mono text-fg-subtle">
            Export checksum: {lastExportNote}
          </p>
        )}
      </div>
    </Panel>
  )
}
