import { PROCESSING } from '@/lib/constants'
import { usePatternStore } from '@/store/pattern-store'
import { UploadZone } from './UploadZone'

export function ControlPanel() {
  const { processingConfig, isProcessing, error, setProcessingConfig } =
    usePatternStore()

  return (
    <div className="space-y-6">
      <UploadZone />

      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700">
          Target Size (shortest side): {processingConfig.targetSize}px
        </label>
        <input
          type="range"
          min={PROCESSING.MIN_TARGET_SIZE}
          max={PROCESSING.MAX_TARGET_SIZE}
          value={processingConfig.targetSize}
          onChange={(e) =>
            setProcessingConfig({ targetSize: parseInt(e.target.value, 10) })
          }
          className="w-full"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700">
          Number of Colors: {processingConfig.colorCount}
        </label>
        <input
          type="range"
          min={PROCESSING.MIN_COLORS}
          max={PROCESSING.MAX_COLORS}
          value={processingConfig.colorCount}
          onChange={(e) =>
            setProcessingConfig({ colorCount: parseInt(e.target.value, 10) })
          }
          className="w-full"
        />
      </div>

      {isProcessing && (
        <p className="text-xs font-medium text-blue-600">Processing image...</p>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
