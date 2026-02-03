import type { ProcessingConfig } from '@/types'

self.onmessage = (event: MessageEvent<{ image: ImageData; config: ProcessingConfig }>) => {
  const { image } = event.data

  // TODO: Day 3 - implement LAB k-means quantization in worker.
  self.postMessage({
    width: image.width,
    height: image.height,
    clusters: [],
  })
}

export {}
