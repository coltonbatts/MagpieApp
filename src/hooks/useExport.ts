import { exportPng } from '@/exports/png-export'
import { usePatternStore } from '@/store/pattern-store'

interface ExportPngOptions {
  includeGrid: boolean
  includeLegend: boolean
  stitchSizePx: number
}

export function useExport() {
  const pattern = usePatternStore((state) => state.pattern)

  const exportCurrentPng = async (options: ExportPngOptions) => {
    if (!pattern) {
      return null
    }

    return exportPng(pattern, {
      format: 'png-clean',
      includeGrid: options.includeGrid,
      includeLegend: options.includeLegend,
      stitchSizePx: options.stitchSizePx,
    })
  }

  return {
    canExport: Boolean(pattern),
    exportCurrentPng,
  }
}
