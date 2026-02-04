import { useEffect, useMemo, useRef } from 'react'
import { usePatternStore } from '@/store/pattern-store'
import { useUIStore } from '@/store/ui-store'
import { Panel } from './ui'

interface LegendProps {
  mode?: 'default' | 'build'
}

export function Legend({ mode = 'default' }: LegendProps) {
  const {
    pattern,
    processingConfig,
    buildArtifact,
    activeRegionId,
    doneRegionIds,
    setActiveRegionId,
  } = usePatternStore()
  const { highlightColorKey, setHighlightColorKey } = useUIStore()
  const isDev = import.meta.env.DEV
  const rowRefByColor = useRef(new Map<string, HTMLDivElement>())

  if (!pattern) {
    return (
      <Panel variant="inset">
        <p className="text-sm text-fg-subtle">Upload an image to see legend</p>
      </Panel>
    )
  }

  const doneSet = useMemo(() => new Set(doneRegionIds), [doneRegionIds])
  const regionIdsByColorKey = useMemo(() => {
    const map = new Map<string, number[]>()
    if (!buildArtifact) return map
    for (const ids of buildArtifact.regionsByColor) {
      if (!ids || ids.length === 0) continue
      const first = buildArtifact.regions[ids[0] - 1]
      if (!first) continue
      map.set(first.colorKey, ids)
    }
    return map
  }, [buildArtifact])
  const legend = pattern.getLegend({
    fabricConfig: {
      fabricColor: processingConfig.fabricColor,
      stitchThreshold: processingConfig.stitchThreshold,
    },
  })

  useEffect(() => {
    if (mode !== 'build' || !buildArtifact || !activeRegionId) return
    const activeRegion = buildArtifact.regions.find((region) => region.id === activeRegionId)
    if (!activeRegion) return
    setHighlightColorKey(activeRegion.colorKey)
    rowRefByColor.current.get(activeRegion.colorKey)?.scrollIntoView({ block: 'nearest' })
  }, [activeRegionId, buildArtifact, mode, setHighlightColorKey])

  return (
    <Panel variant="inset" className="h-full">
      {highlightColorKey && (
        <button
          type="button"
          onClick={() => setHighlightColorKey(null)}
          className="mb-2 w-full rounded-md border border-border bg-surface-2 px-2 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-2/80 hover:text-fg"
        >
          Clear highlight (Esc)
        </button>
      )}
      <div className="max-h-[calc(100vh-16rem)] overflow-y-auto pr-1">
        {legend.map((entry, index) => {
          const coveragePercent = (entry.coverage * 100).toFixed(1)
          const colorKey = `${entry.dmcCode.toUpperCase()}|${entry.hex.toUpperCase()}`
          const isHighlighted = highlightColorKey === colorKey
          const regionIds = regionIdsByColorKey.get(colorKey) ?? []
          const doneCount = regionIds.reduce((acc, id) => (doneSet.has(id) ? acc + 1 : acc), 0)

          return (
            <div
              key={`${entry.hex}-${entry.dmcCode}`}
              ref={(node) => {
                if (node) {
                  rowRefByColor.current.set(colorKey, node)
                } else {
                  rowRefByColor.current.delete(colorKey)
                }
              }}
              onClick={() => {
                setHighlightColorKey(isHighlighted ? null : colorKey)
                if (mode === 'build' && regionIds.length > 0) {
                  setActiveRegionId(regionIds[0])
                }
              }}
              className={[
                'flex cursor-pointer items-center gap-3 px-2 py-2.5 transition-colors hover:bg-surface-2',
                index !== 0 ? 'border-t border-border/70' : '',
                isHighlighted ? 'bg-blue-50/50' : ''
              ].join(' ')}
            >
              <div
                className={[
                  'h-6 w-6 shrink-0 rounded border',
                  isHighlighted ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-border'
                ].join(' ')}
                style={{ backgroundColor: entry.hex }}
              />
              <div className="min-w-0 flex-1">
                <div className={['truncate text-sm font-mono', isHighlighted ? 'font-bold text-blue-700' : 'text-fg'].join(' ')}>
                  {entry.isMappedToDmc ? `DMC ${entry.dmcCode}` : entry.hex}
                </div>
                <div className="text-xs text-fg-subtle">
                  {entry.isMappedToDmc ? entry.name : 'Quantized color'}
                </div>
                {entry.isMappedToDmc && (
                  <div className="truncate text-xs text-fg-subtle">
                    {entry.hex}
                  </div>
                )}
                {mode === 'build' && regionIds.length > 0 && (
                  <div className="text-[11px] text-fg-subtle">
                    {regionIds.length} regions
                    {regionIds.length > 0 ? ` | ${Math.round((doneCount / regionIds.length) * 100)}% done` : ''}
                  </div>
                )}
              </div>
              <div className="text-right text-sm text-fg-muted">
                <div className={isHighlighted ? 'font-bold text-blue-700' : ''}>{entry.stitchCount}</div>
                <div className="text-xs text-fg-subtle">{coveragePercent}%</div>
              </div>
            </div>
          )
        })}
      </div>

      {isDev && pattern.mappingTable.length > 0 && (
        <div className="mt-2 rounded-md border border-border bg-surface px-2.5 py-2 text-xs font-mono text-fg-muted">
          <div className="mb-1 font-semibold text-fg-subtle">
            DEV: DMC mapping (raw -&gt; mapped)
          </div>
          {pattern.mappingTable.map((entry) => (
            <div key={`${entry.originalHex}-${entry.mappedHex}`}>
              {entry.originalHex} -&gt; {entry.mappedHex} (DMC {entry.dmc.code})
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}
