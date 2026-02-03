import { Pattern } from '@/model/Pattern'
import { downloadBlob } from '@/exports/download'

interface CsvExportResult {
  fileName: string
  rowCount: number
}

export function exportLegendCsv(pattern: Pattern): CsvExportResult {
  const legend = pattern.getLegend()
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

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const fileName = `magpie-threads-${mode}.csv`
  downloadBlob(blob, fileName)

  return { fileName, rowCount: legend.length }
}

function csvEscape(value: string) {
  if (value.includes('"') || value.includes(',') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}
