type CounterName =
  | 'processInvocations'
  | 'manualEditApplications'
  | 'pixiRedrawsDuringDrag'

interface CounterState {
  processInvocations: number
  manualEditApplications: number
  pixiRedrawsDuringDrag: number
}

const FLAG_KEY = 'magpie:devCounters'
const state: CounterState = {
  processInvocations: 0,
  manualEditApplications: 0,
  pixiRedrawsDuringDrag: 0,
}

function countersEnabled(): boolean {
  if (!import.meta.env.DEV || typeof window === 'undefined') return false
  return window.localStorage.getItem(FLAG_KEY) === '1'
}

export function incrementDevCounter(counter: CounterName, detail?: string): void {
  if (!countersEnabled()) return
  state[counter] += 1
  const message = detail ? ` (${detail})` : ''
  console.info(`[Magpie][Counters] ${counter}=${state[counter]}${message}`, { ...state })
}

