import { useState } from 'react'
import { useExport } from '@/hooks/useExport'
import { usePatternStore } from '@/store/pattern-store'

export function ExportMenu() {
  const [includeGrid, setIncludeGrid] = useState(true)
  const [includeLegend, setIncludeLegend] = useState(false)
  const [stitchSizePx, setStitchSizePx] = useState(10)
  const [lastExportNote, setLastExportNote] = useState<string | null>(null)
  const isDev = import.meta.env.DEV
  const pattern = usePatternStore((state) => state.pattern)
  const { canExport, exportCurrentPng } = useExport()

  const handleExport = async () => {
    if (!pattern) {
      window.alert('Export failed: no pattern is loaded.')
      return
    }

    try {
      const result = await exportCurrentPng({
        includeGrid,
        includeLegend,
        stitchSizePx,
      })

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
      window.alert(`Export failed: ${message}`)
    }
  }

  return (
    <div className="space-y-3 rounded border border-gray-200 p-3">
      <div className="text-sm font-medium text-gray-800">Export</div>

      <label className="flex items-center gap-2 text-xs text-gray-700">
        <input
          type="checkbox"
          checked={includeGrid}
          onChange={(e) => setIncludeGrid(e.target.checked)}
          className="h-4 w-4"
        />
        Include grid overlay
      </label>

      <label className="flex items-center gap-2 text-xs text-gray-700">
        <input
          type="checkbox"
          checked={includeLegend}
          onChange={(e) => setIncludeLegend(e.target.checked)}
          className="h-4 w-4"
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

      <button
        type="button"
        onClick={handleExport}
        disabled={!canExport}
        className="w-full rounded bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Export PNG
      </button>

      {!canExport && (
        <p className="text-xs text-amber-700">Load an image/pattern first.</p>
      )}

      {isDev && lastExportNote && (
        <p className="text-[11px] font-mono text-gray-500">
          Export checksum: {lastExportNote}
        </p>
      )}
    </div>
  )
}
