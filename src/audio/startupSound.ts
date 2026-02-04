import startupSoundFile from '@/assets/audio/startup-sound.mp3'

const STORAGE_KEY = 'magpie:startupSoundEnabled'
const ENABLED_VALUE = '1'
const DISABLED_VALUE = '0'
const GLOBAL_STATE_KEY = '__magpieStartupSoundState'

export const STARTUP_SOUND_VOLUME = 0.2

interface StartupSoundAudio {
  preload: string
  volume: number
  currentTime: number
  play: () => Promise<void> | void
}

interface StartupSoundStorage {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

interface StartupSoundEnvironment {
  createAudio: () => StartupSoundAudio
  addFallbackListeners: (onInteraction: () => void) => () => void
  storage?: StartupSoundStorage
  isDev: boolean
  warn: (...args: unknown[]) => void
  debug: (...args: unknown[]) => void
}

interface StartupSoundState {
  initialized: boolean
  played: boolean
  playing: boolean
  removeFallbackListeners: (() => void) | null
}

function createDefaultState(): StartupSoundState {
  return {
    initialized: false,
    played: false,
    playing: false,
    removeFallbackListeners: null,
  }
}

function getGlobalState(): StartupSoundState {
  const globalObject = globalThis as typeof globalThis & { [GLOBAL_STATE_KEY]?: StartupSoundState }
  if (!globalObject[GLOBAL_STATE_KEY]) {
    globalObject[GLOBAL_STATE_KEY] = createDefaultState()
  }
  return globalObject[GLOBAL_STATE_KEY]
}

function readEnabled(storage?: StartupSoundStorage): boolean {
  if (!storage) return true
  try {
    return storage.getItem(STORAGE_KEY) !== DISABLED_VALUE
  } catch {
    return true
  }
}

function writeEnabled(storage: StartupSoundStorage | undefined, enabled: boolean): void {
  if (!storage) return
  try {
    storage.setItem(STORAGE_KEY, enabled ? ENABLED_VALUE : DISABLED_VALUE)
  } catch {
    // Ignore storage write issues and keep the app responsive.
  }
}

function clearFallback(state: StartupSoundState): void {
  state.removeFallbackListeners?.()
  state.removeFallbackListeners = null
}

export function createStartupSoundController(env: StartupSoundEnvironment | null, state: StartupSoundState = createDefaultState()) {
  function shouldPlayStartupSound(): boolean {
    return readEnabled(env?.storage)
  }

  function setStartupSoundEnabled(enabled: boolean): void {
    writeEnabled(env?.storage, enabled)
  }

  function playOnce(trigger: 'mount' | 'interaction'): void {
    if (!env) return
    if (!shouldPlayStartupSound()) return
    if (state.played || state.playing) return

    state.playing = true
    const audio = env.createAudio()
    audio.preload = 'auto'
    audio.volume = STARTUP_SOUND_VOLUME
    audio.currentTime = 0

    void Promise.resolve(audio.play())
      .then(() => {
        state.played = true
        clearFallback(state)
        if (env.isDev) env.debug('[startup-sound] played')
      })
      .catch((error) => {
        if (env.isDev) {
          env.warn('[startup-sound] play failed', error)
        }
        if (trigger === 'mount' && !state.removeFallbackListeners && !state.played) {
          state.removeFallbackListeners = env.addFallbackListeners(() => {
            clearFallback(state)
            playOnce('interaction')
          })
          if (env.isDev) env.debug('[startup-sound] waiting for first interaction')
        }
      })
      .finally(() => {
        state.playing = false
      })
  }

  function initStartupSound(): void {
    if (!env) return
    if (state.initialized) return
    state.initialized = true

    if (!shouldPlayStartupSound()) {
      if (env.isDev) env.debug('[startup-sound] disabled by preference')
      return
    }

    playOnce('mount')
  }

  function enableStartupSound(): void {
    setStartupSoundEnabled(true)
  }

  function disableStartupSound(): void {
    setStartupSoundEnabled(false)
  }

  return {
    initStartupSound,
    shouldPlayStartupSound,
    setStartupSoundEnabled,
    enableStartupSound,
    disableStartupSound,
  }
}

function createBrowserEnvironment(): StartupSoundEnvironment | null {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') {
    return null
  }

  return {
    createAudio: () => new Audio(startupSoundFile),
    addFallbackListeners: (onInteraction) => {
      const onPointer = () => onInteraction()
      const onKeydown = () => onInteraction()
      window.addEventListener('pointerdown', onPointer, { once: true, capture: true })
      window.addEventListener('keydown', onKeydown, { once: true, capture: true })
      return () => {
        window.removeEventListener('pointerdown', onPointer, true)
        window.removeEventListener('keydown', onKeydown, true)
      }
    },
    storage: window.localStorage,
    isDev: import.meta.env.DEV,
    warn: (...args) => console.warn(...args),
    debug: (...args) => console.debug(...args),
  }
}

const startupSoundController = createStartupSoundController(createBrowserEnvironment(), getGlobalState())

export function initStartupSound(): void {
  startupSoundController.initStartupSound()
}

export function shouldPlayStartupSound(): boolean {
  return startupSoundController.shouldPlayStartupSound()
}

export function setStartupSoundEnabled(enabled: boolean): void {
  startupSoundController.setStartupSoundEnabled(enabled)
}

export function enableStartupSound(): void {
  startupSoundController.enableStartupSound()
}

export function disableStartupSound(): void {
  startupSoundController.disableStartupSound()
}
