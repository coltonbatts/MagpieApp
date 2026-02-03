import { PROCESSING } from '@/lib/constants'
import { usePatternStore } from '@/store/pattern-store'
import { useUIStore } from '@/store/ui-store'
import { ExportMenu } from './ExportMenu'
import { FabricPanel } from './FabricPanel'
import { useState } from 'react'

export function ControlPanel() {
  const { processingConfig, isProcessing, error, setProcessingConfig } = usePatternStore()
  const { workflowStage, setWorkflowStage } = useUIStore()
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Derived "Organic Detail" value (0..1)
  // Higher = more detail (less smoothing/simplify)
  const organicDetail = 1 - ((processingConfig.smoothingAmount + processingConfig.simplifyAmount) / 2)

  const handleOrganicDetailChange = (val: number) => {
    const inverse = 1 - val
    setProcessingConfig({
      smoothingAmount: inverse * 0.8,
      simplifyAmount: inverse * 0.5,
      minRegionSize: Math.round(inverse * 50) + 1
    })
  }

  if (workflowStage === 'Reference' || workflowStage === 'Select') return null

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white border-l border-gray-200">
      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        <div>
          <h2 className="text-lg font-bold text-gray-900 mb-6 flex items-center">
            <span className="mr-2">🛠️</span> Build Controls
          </h2>

          <div className="space-y-6">
            <FabricPanel />

            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">Subject Detail</h3>

              <div>
                <label className="flex justify-between text-sm font-medium text-gray-700 mb-2">
                  <span>Number of Colors</span>
                  <span className="bg-gray-100 px-2 py-0.5 rounded text-xs">{processingConfig.colorCount}</span>
                </label>
                <input
                  type="range"
                  min={PROCESSING.MIN_COLORS}
                  max={PROCESSING.MAX_COLORS}
                  value={processingConfig.colorCount}
                  onChange={(e) =>
                    setProcessingConfig({ colorCount: parseInt(e.target.value, 10) })
                  }
                  className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
              </div>

              <div>
                <label className="flex justify-between text-sm font-medium text-gray-700 mb-2">
                  <span>Organic Detail</span>
                  <span className="bg-gray-100 px-2 py-0.5 rounded text-xs">
                    {organicDetail < 0.3 ? 'Coarse' : organicDetail > 0.7 ? 'Fine' : 'Balanced'}
                  </span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={organicDetail}
                  onChange={(e) => handleOrganicDetailChange(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
                <div className="flex justify-between text-[10px] text-gray-400 mt-1 uppercase">
                  <span>Coarse</span>
                  <span>Fine</span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">Palette</h3>
              <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100 cursor-pointer hover:bg-gray-100 transition-colors">
                <input
                  type="checkbox"
                  checked={processingConfig.useDmcPalette}
                  onChange={(e) => setProcessingConfig({ useDmcPalette: e.target.checked })}
                  className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">Map to DMC Thread Colors</span>
              </label>
            </div>

            <div>
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center"
              >
                {showAdvanced ? 'Hide Advanced Settings' : 'Show Advanced Settings'}
              </button>

              {showAdvanced && (
                <div className="mt-4 pt-4 border-t border-gray-100 space-y-4 animate-in fade-in duration-300">
                  <div>
                    <label className="mb-2 block text-xs font-medium text-gray-500">
                      Target Size: {processingConfig.targetSize}px
                    </label>
                    <input
                      type="range"
                      min={PROCESSING.MIN_TARGET_SIZE}
                      max={PROCESSING.MAX_TARGET_SIZE}
                      value={processingConfig.targetSize}
                      onChange={(e) =>
                        setProcessingConfig({ targetSize: parseInt(e.target.value, 10) })
                      }
                      className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gray-400"
                    />
                  </div>

                  <label className="flex items-center gap-2 text-xs text-gray-500">
                    <input
                      type="checkbox"
                      checked={processingConfig.organicPreview}
                      onChange={(e) => setProcessingConfig({ organicPreview: e.target.checked })}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    Organic Preview (Curved Regions)
                  </label>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 border-t border-gray-200 bg-gray-50 space-y-4">
        {workflowStage === 'Build' ? (
          <button
            onClick={() => setWorkflowStage('Export')}
            className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-100 transition-all"
          >
            Continue to Export
          </button>
        ) : (
          <ExportMenu />
        )}

        <button
          onClick={() => setWorkflowStage('Select')}
          className="w-full py-2 text-sm font-medium text-gray-500 hover:text-gray-700"
        >
          Back to Selection
        </button>

        {isProcessing && (
          <div className="flex items-center justify-center space-x-2 py-2">
            <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce"></div>
            <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce [animation-delay:-.15s]"></div>
            <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce [animation-delay:-.3s]"></div>
            <span className="text-xs font-medium text-blue-600 ml-2">Processing...</span>
          </div>
        )}

        {error && <p className="text-xs text-red-600 text-center bg-red-50 p-2 rounded">{error}</p>}
      </div>
    </div>
  )
}
