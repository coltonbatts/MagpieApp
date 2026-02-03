import { FILE_UPLOAD } from './constants'

export function isAcceptedImageType(type: string): boolean {
  return FILE_UPLOAD.ACCEPTED_TYPES.includes(type as (typeof FILE_UPLOAD.ACCEPTED_TYPES)[number])
}
