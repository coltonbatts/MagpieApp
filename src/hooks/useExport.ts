import { exportPng } from '@/exports/png-export'
import { getPlatformAdapter } from '@/platform'
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

    const result = await exportPng(pattern, {
      format: 'png-clean',
      includeGrid: options.includeGrid,
      includeLegend: options.includeLegend,
      stitchSizePx: options.stitchSizePx,
    })

    const platform = await getPlatformAdapter()
    const path = await platform.selectSavePath({
      defaultFileName: result.fileName,
      title: 'Save preview PNG',
      filters: [{ name: 'PNG image', extensions: ['png'] }],
    })

    if (!path) {
      return null
    }

    const bytes = new Uint8Array(await result.blob.arrayBuffer())
    await platform.writeFile({ path, contents: bytes })

    return result
  }

  return {
    canExport: Boolean(pattern),
    exportCurrentPng,
  }
}
