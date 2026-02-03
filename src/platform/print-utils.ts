import type { PrintOptions } from './types'

export async function printHtmlDocument(options: PrintOptions): Promise<void> {
  const blob = new Blob([options.html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  try {
    const printWindow = window.open(url, '_blank', 'noopener,noreferrer')
    if (!printWindow) {
      throw new Error('Print window was blocked. Please allow pop-ups and retry.')
    }

    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        reject(new Error('Print window did not load in time.'))
      }, 10_000)

      printWindow.onload = () => {
        window.clearTimeout(timeout)
        printWindow.focus()
        printWindow.print()
        resolve()
      }
    })
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
  }
}
