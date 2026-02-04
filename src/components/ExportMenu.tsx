import { useCallback, useEffect, useMemo, useState } from 'react'
import { useExport } from '@/hooks/useExport'
import { usePatternStore } from '@/store/pattern-store'
import { useUIStore } from '@/store/ui-store'
import { exportLegendCsv } from '@/exports/csv-export'
import { generatePatternSVG } from '@/exports/pattern-svg-export'
import { generateNativePatternPdf } from '@/exports/native-pdf-export'
import { getPlatformAdapter } from '@/platform'
import { generatePrintDocument } from '@/print/print-document'
import { saveCurrentProjectToPath } from '@/project/persistence'
import { Button, Input, Panel, Select } from './ui'

const PDF_PAGE_SIZE_KEY = 'magpie:pdfPageSize'

function resolveDefaultPrintPageSize(): 'A4' | 'Letter' {
  const locale = typeof navigator !== 'undefined' ? navigator.language : 'en-US'
  return locale.startsWith('en-US') ? 'Letter' : 'A4'
}

function buildTimestampedName(extension: string): string {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  return `magpie-project-${stamp}.${extension}`
}

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
  const [isExportingPdf, setIsExportingPdf] = useState(false)
  const [isExportingOutlinePdf, setIsExportingOutlinePdf] = useState(false)
  const [isSavingProject, setIsSavingProject] = useState(false)
  const [isPrinting, setIsPrinting] = useState(false)
  const [useMinimalOutlineTemplate, setUseMinimalOutlineTemplate] = useState(true)
  const [pdfPageSize, setPdfPageSize] = useState<'A4' | 'Letter'>(() => {
    if (typeof window === 'undefined') return resolveDefaultPrintPageSize()
    const stored = window.localStorage.getItem(PDF_PAGE_SIZE_KEY)
    return stored === 'A4' || stored === 'Letter' ? stored : resolveDefaultPrintPageSize()
  })
  const isDev = import.meta.env.DEV
  const pattern = usePatternStore((state) => state.pattern)
  const processingConfig = usePatternStore((state) => state.processingConfig)
  const workflowStage = useUIStore((state) => state.workflowStage)
  const { canExport, exportCurrentPng } = useExport()

  const exportDisabled = !canExport || isExportingPng || isExportingCsv || isExportingSvg || isExportingPdf || isExportingOutlinePdf || isSavingProject || isPrinting

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
        setStatusNote(`Saved ${result.fileName}`)
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

  const handleExportCsv = useCallback(async () => {
    if (!pattern) return
    try {
      setExportError(null)
      setStatusNote(null)
      setIsExportingCsv(true)
      const result = exportLegendCsv(pattern, processingConfig)
      const platform = await getPlatformAdapter()
      const path = await platform.selectSavePath({
        defaultFileName: result.fileName,
        title: 'Save thread list CSV',
        filters: [{ name: 'CSV file', extensions: ['csv'] }],
      })
      if (!path) return
      await platform.writeFile({ path, contents: result.contents })
      setStatusNote(`Saved ${result.fileName}`)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown CSV export failure.'
      console.error('csv export failed', { reason: message })
      setExportError(message)
    } finally {
      setIsExportingCsv(false)
    }
  }, [pattern, processingConfig])

  const handleExportSvg = useCallback(async () => {
    if (!pattern) return
    try {
      setExportError(null)
      setStatusNote(null)
      setIsExportingSvg(true)
      const svg = generatePatternSVG(pattern, processingConfig)
      const fileName = `magpie-pattern-${Date.now()}.svg`
      const platform = await getPlatformAdapter()
      const path = await platform.selectSavePath({
        defaultFileName: fileName,
        title: 'Save printable SVG',
        filters: [{ name: 'SVG image', extensions: ['svg'] }],
      })
      if (!path) return
      await platform.writeFile({ path, contents: svg })
      setStatusNote('Saved SVG pattern')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown SVG export failure.'
      console.error('svg export failed', { reason: message })
      setExportError(message)
    } finally {
      setIsExportingSvg(false)
    }
  }, [pattern, processingConfig])

  const handleExportPdf = useCallback(async () => {
    if (!pattern) return
    try {
      setExportError(null)
      setStatusNote(null)
      setIsExportingPdf(true)
      const platform = await getPlatformAdapter()
      if (!platform.isDesktop) {
        throw new Error('Native PDF export is only available in the desktop app.')
      }

      const path = await platform.selectSavePath({
        defaultFileName: buildTimestampedName('pdf'),
        title: 'Save artisan PDF',
        filters: [{ name: 'PDF document', extensions: ['pdf'] }],
      })
      if (!path) return

      const legend = pattern.getLegend({
        fabricConfig: {
          fabricColor: processingConfig.fabricColor,
          stitchThreshold: processingConfig.stitchThreshold,
        },
      })
      const bytes = await generateNativePatternPdf(pattern, legend, 'Magpie Artisan Blueprint', pdfPageSize, 'blueprint')
      await platform.writeFile({ path, contents: bytes })
      setStatusNote(`Saved artisan PDF blueprint (${pdfPageSize})`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown PDF export failure.'
      console.error('pdf export failed', { reason: message })
      setExportError(message)
      setStatusNote('PDF export failed. Please try again with a smaller pattern or different destination.')
    } finally {
      setIsExportingPdf(false)
    }
  }, [pattern, processingConfig, pdfPageSize])

  const handleExportOutlinePdf = useCallback(async () => {
    if (!pattern) return
    try {
      setExportError(null)
      setStatusNote(null)
      setIsExportingOutlinePdf(true)
      const platform = await getPlatformAdapter()
      if (!platform.isDesktop) {
        throw new Error('Native PDF export is only available in the desktop app.')
      }

      const path = await platform.selectSavePath({
        defaultFileName: buildTimestampedName('pdf'),
        title: 'Save paint-by-numbers outline PDF',
        filters: [{ name: 'PDF document', extensions: ['pdf'] }],
      })
      if (!path) return

      const legend = pattern.getLegend({
        fabricConfig: {
          fabricColor: processingConfig.fabricColor,
          stitchThreshold: processingConfig.stitchThreshold,
        },
      })
      const bytes = await generateNativePatternPdf(
        pattern,
        legend,
        'Magpie Paint-by-Numbers Outline',
        pdfPageSize,
        'outline',
        useMinimalOutlineTemplate ? 'minimal' : 'studio'
      )
      await platform.writeFile({ path, contents: bytes })
      setStatusNote(`Saved paint-by-numbers outline PDF (${pdfPageSize})`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown PDF export failure.'
      console.error('outline pdf export failed', { reason: message })
      setExportError(message)
      setStatusNote('Outline PDF export failed. Please try again with a smaller pattern.')
    } finally {
      setIsExportingOutlinePdf(false)
    }
  }, [pattern, processingConfig, pdfPageSize, useMinimalOutlineTemplate])

  const handleSaveProject = useCallback(async () => {
    try {
      setExportError(null)
      setStatusNote(null)
      setIsSavingProject(true)
      const platform = await getPlatformAdapter()
      const path = await platform.selectSavePath({
        defaultFileName: buildTimestampedName('magpie'),
        title: 'Save Magpie project',
        filters: [{ name: 'Magpie project', extensions: ['magpie'] }],
      })
      if (!path) return

      const result = await saveCurrentProjectToPath(path, workflowStage)
      setStatusNote(result.warning ?? 'Saved project file')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown project save failure.'
      console.error('project save failed', { reason: message })
      setExportError(message)
    } finally {
      setIsSavingProject(false)
    }
  }, [workflowStage])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(PDF_PAGE_SIZE_KEY, pdfPageSize)
  }, [pdfPageSize])

  const handlePrint = useCallback(async (pageSizeOverride?: 'A4' | 'Letter') => {
    if (!pattern) return
    try {
      setExportError(null)
      setStatusNote(null)
      setIsPrinting(true)

      const svg = generatePatternSVG(pattern, processingConfig)
      const pageSize = pageSizeOverride ?? resolveDefaultPrintPageSize()
      const printHtml = generatePrintDocument({
        title: 'Magpie Pattern',
        svgMarkup: svg,
        pageSize,
      })
      const platform = await getPlatformAdapter()
      await platform.printDocument({
        title: 'Magpie Pattern',
        html: printHtml,
      })
      setStatusNote(`Opened print dialog (${pageSize}).`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown print failure.'
      console.error('print failed', { reason: message })
      setExportError(message)
    } finally {
      setIsPrinting(false)
    }
  }, [pattern, processingConfig])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const withMeta = event.metaKey || event.ctrlKey
      const isSave = (event.key === 's' || event.key === 'S') && withMeta
      const isPrint = (event.key === 'p' || event.key === 'P') && withMeta
      if (!isSave && !isPrint) return
      if (event.defaultPrevented) return
      if (!canExport) return
      event.preventDefault()
      if (isPrint && !isPrinting) {
        const defaultPageSize = resolveDefaultPrintPageSize()
        const alternatePageSize = defaultPageSize === 'Letter' ? 'A4' : 'Letter'
        void handlePrint(event.shiftKey ? alternatePageSize : defaultPageSize)
        return
      }
      if (!isExportingPng && !isExportingCsv && !isExportingPdf && !isExportingOutlinePdf && !isSavingProject && !isPrinting) {
        void handleExport()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [canExport, handleExport, handlePrint, isExportingCsv, isExportingPdf, isExportingOutlinePdf, isExportingPng, isSavingProject, isPrinting])

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

        <label className="block text-xs text-fg-muted">
          <span className="mb-1 block">PDF page size</span>
          <Select
            value={pdfPageSize}
            onChange={(event) => setPdfPageSize(event.target.value as 'A4' | 'Letter')}
          >
            <option value="A4">A4</option>
            <option value="Letter">Letter</option>
          </Select>
        </label>

        <label className="flex items-center gap-2 text-xs text-fg-muted">
          <Input
            type="checkbox"
            variant="checkbox"
            checked={useMinimalOutlineTemplate}
            onChange={(event) => setUseMinimalOutlineTemplate(event.target.checked)}
          />
          Minimal template (match reference PDFs)
        </label>

        <div className="space-y-2">
          <Button
            type="button"
            onClick={handleSaveProject}
            disabled={exportDisabled}
            variant="primary"
            className="w-full"
          >
            {isSavingProject ? 'Saving…' : 'Save Project (.magpie)'}
          </Button>

          <Button
            type="button"
            onClick={handleExport}
            disabled={exportDisabled}
            variant="secondary"
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

          <Button
            type="button"
            onClick={handleExportPdf}
            disabled={exportDisabled}
            variant="secondary"
            className="w-full"
          >
            {isExportingPdf ? 'Generating…' : 'Export Artisan Grid PDF (Native)'}
          </Button>

          <Button
            type="button"
            onClick={handleExportOutlinePdf}
            disabled={exportDisabled}
            variant="secondary"
            className="w-full"
          >
            {isExportingOutlinePdf ? 'Generating…' : 'Export Paint-by-Numbers / Outline PDF'}
          </Button>
        </div>

        {!canExport && (
          <p className="text-xs text-amber-700">Load an image/pattern first.</p>
        )}

        {canExport && (
          <p className="text-[11px] text-fg-subtle">
            Shortcuts: {shortcutHint} save PNG, {shortcutHint.replace('S', 'P')} print (Shift+P for alternate paper)
          </p>
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
