import { PROCESSING } from '@/lib/constants'
import { usePatternStore } from '@/store/pattern-store'
import { UploadZone } from './UploadZone'
import { ExportMenu } from './ExportMenu'
import { FabricPanel } from './FabricPanel'

export function ControlPanel() {
  const { processingConfig, isProcessing, error, setProcessingConfig } =
    usePatternStore()

  return (
    <div className="space-y-6">
      <UploadZone />
      <FabricPanel />

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
          className="w-full accent-gray-900"
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
          className="w-full accent-gray-900"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700">
          Smoothing: {Math.round(processingConfig.smoothingAmount * 100)}%
        </label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={processingConfig.smoothingAmount}
          onChange={(e) =>
            setProcessingConfig({ smoothingAmount: parseFloat(e.target.value) })
          }
          className="w-full accent-gray-900"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700">
          Simplify: {Math.round(processingConfig.simplifyAmount * 100)}%
        </label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={processingConfig.simplifyAmount}
          onChange={(e) =>
            setProcessingConfig({ simplifyAmount: parseFloat(e.target.value) })
          }
          className="w-full accent-gray-900"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700">
          Min Region Size: {processingConfig.minRegionSize}px
        </label>
        <input
          type="range"
          min={1}
          max={50}
          step={1}
          value={processingConfig.minRegionSize}
          onChange={(e) =>
            setProcessingConfig({ minRegionSize: parseInt(e.target.value, 10) })
          }
          className="w-full accent-gray-900"
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={processingConfig.useDmcPalette}
          onChange={(e) => setProcessingConfig({ useDmcPalette: e.target.checked })}
          className="h-4 w-4 accent-gray-900"
        />
        Map palette to DMC thread colors
      </label>

      <div className="space-y-4 pt-2 border-t border-gray-100">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={processingConfig.organicPreview}
            onChange={(e) => setProcessingConfig({ organicPreview: e.target.checked })}
            className="h-4 w-4 accent-gray-900"
          />
          Organic Preview (Curved Regions)
        </label>
      </div>

      <ExportMenu />

      {isProcessing && (
        <p className="text-xs font-medium text-blue-600">Processing image...</p>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
