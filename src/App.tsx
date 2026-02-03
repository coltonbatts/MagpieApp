import { useEffect, useState } from 'react'
import { ControlPanel } from './components/ControlPanel'
import { Layout } from './components/Layout'
import { Legend } from './components/Legend'
import { Pattern } from './model/Pattern'
import { usePatternStore } from './store/pattern-store'
import { PatternViewer } from './viewer/PatternViewer'
import { DMCTester } from './components/DMCTester'
import { logNormalizedImageDebug, logPatternPaletteDebug } from './processing/debug-color'
import { runPatternColorSanityTest } from './model/pattern-color.sanity'

export default function App() {
  const { pattern, normalizedImage, processingConfig, setPattern } = usePatternStore()
  const [showDMCTester, setShowDMCTester] = useState(false)
  const isDev = import.meta.env.DEV

  useEffect(() => {
    if (!isDev) return
    if (window.localStorage.getItem('magpie:runColorSanity') !== '1') return
    runPatternColorSanityTest()
  }, [isDev])

  useEffect(() => {
    // `normalizedImage` is the canonical pixel grid for pattern generation:
    // it is already resized upstream and must not be mutated in the viewer path.
    if (!normalizedImage) {
      return
    }

    const debugColor = isDev && window.localStorage.getItem('magpie:debugColor') === '1'
    if (debugColor) {
      logNormalizedImageDebug(normalizedImage)
    }

    const rawPattern = Pattern.fromImageData(normalizedImage, processingConfig)
    if (debugColor) {
      logPatternPaletteDebug(rawPattern)
    }
    const nextPattern = processingConfig.useDmcPalette
      ? rawPattern.withDmcPaletteMapping()
      : rawPattern
    setPattern(nextPattern)
  }, [
    normalizedImage,
    processingConfig,
    processingConfig.useDmcPalette,
    setPattern,
  ])

  // Dev-only DMC tester mode; product defaults to the pattern workflow.
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

  // Pattern viewer mode
  return (
    <div className="relative h-screen">
      {isDev && (
        <div className="absolute top-4 right-4 z-10">
          <button
            onClick={() => setShowDMCTester(true)}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors text-sm shadow-lg"
          >
            Test DMC Matcher
          </button>
        </div>
      )}
      <Layout
        viewer={<PatternViewer pattern={pattern} showGrid={true} />}
        controls={<ControlPanel />}
        legend={<Legend />}
      />
    </div>
  )
}
