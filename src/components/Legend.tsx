import { usePatternStore } from '@/store/pattern-store'

export function Legend() {
  const { pattern, processingConfig } = usePatternStore()
  const isDev = import.meta.env.DEV

  if (!pattern) {
    return <p className="text-sm text-gray-500">Upload an image to see legend</p>
  }
  const legend = pattern.getLegend({
    fabricConfig: {
      fabricColor: processingConfig.fabricColor,
      stitchThreshold: processingConfig.stitchThreshold
    }
  })

  return (
    <div className="space-y-2">
      {legend.map((entry) => {
        const coveragePercent = (entry.coverage * 100).toFixed(1)
        return (
          <div
            key={`${entry.hex}-${entry.dmcCode}`}
            className="flex items-center gap-2 rounded p-2 hover:bg-gray-50"
          >
            <div
              className="h-6 w-6 rounded border border-gray-300"
              style={{ backgroundColor: entry.hex }}
            />
            <div className="flex-1">
              <div className="text-sm font-mono">
                {entry.isMappedToDmc ? `DMC ${entry.dmcCode}` : entry.hex}
              </div>
              <div className="text-xs text-gray-500">
                {entry.isMappedToDmc ? entry.name : 'Quantized color'}
              </div>
              {entry.isMappedToDmc && (
                <div className="text-xs text-gray-500">
                  {entry.hex}
                  {typeof entry.mappedFromCount === 'number' && entry.mappedFromCount > 0
                    ? ` (mapped from ${entry.mappedFromCount} colors)`
                    : ''}
                </div>
              )}
            </div>
            <div className="text-right text-sm text-gray-600">
              <div>{entry.stitchCount}</div>
              <div className="text-xs text-gray-500">{coveragePercent}%</div>
            </div>
          </div>
        )
      })}

      {isDev && pattern.mappingTable.length > 0 && (
        <div className="rounded border border-gray-200 bg-gray-50 p-2 text-xs font-mono text-gray-700">
          <div className="mb-1 font-semibold text-gray-600">
            DEV: DMC mapping (raw -&gt; mapped)
          </div>
          {pattern.mappingTable.map((entry) => (
            <div key={`${entry.originalHex}-${entry.mappedHex}`}>
              {entry.originalHex} -&gt; {entry.mappedHex} (DMC {entry.dmc.code})
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
