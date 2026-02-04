import { useEffect, useState } from 'react'
import { ControlPanel } from './components/ControlPanel'
import { Layout } from './components/Layout'
import { Legend } from './components/Legend'
import { SelectionArtifactModel } from './model/SelectionArtifact'
import { usePatternStore } from './store/pattern-store'
import { useUIStore } from './store/ui-store'
import { PatternViewer } from './viewer/PatternViewer'
import { DMCTester } from './components/DMCTester'
import { logNormalizedImageDebug, logPatternPaletteDebug } from './processing/debug-color'
import { runPatternColorSanityTest } from './model/pattern-color.sanity'

import { WorkflowStepper } from './components/workflow/WorkflowStepper'
import { FabricStage } from './components/workflow/FabricStage'
import { ReferenceStage } from './components/workflow/ReferenceStage'
import { SelectStage } from './components/workflow/SelectStage'
import { processPattern } from './processing/process-pattern'

export default function App() {
  const { pattern, normalizedImage, referenceId, selection, processingConfig, setPattern } = usePatternStore()
  const { workflowStage } = useUIStore()
  const [showDMCTester, setShowDMCTester] = useState(false)
  const isDev = import.meta.env.DEV

  useEffect(() => {
    if (!isDev) return
    if (window.localStorage.getItem('magpie:runColorSanity') !== '1') return
    runPatternColorSanityTest()
  }, [isDev])

  const [isProcessing, setIsProcessing] = useState(false)

  useEffect(() => {
    if (!normalizedImage) return

    let isMounted = true
    const debugColor = isDev && window.localStorage.getItem('magpie:debugColor') === '1'

    async function updatePattern() {
      setIsProcessing(true)
      try {
        if (debugColor) logNormalizedImageDebug(normalizedImage!)

        const selectionForBuildRaw = selection
          ? SelectionArtifactModel.resampleTo(selection, normalizedImage!.width, normalizedImage!.height)
          : null
        const selectionSelectedCount = selectionForBuildRaw ? countSelectedPixels(selectionForBuildRaw.mask) : 0
        const selectionForBuild =
          selectionForBuildRaw && selectionSelectedCount > 0 ? selectionForBuildRaw : null

        if (isDev && selectionForBuildRaw && selectionSelectedCount === 0) {
          console.warn('[Magpie][SelectionBridge] Empty build mask detected; falling back to unmasked build render.')
        }

        // Use the unified processing API (automatically uses native on desktop)
        const { pattern: nextPattern } = await processPattern({
          image: normalizedImage!,
          config: processingConfig,
          selection: selectionForBuild,
        })

        if (isMounted) {
          if (debugColor) logPatternPaletteDebug(nextPattern)
          setPattern(nextPattern)
        }
      } catch (err) {
        console.error('Failed to process pattern:', err)
      } finally {
        if (isMounted) setIsProcessing(false)
      }
    }

    updatePattern()

    return () => {
      isMounted = false
    }
  }, [
    normalizedImage,
    referenceId,
    selection?.id,
    processingConfig,
    setPattern,
    isDev
  ])

  if (isDev && showDMCTester) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white shadow-sm border-b border-gray-200 p-4 flex items-center justify-between">
            <h1 className="text-xl font-bold">MagpieApp - DMC Test Mode</h1>
            <button
              onClick={() => setShowDMCTester(false)}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors text-sm"
            >
              Switch to Pattern Viewer
            </button>
          </div>
          <DMCTester />
        </div>
      </div>
    )
  }

  const renderStage = () => {
    switch (workflowStage) {
      case 'Fabric':
        return <FabricStage />
      case 'Reference':
        return <ReferenceStage />
      case 'Select':
        return <SelectStage />
      case 'Build':
      case 'Export':
        return (
          <Layout
            viewer={<PatternViewer pattern={pattern} />}
            controls={<ControlPanel />}
            legend={<Legend />}
          />
        )
      default:
        return <FabricStage />
    }
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-white">
      {isProcessing && (
        <div className="absolute inset-0 z-[100] bg-white/50 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="bg-white px-6 py-4 rounded-xl shadow-2xl border border-gray-100 flex items-center gap-4 animate-in fade-in zoom-in duration-300">
            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-semibold text-gray-800 tracking-tight">Processing Pattern...</span>
          </div>
        </div>
      )}
      <WorkflowStepper />

      <main className="flex-1 relative overflow-hidden">
        {isDev && (
          <div className="absolute top-4 right-4 z-50">
            <button
              onClick={() => setShowDMCTester(true)}
              className="px-3 py-1.5 bg-blue-500 text-white rounded-md text-xs font-bold hover:bg-blue-600 transition-colors shadow-lg"
            >
              DMC Test
            </button>
          </div>
        )}

        {renderStage()}
      </main>
    </div>
  )
}

function countSelectedPixels(mask: Uint8Array): number {
  let selected = 0
  for (let i = 0; i < mask.length; i += 1) {
    if (mask[i] > 0) selected += 1
  }
  return selected
}
