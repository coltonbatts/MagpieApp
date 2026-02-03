import { UploadZone } from '@/components/UploadZone'
import { usePatternStore } from '@/store/pattern-store'
import { useUIStore } from '@/store/ui-store'

export function ReferenceStage() {
    const { normalizedImage } = usePatternStore()
    const { setWorkflowStage } = useUIStore()

    return (
        <div className="flex flex-col items-center justify-center min-h-[calc(100vh-64px)] bg-gray-50 p-8">
            <div className="w-full max-w-xl bg-white rounded-2xl shadow-xl p-10 space-y-8">
                <div className="text-center space-y-2">
                    <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">Step 1: Reference Image</h2>
                    <p className="text-gray-500">Upload the image you want to turn into an embroidery pattern.</p>
                </div>

                <div className="bg-gray-50 rounded-xl p-8 border-2 border-dashed border-gray-200 hover:border-blue-400 transition-colors">
                    <UploadZone />
                </div>

                {normalizedImage && (
                    <div className="pt-4 flex flex-col items-center space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="w-32 h-32 rounded-lg border border-gray-200 overflow-hidden shadow-sm">
                            <img
                                src={imageDataToDataURL(normalizedImage)}
                                alt="Current reference"
                                className="w-full h-full object-contain"
                            />
                        </div>
                        <button
                            onClick={() => setWorkflowStage('Select')}
                            className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold text-lg hover:bg-blue-700 shadow-xl shadow-blue-100 transition-all transform hover:-translate-y-1 active:translate-y-0"
                        >
                            Continue to Selection
                        </button>
                    </div>
                )}
            </div>

            <div className="mt-12 text-sm text-gray-400 flex items-center space-x-4">
                <div className="flex items-center space-x-1">
                    <span>📏</span>
                    <span>Letter/A4 Ready</span>
                </div>
                <div className="h-1 w-1 bg-gray-300 rounded-full"></div>
                <div className="flex items-center space-x-1">
                    <span>🧵</span>
                    <span>DMC Mapped</span>
                </div>
                <div className="h-1 w-1 bg-gray-300 rounded-full"></div>
                <div className="flex items-center space-x-1">
                    <span>🎨</span>
                    <span>Vector Exports</span>
                </div>
            </div>
        </div>
    )
}

function imageDataToDataURL(imageData: ImageData): string {
    const canvas = document.createElement('canvas')
    canvas.width = imageData.width
    canvas.height = imageData.height
    const ctx = canvas.getContext('2d')
    if (ctx) {
        ctx.putImageData(imageData, 0, 0)
    }
    return canvas.toDataURL()
}
