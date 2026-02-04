import { invoke } from '@tauri-apps/api/core'
import type { Pattern } from '@/model/Pattern'
import type { LegendEntry } from '@/types'

interface NativePdfStitch {
  x: number
  y: number
  dmc_code: string
  marker: string
  hex: string
}

interface NativePdfLegendEntry {
  dmc_code: string
  name: string
  hex: string
  stitch_count: number
  coverage: number
}

interface NativePdfPayload {
  title: string
  width: number
  height: number
  stitches: NativePdfStitch[]
  legend: NativePdfLegendEntry[]
}

export async function generateNativePatternPdf(
  pattern: Pattern,
  legend: LegendEntry[],
  title: string
): Promise<Uint8Array> {
  const payload: NativePdfPayload = {
    title,
    width: pattern.width,
    height: pattern.height,
    stitches: pattern.stitches.map((stitch) => ({
      x: stitch.x,
      y: stitch.y,
      dmc_code: stitch.dmcCode,
      marker: stitch.marker,
      hex: stitch.hex,
    })),
    legend: legend.map((entry) => ({
      dmc_code: entry.dmcCode,
      name: entry.name,
      hex: entry.hex,
      stitch_count: entry.stitchCount,
      coverage: entry.coverage,
    })),
  }

  const bytes = await invoke<number[]>('export_pattern_pdf', { payload })
  return new Uint8Array(bytes)
}
