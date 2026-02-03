import { usePatternStore } from '@/store/pattern-store'
import { hsvToRgb, rgbToHsv } from '@/processing/color-spaces'
import { useEffect, useState } from 'react'

export function FabricPanel() {
    const { processingConfig, setProcessingConfig } = usePatternStore()
    const [hsv, setHsv] = useState<[number, number, number]>([0, 0, 96])

    useEffect(() => {
        const { r, g, b } = processingConfig.fabricColor
        setHsv(rgbToHsv(r, g, b))
    }, [])

    const updateColor = (h: number, s: number, v: number) => {
        setHsv([h, s, v])
        const [r, g, b] = hsvToRgb(h, s, v)
        setProcessingConfig({ fabricColor: { r, g, b } })
    }

    const fabricHex = `#${processingConfig.fabricColor.r.toString(16).padStart(2, '0')}${processingConfig.fabricColor.g.toString(16).padStart(2, '0')}${processingConfig.fabricColor.b.toString(16).padStart(2, '0')}`.toUpperCase()

    return (
        <div className="space-y-4 p-4 border border-gray-200 rounded-lg bg-gray-50/50">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500">Fabric Selection</h3>
                <div
                    className="w-10 h-10 rounded border border-gray-300 shadow-sm"
                    style={{ backgroundColor: fabricHex }}
                />
            </div>

            <div className="space-y-3">
                <div>
                    <label className="flex justify-between text-xs font-medium text-gray-600 mb-1">
                        <span>Hue</span>
                        <span>{hsv[0]}°</span>
                    </label>
                    <input
                        type="range"
                        min={0}
                        max={360}
                        value={hsv[0]}
                        onChange={(e) => updateColor(parseInt(e.target.value), hsv[1], hsv[2])}
                        className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gray-700"
                    />
                </div>

                <div>
                    <label className="flex justify-between text-xs font-medium text-gray-600 mb-1">
                        <span>Saturation</span>
                        <span>{hsv[1]}%</span>
                    </label>
                    <input
                        type="range"
                        min={0}
                        max={100}
                        value={hsv[1]}
                        onChange={(e) => updateColor(hsv[0], parseInt(e.target.value), hsv[2])}
                        className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gray-700"
                    />
                </div>

                <div>
                    <label className="flex justify-between text-xs font-medium text-gray-600 mb-1">
                        <span>Brightness</span>
                        <span>{hsv[2]}%</span>
                    </label>
                    <input
                        type="range"
                        min={0}
                        max={100}
                        value={hsv[2]}
                        onChange={(e) => updateColor(hsv[0], hsv[1], parseInt(e.target.value))}
                        className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gray-700"
                    />
                </div>

                <div className="pt-2">
                    <label className="flex justify-between text-xs font-medium text-gray-600 mb-1">
                        <span>Stitch Coverage Threshold</span>
                        <span>{Math.round(processingConfig.stitchThreshold * 100)}%</span>
                    </label>
                    <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={processingConfig.stitchThreshold}
                        onChange={(e) => setProcessingConfig({ stitchThreshold: parseFloat(e.target.value) })}
                        className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                    <p className="text-[10px] text-gray-400 mt-1 italic">
                        Lower = more fabric remains unstitched.
                    </p>
                </div>
            </div>
        </div>
    )
}
