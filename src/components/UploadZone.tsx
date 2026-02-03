import { useRef } from 'react'
import { FILE_UPLOAD } from '@/lib/constants'
import { validateImageFile } from '@/lib/validation'
import { loadImageBitmap, normalizeImage, normalizeImageCapped } from '@/processing/image-utils'
import { usePatternStore } from '@/store/pattern-store'

export function UploadZone() {
  const inputRef = useRef<HTMLInputElement>(null)
  const {
    originalImage,
    normalizedImage,
    selectionWorkingImage,
    processingConfig,
    setOriginalImage,
    setSourceImages,
    setIsProcessing,
    setError,
  } = usePatternStore()

  async function handleFile(file: File) {
    const validationError = validateImageFile(file)
    if (validationError) {
      setError(validationError)
      return
    }

    setError(null)
    setIsProcessing(true)

    try {
      const bitmap = await loadImageBitmap(file)
      const buildImage = normalizeImage(bitmap, processingConfig.targetSize)
      const selectionImage = normalizeImageCapped(
        bitmap,
        processingConfig.selectionWorkingSize,
        processingConfig.selectionMaxMegapixels
      )
      setOriginalImage(bitmap)
      setSourceImages(buildImage, selectionImage)
    } catch (error) {
      console.error('Image upload failed:', error)
      setError('Failed to read image. Please try another file.')
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept={FILE_UPLOAD.ACCEPTED_EXTENSIONS.join(',')}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) {
            void handleFile(file)
          }
          event.currentTarget.value = ''
        }}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="w-full rounded border border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-left text-sm text-gray-700 hover:bg-gray-100"
      >
        Upload image
        <span className="mt-1 block text-xs text-gray-500">
          JPG, PNG, WEBP up to {FILE_UPLOAD.MAX_SIZE_MB}MB
        </span>
      </button>

      {normalizedImage && selectionWorkingImage && originalImage && (
        <p className="text-xs text-gray-600">
          Source {originalImage.width} x {originalImage.height}px, selection grid {selectionWorkingImage.width} x {selectionWorkingImage.height}px, build grid {normalizedImage.width} x {normalizedImage.height}px
        </p>
      )}
    </div>
  )
}
