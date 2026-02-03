import type { ExportOptions } from '@/types'
import { Pattern } from '@/model/Pattern'

export interface PngExportResult {
  width: number
  height: number
  paletteEntryCount: number
  fileName: string
  stitchSizePx: number
  blob: Blob
}

const DEFAULT_STITCH_SIZE_PX = 10
const EXPORT_PADDING = 12
const LEGEND_PANEL_WIDTH = 280
const LEGEND_PADDING = 12
const LEGEND_ROW_HEIGHT = 26
const LEGEND_SWATCH_SIZE = 14

export function exportPng(
  pattern: Pattern,
  options: ExportOptions
): Promise<PngExportResult> {
  const includeGrid = options.includeGrid ?? false
  const includeLegend = options.includeLegend ?? false
  const stitchSizePx = sanitizeStitchSize(options.stitchSizePx)
  const cellSize = stitchSizePx
  const patternWidth = pattern.width * stitchSizePx
  const patternHeight = pattern.height * stitchSizePx
  const legendEntries = pattern.getLegend()
  const legendHeight = includeLegend
    ? LEGEND_PADDING * 2 + legendEntries.length * LEGEND_ROW_HEIGHT + 24
    : 0
  const width =
    EXPORT_PADDING * 2 +
    patternWidth +
    (includeLegend ? LEGEND_PANEL_WIDTH + EXPORT_PADDING : 0)
  const height = Math.max(patternHeight, legendHeight || patternHeight) + EXPORT_PADDING * 2
  const patternOriginX = EXPORT_PADDING
  const patternOriginY = EXPORT_PADDING
  const legendX = patternOriginX + patternWidth + EXPORT_PADDING
  const mode = pattern.activePaletteMode

  console.info('export start', {
    mode,
    stitchSizePx,
    includeGrid,
    includeLegend,
    width,
    height,
  })

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Failed to create canvas context for PNG export.')
  }

  context.imageSmoothingEnabled = false
  context.fillStyle = '#FFFFFF'
  context.fillRect(0, 0, width, height)

  for (const stitch of pattern.stitches) {
    context.fillStyle = stitch.hex
    context.fillRect(
      patternOriginX + stitch.x * cellSize,
      patternOriginY + stitch.y * cellSize,
      cellSize,
      cellSize
    )
  }

  if (includeGrid) {
    context.strokeStyle = 'rgba(204, 204, 204, 0.3)'
    context.lineWidth = 1

    for (let x = 0; x <= pattern.width; x += 1) {
      const xPos = patternOriginX + x * stitchSizePx + 0.5
      context.beginPath()
      context.moveTo(xPos, patternOriginY)
      context.lineTo(xPos, patternOriginY + patternHeight)
      context.stroke()
    }

    for (let y = 0; y <= pattern.height; y += 1) {
      const yPos = patternOriginY + y * stitchSizePx + 0.5
      context.beginPath()
      context.moveTo(patternOriginX, yPos)
      context.lineTo(patternOriginX + patternWidth, yPos)
      context.stroke()
    }
  }

  if (includeLegend) {
    const legendTop = EXPORT_PADDING
    context.fillStyle = '#FFFFFF'
    context.fillRect(legendX, legendTop, LEGEND_PANEL_WIDTH, height - EXPORT_PADDING * 2)
    context.strokeStyle = '#E5E7EB'
    context.lineWidth = 1
    context.beginPath()
    context.moveTo(legendX + 0.5, legendTop)
    context.lineTo(legendX + 0.5, height - EXPORT_PADDING)
    context.stroke()

    context.fillStyle = '#111827'
    context.font = 'bold 14px sans-serif'
    context.fillText('Legend', legendX + LEGEND_PADDING, legendTop + LEGEND_PADDING + 12)

    context.font = '12px monospace'
    context.fillStyle = '#374151'
    legendEntries.forEach((entry, index) => {
      const y = legendTop + LEGEND_PADDING + 24 + index * LEGEND_ROW_HEIGHT
      context.fillStyle = entry.hex
      context.fillRect(
        legendX + LEGEND_PADDING,
        y - 10,
        LEGEND_SWATCH_SIZE,
        LEGEND_SWATCH_SIZE
      )
      context.strokeStyle = '#D1D5DB'
      context.strokeRect(
        legendX + LEGEND_PADDING,
        y - 10,
        LEGEND_SWATCH_SIZE,
        LEGEND_SWATCH_SIZE
      )

      context.fillStyle = '#111827'
      const label = entry.isMappedToDmc
        ? `DMC ${entry.dmcCode}${typeof entry.mappedFromCount === 'number' && entry.mappedFromCount > 0 ? ` (from ${entry.mappedFromCount})` : ''}`
        : entry.hex
      context.fillText(label, legendX + LEGEND_PADDING + 20, y)

      const percent = `${(entry.coverage * 100).toFixed(1)}%`
      const countAndCoverage = `${entry.stitchCount} (${percent})`
      context.fillStyle = '#6B7280'
      context.fillText(
        countAndCoverage,
        legendX + LEGEND_PANEL_WIDTH - 96,
        y
      )
    })
  }

  const fileName = `magpie-pattern-${mode}.png`
  return canvasToBlob(canvas)
    .then((blob) => {
      console.info('export rendered', {
        byteSize: blob.size,
      })

      return {
        width,
        height,
        paletteEntryCount: legendEntries.length,
        fileName,
        stitchSizePx,
        blob,
      }
    })
    .catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : 'Unknown PNG export error.'
      throw new Error(reason)
    })
}

function sanitizeStitchSize(stitchSizePx: number | undefined): number {
  const candidate = Math.round(stitchSizePx ?? DEFAULT_STITCH_SIZE_PX)
  return Math.max(1, candidate)
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Canvas export failed: could not create PNG blob.'))
        return
      }
      resolve(blob)
    }, 'image/png')
  })
}
