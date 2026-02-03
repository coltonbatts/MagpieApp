import { Pattern } from '@/model/Pattern'
import type { RGBColor } from '@/types'

export interface CsvExportResult {
  fileName: string
  rowCount: number
  contents: string
}

export function exportLegendCsv(pattern: Pattern, options?: { fabricColor: RGBColor, stitchThreshold: number }): CsvExportResult {
  const legend = pattern.getLegend({ fabricConfig: options })
  const mode = pattern.activePaletteMode

  const header = [
    'mode',
    'label',
    'hex',
    'dmc_code',
    'dmc_name',
    'stitch_count',
    'coverage_percent',
    'mapped_from_count',
  ]

  const rows = legend.map((entry) => {
    const label = entry.isMappedToDmc ? `DMC ${entry.dmcCode}` : entry.hex
    const coveragePercent = Number((entry.coverage * 100).toFixed(1))
    const mappedFromCount =
      typeof entry.mappedFromCount === 'number' ? entry.mappedFromCount : ''

    return [
      mode,
      label,
      entry.hex,
      entry.isMappedToDmc ? entry.dmcCode : '',
      entry.isMappedToDmc ? entry.name : '',
      String(entry.stitchCount),
      String(coveragePercent),
      String(mappedFromCount),
    ]
  })

  const csv =
    [header, ...rows]
      .map((row) => row.map(csvEscape).join(','))
      .join('\r\n') + '\r\n'

  const fileName = `magpie-threads-${mode}.csv`
  return { fileName, rowCount: legend.length, contents: csv }
}

function csvEscape(value: string) {
  if (value.includes('"') || value.includes(',') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}
