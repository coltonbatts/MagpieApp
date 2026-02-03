import { useEffect, useState } from 'react'
import { ControlPanel } from './components/ControlPanel'
import { Layout } from './components/Layout'
import { Legend } from './components/Legend'
import { Pattern } from './model/Pattern'
import { usePatternStore } from './store/pattern-store'
import { PatternViewer } from './viewer/PatternViewer'
import { DMCTester } from './components/DMCTester'

export default function App() {
  const { pattern, normalizedImage, processingConfig, setPattern } = usePatternStore()
  const [showDMCTester, setShowDMCTester] = useState(true)

  useEffect(() => {
    if (!normalizedImage) {
      if (!pattern) {
        setPattern(Pattern.createMock(20))
      }
      return
    }

    setPattern(Pattern.fromImageData(normalizedImage, processingConfig.colorCount))
  }, [normalizedImage, pattern, processingConfig.colorCount, setPattern])

  // DMC Tester mode
  if (showDMCTester) {
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
      <div className="absolute top-4 right-4 z-10">
        <button
          onClick={() => setShowDMCTester(true)}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors text-sm shadow-lg"
        >
          Test DMC Matcher
        </button>
      </div>
      <Layout
        viewer={<PatternViewer pattern={pattern} showGrid={true} />}
        controls={<ControlPanel />}
        legend={<Legend />}
      />
    </div>
  )
}
