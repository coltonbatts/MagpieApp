import { usePatternStore } from '@/store/pattern-store'

export function Legend() {
  const { pattern } = usePatternStore()

  if (!pattern) {
    return <p className="text-sm text-gray-500">Upload an image to see legend</p>
  }

  const legend = pattern.getLegend()

  return (
    <div className="space-y-2">
      {legend.map((entry) => (
        <div
          key={entry.dmcCode}
          className="flex items-center gap-2 rounded p-2 hover:bg-gray-50"
        >
          <div
            className="h-6 w-6 rounded border border-gray-300"
            style={{ backgroundColor: entry.hex }}
          />
          <div className="flex-1">
            <div className="text-sm font-mono">{entry.dmcCode}</div>
            <div className="text-xs text-gray-500">{entry.name}</div>
          </div>
          <div className="text-sm text-gray-600">{entry.stitchCount}</div>
        </div>
      ))}
    </div>
  )
}
