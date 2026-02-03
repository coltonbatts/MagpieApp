import { useEffect, useState } from 'react'
import { ControlPanel } from './components/ControlPanel'
import { Layout } from './components/Layout'
import { Legend } from './components/Legend'
import { Pattern } from './model/Pattern'
import { usePatternStore } from './store/pattern-store'
import { useUIStore } from './store/ui-store'
import { PatternViewer } from './viewer/PatternViewer'
import { DMCTester } from './components/DMCTester'
import { logNormalizedImageDebug, logPatternPaletteDebug } from './processing/debug-color'
import { runPatternColorSanityTest } from './model/pattern-color.sanity'

import { WorkflowStepper } from './components/workflow/WorkflowStepper'
import { ReferenceStage } from './components/workflow/ReferenceStage'
import { SelectStage } from './components/workflow/SelectStage'

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

  useEffect(() => {
    if (!normalizedImage) return

    const debugColor = isDev && window.localStorage.getItem('magpie:debugColor') === '1'
    if (debugColor) logNormalizedImageDebug(normalizedImage)

    const rawPattern = Pattern.fromImageData(normalizedImage, processingConfig, selection)
    if (debugColor) logPatternPaletteDebug(rawPattern)

    const nextPattern = processingConfig.useDmcPalette
      ? rawPattern.withDmcPaletteMapping()
      : rawPattern

    setPattern(nextPattern)
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
        return <ReferenceStage />
    }
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-white">
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
