import { FILE_UPLOAD } from './constants'

export function validateImageFile(file: File): string | null {
  if (!FILE_UPLOAD.ACCEPTED_TYPES.includes(file.type as (typeof FILE_UPLOAD.ACCEPTED_TYPES)[number])) {
    return 'Unsupported file type.'
  }

  const sizeMb = file.size / (1024 * 1024)
  if (sizeMb > FILE_UPLOAD.MAX_SIZE_MB) {
    return `File is too large. Max size is ${FILE_UPLOAD.MAX_SIZE_MB}MB.`
  }

  return null
}
