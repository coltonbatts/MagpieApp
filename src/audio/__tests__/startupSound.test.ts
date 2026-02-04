import { describe, expect, it, vi } from 'vitest'
import { createStartupSoundController } from '@/audio/startupSound'

interface MemoryStorage {
  values: Map<string, string>
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

function createMemoryStorage(): MemoryStorage {
  const values = new Map<string, string>()
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value)
    },
  }
}

describe('startup sound', () => {
  it('plays once even if initialized multiple times', async () => {
    const storage = createMemoryStorage()
    const play = vi.fn(() => Promise.resolve())
    const createAudio = vi.fn(() => ({
      preload: '',
      volume: 0,
      currentTime: 0,
      play,
    }))

    const controller = createStartupSoundController({
      createAudio,
      addFallbackListeners: () => () => {},
      storage,
      isDev: false,
      warn: () => {},
      debug: () => {},
    })

    controller.initStartupSound()
    controller.initStartupSound()
    await Promise.resolve()

    expect(createAudio).toHaveBeenCalledTimes(1)
    expect(play).toHaveBeenCalledTimes(1)
  })

  it('does not play when disabled', async () => {
    const storage = createMemoryStorage()
    storage.setItem('magpie:startupSoundEnabled', '0')
    const play = vi.fn(() => Promise.resolve())
    const createAudio = vi.fn(() => ({
      preload: '',
      volume: 0,
      currentTime: 0,
      play,
    }))

    const controller = createStartupSoundController({
      createAudio,
      addFallbackListeners: () => () => {},
      storage,
      isDev: false,
      warn: () => {},
      debug: () => {},
    })

    controller.initStartupSound()
    await Promise.resolve()

    expect(createAudio).not.toHaveBeenCalled()
    expect(play).not.toHaveBeenCalled()
  })
})
