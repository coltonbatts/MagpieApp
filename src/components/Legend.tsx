import { usePatternStore } from '@/store/pattern-store'
import { useUIStore } from '@/store/ui-store'
import { Panel } from './ui'

export function Legend() {
  const { pattern, processingConfig } = usePatternStore()
  const { highlightColorKey, setHighlightColorKey } = useUIStore()
  const isDev = import.meta.env.DEV

  if (!pattern) {
    return (
      <Panel variant="inset">
        <p className="text-sm text-fg-subtle">Upload an image to see legend</p>
      </Panel>
    )
  }

  const legend = pattern.getLegend({
    fabricConfig: {
      fabricColor: processingConfig.fabricColor,
      stitchThreshold: processingConfig.stitchThreshold,
    },
  })

  return (
    <Panel variant="inset" className="h-full">
      <div className="max-h-[calc(100vh-16rem)] overflow-y-auto pr-1">
        {legend.map((entry, index) => {
          const coveragePercent = (entry.coverage * 100).toFixed(1)
          const colorKey = `${entry.dmcCode}|${entry.hex}`
          const isHighlighted = highlightColorKey === colorKey
          return (
            <div
              key={`${entry.hex}-${entry.dmcCode}`}
              onClick={() => {
                if (isHighlighted) {
                  setHighlightColorKey(null)
                } else {
                  setHighlightColorKey(colorKey)
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
