import type { ManualStitchEdit, ManualStitchEdits, Stitch } from '@/types'
import { Pattern } from './Pattern'
import { incrementDevCounter } from '@/lib/dev-instrumentation'

const FABRIC_HEX = '#FFFFFF'

export function createCellKey(x: number, y: number): string {
  return `${x}:${y}`
}

export function editsArrayFromMap(edits: ManualStitchEdits): ManualStitchEdit[] {
  return Object.values(edits)
}

export function editsMapFromArray(edits: ManualStitchEdit[]): ManualStitchEdits {
  const next: ManualStitchEdits = {}
  for (const edit of edits) {
    const normalized = normalizeManualEdit(edit)
    if (!normalized) continue
    next[createCellKey(normalized.x, normalized.y)] = normalized
  }
  return next
}

export function mergeManualEdits(
  current: ManualStitchEdits,
  incoming: ManualStitchEdit[]
): ManualStitchEdits {
  if (incoming.length === 0) return current

  const next = { ...current }
  for (const edit of incoming) {
    const normalized = normalizeManualEdit(edit)
    if (!normalized) continue
    next[createCellKey(normalized.x, normalized.y)] = normalized
  }

  return next
}

export function applyManualEditsToPattern(
  pattern: Pattern,
  edits: ManualStitchEdits | ManualStitchEdit[]
): Pattern {
  const list = Array.isArray(edits) ? edits : editsArrayFromMap(edits)
  if (list.length === 0) return pattern
  incrementDevCounter('manualEditApplications', `${list.length} edits`)

  const stitches = pattern.stitches.slice()
  let hasChanges = false

  for (const edit of list) {
    const normalized = normalizeManualEdit(edit)
    if (!normalized) continue
    if (normalized.x < 0 || normalized.x >= pattern.width || normalized.y < 0 || normalized.y >= pattern.height) {
      continue
    }

    const index = normalized.y * pattern.width + normalized.x
    const current = stitches[index]
    if (!current) continue

    const nextStitch =
      normalized.mode === 'fabric'
        ? {
          ...current,
          dmcCode: 'Fabric',
          marker: '',
          hex: FABRIC_HEX,
        }
        : {
          ...current,
          dmcCode: normalized.dmcCode ?? current.dmcCode,
          marker: normalized.marker ?? current.marker,
          hex: normalizeHex(normalized.hex ?? current.hex),
        }

    if (
      nextStitch.dmcCode === current.dmcCode &&
      nextStitch.marker === current.marker &&
      nextStitch.hex === current.hex
    ) {
      continue
    }

    stitches[index] = nextStitch
    hasChanges = true
  }

  if (!hasChanges) return pattern

  const rawPalette = uniquePaletteFromStitches(stitches)
  const mappedPalette = pattern.mappedPalette ? appendMissingPalette(pattern.mappedPalette, rawPalette) : null
  const paletteHex = pattern.paletteHex ? appendMissingPalette(pattern.paletteHex, rawPalette) : pattern.paletteHex

  return new Pattern(stitches, pattern.width, pattern.height, {
    rawPalette,
    mappedPalette,
    activePaletteMode: pattern.activePaletteMode,
    mappingTable: pattern.mappingTable,
    dmcMetadataByMappedHex: pattern.dmcMetadataByMappedHex,
    labels: pattern.labels,
    paletteHex,
    referenceId: pattern.referenceId,
    selection: pattern.selection,
  })
}

function normalizeManualEdit(edit: ManualStitchEdit): ManualStitchEdit | null {
  if (!Number.isFinite(edit.x) || !Number.isFinite(edit.y)) return null
  const x = Math.floor(edit.x)
  const y = Math.floor(edit.y)
  if (x < 0 || y < 0) return null

  if (edit.mode === 'fabric') {
    return { x, y, mode: 'fabric' }
  }

  if (!edit.hex) return null
  return {
    x,
    y,
    mode: 'paint',
    hex: normalizeHex(edit.hex),
    dmcCode: edit.dmcCode,
    marker: edit.marker,
  }
}

function uniquePaletteFromStitches(stitches: Stitch[]): string[] {
  const seen = new Set<string>()
  const palette: string[] = []
  for (const stitch of stitches) {
    const hex = normalizeHex(stitch.hex)
    if (seen.has(hex)) continue
    seen.add(hex)
    palette.push(hex)
  }
  return palette
}

function appendMissingPalette(base: string[], candidate: string[]): string[] {
  const next = base.map(normalizeHex)
  const known = new Set(next)

  for (const hex of candidate) {
    const normalized = normalizeHex(hex)
    if (known.has(normalized)) continue
    known.add(normalized)
    next.push(normalized)
  }

  return next
}

function normalizeHex(hex: string): string {
  return hex.startsWith('#') ? hex.toUpperCase() : `#${hex.toUpperCase()}`
}
