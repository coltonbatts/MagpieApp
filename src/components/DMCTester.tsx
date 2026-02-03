import { useState } from 'react'
import { matchRGBToDMC, getClosestDMCColors } from '@/palette/matcher'
import { rgbToLab, hexToRgb } from '@/palette/color-conversion'
import type { RGBColor } from '@/types'

export function DMCTester() {
  const [testColor, setTestColor] = useState('#FF6B35')
  const [useMetric, setUseMetric] = useState<'CIE76' | 'CIE94' | 'CMC'>('CMC')

  const rgb: RGBColor = hexToRgb(testColor)
  const closestDMC = matchRGBToDMC(rgb, [], useMetric)
  const lab = rgbToLab(rgb)
  const alternatives = getClosestDMCColors(lab, 5, [], useMetric)

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">DMC Color Matcher Test</h2>
        <p className="text-sm text-gray-600">
          Pick a color to see the closest DMC thread match
        </p>
      </div>

      {/* Color Picker */}
      <div className="space-y-3">
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Test Color</span>
          <div className="flex gap-3 items-center mt-2">
            <input
              type="color"
              value={testColor}
              onChange={(e) => setTestColor(e.target.value)}
              className="h-12 w-24 rounded cursor-pointer border-2 border-gray-300"
            />
            <input
              type="text"
              value={testColor}
              onChange={(e) => setTestColor(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-300 rounded font-mono text-sm"
              placeholder="#FF6B35"
            />
          </div>
        </label>

        {/* Metric Selector */}
        <label className="block">
          <span className="text-sm font-medium text-gray-700">
            Distance Metric
          </span>
          <select
            value={useMetric}
            onChange={(e) => setUseMetric(e.target.value as any)}
            className="mt-2 block w-full px-3 py-2 border border-gray-300 rounded"
          >
            <option value="CIE76">CIE76 (Fastest)</option>
            <option value="CIE94">CIE94 (Better for textiles)</option>
            <option value="CMC">CMC (Best accuracy)</option>
          </select>
        </label>
      </div>

      {/* Input Color Info */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="font-semibold mb-2">Input Color</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-gray-600">RGB:</span>
            <span className="ml-2 font-mono">
              ({rgb.r}, {rgb.g}, {rgb.b})
            </span>
          </div>
          <div>
            <span className="text-gray-600">Hex:</span>
            <span className="ml-2 font-mono">{testColor.toUpperCase()}</span>
          </div>
          <div>
            <span className="text-gray-600">LAB:</span>
            <span className="ml-2 font-mono">
              ({lab.L.toFixed(1)}, {lab.a.toFixed(1)}, {lab.b.toFixed(1)})
            </span>
          </div>
        </div>
      </div>

      {/* Closest Match */}
      <div className="border-2 border-blue-500 rounded-lg p-4 bg-blue-50">
        <h3 className="font-semibold mb-3 text-blue-900">Closest DMC Match</h3>
        <div className="flex items-center gap-4">
          <div
            className="w-20 h-20 rounded-lg border-2 border-gray-300 shadow-sm"
            style={{ backgroundColor: closestDMC.hex }}
          />
          <div className="flex-1">
            <div className="text-2xl font-bold text-gray-900">
              DMC {closestDMC.code}
            </div>
            <div className="text-lg text-gray-700">{closestDMC.name}</div>
            <div className="text-sm text-gray-600 font-mono mt-1">
              {closestDMC.hex}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Distance: {alternatives[0].distance.toFixed(2)} ({useMetric})
            </div>
          </div>
        </div>
      </div>

      {/* Alternative Matches */}
      <div>
        <h3 className="font-semibold mb-3">Alternative Matches</h3>
        <div className="space-y-2">
          {alternatives.slice(1).map(({ color: dmc, distance }) => (
            <div
              key={dmc.code}
              className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <div
                className="w-12 h-12 rounded border-2 border-gray-300"
                style={{ backgroundColor: dmc.hex }}
              />
              <div className="flex-1">
                <div className="font-semibold">DMC {dmc.code}</div>
                <div className="text-sm text-gray-600">{dmc.name}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-gray-500 font-mono">{dmc.hex}</div>
                <div className="text-xs text-gray-400">Δ {distance.toFixed(2)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Test Colors */}
      <div>
        <h3 className="font-semibold mb-3">Quick Test Colors</h3>
        <div className="grid grid-cols-6 gap-2">
          {[
            '#FF0000', // Red
            '#00FF00', // Green
            '#0000FF', // Blue
            '#FFFF00', // Yellow
            '#FF00FF', // Magenta
            '#00FFFF', // Cyan
            '#FFA500', // Orange
            '#800080', // Purple
            '#FFC0CB', // Pink
            '#8B4513', // Brown
            '#808080', // Gray
            '#000000', // Black
          ].map((color) => (
            <button
              key={color}
              onClick={() => setTestColor(color)}
              className="h-12 rounded border-2 border-gray-300 hover:border-gray-500 transition-colors cursor-pointer"
              style={{ backgroundColor: color }}
              title={color}
            />
          ))}
        </div>
      </div>

      {/* Info */}
      <div className="text-xs text-gray-500 bg-gray-50 rounded p-3">
        <p>
          <strong>How it works:</strong> Your color is converted to LAB color
          space (perceptually uniform), then matched against 200+ DMC colors
          using Delta-E distance metric. Lower distance = closer match.
        </p>
        <ul className="mt-2 space-y-1 list-disc list-inside">
          <li>
            <strong>CIE76:</strong> Simple Euclidean distance (fastest)
          </li>
          <li>
            <strong>CIE94:</strong> Improved weighting for textiles
          </li>
          <li>
            <strong>CMC:</strong> Best perceptual accuracy for threads
            (recommended)
          </li>
        </ul>
      </div>
    </div>
  )
}
