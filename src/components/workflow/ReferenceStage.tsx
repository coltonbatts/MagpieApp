import { UploadZone } from '@/components/UploadZone'
import { Button, Panel } from '@/components/ui'
import { usePatternStore } from '@/store/pattern-store'
import { useUIStore } from '@/store/ui-store'

export function ReferenceStage() {
  const { normalizedImage } = usePatternStore()
  const { setWorkflowStage } = useUIStore()

  return (
    <div className="min-h-[calc(100vh-64px)] bg-bg px-4 py-8 md:px-5 md:py-10">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mx-auto w-full max-w-2xl">
          <Panel className="space-y-8" elevated>
            <div className="space-y-2 text-center">
              <h2 className="text-3xl font-semibold tracking-tight text-fg">
                Step 1: Reference Image
              </h2>
              <p className="text-sm text-fg-muted">
                Upload the image you want to turn into an embroidery pattern.
              </p>
            </div>

            <div className="rounded-lg border border-border bg-surface-2 p-6 md:p-7">
              <UploadZone />
            </div>

            {normalizedImage && (
              <div className="flex flex-col items-center space-y-4 pt-2">
                <div className="h-32 w-32 overflow-hidden rounded-md border border-border shadow-sm">
                  <img
                    src={imageDataToDataURL(normalizedImage)}
                    alt="Current reference"
                    className="h-full w-full object-contain"
                  />
                </div>
                <Button
                  onClick={() => setWorkflowStage('Select')}
                  variant="primary"
                  className="h-11 w-full text-base font-semibold"
                >
                  Continue to Selection
                </Button>
              </div>
            )}
          </Panel>
        </div>

        <div className="mt-8 flex items-center justify-center gap-3 text-xs text-fg-subtle md:text-sm">
          <span>Letter/A4 Ready</span>
          <span className="h-1 w-1 rounded-full bg-border-strong" />
          <span>DMC Mapped</span>
          <span className="h-1 w-1 rounded-full bg-border-strong" />
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
