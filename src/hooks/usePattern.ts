import { usePatternStore } from '@/store/pattern-store'

export function usePattern() {
  return usePatternStore((state) => ({
    pattern: state.pattern,
    setPattern: state.setPattern,
  }))
}
