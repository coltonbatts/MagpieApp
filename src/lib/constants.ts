export const APP_NAME = 'MagpieApp'

export const FILE_UPLOAD = {
  MAX_SIZE_MB: 10,
  ACCEPTED_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
  ACCEPTED_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.webp'],
} as const

export const PROCESSING = {
  MIN_COLORS: 1,
  MAX_COLORS: 200,
  DEFAULT_COLORS: 20,
  DEFAULT_TARGET_SIZE: 150,
  DEFAULT_SELECTION_WORKING_SIZE: 1024,
  DEFAULT_SELECTION_MAX_MEGAPIXELS: 2,
  MIN_TARGET_SIZE: 50,
  MAX_TARGET_SIZE: 500,
} as const

export const VIEWER = {
  CELL_SIZE: 20,
  MIN_ZOOM: 0.1,
  MAX_ZOOM: 10,
  DEFAULT_ZOOM: 1,
} as const

export const EXPORT = {
  PDF_PAGE_SIZES: {
    A4: { width: 210, height: 297 },
    A3: { width: 297, height: 420 },
    Letter: { width: 216, height: 279 },
  },
  DEFAULT_PAGE_SIZE: 'A4' as const,
} as const
