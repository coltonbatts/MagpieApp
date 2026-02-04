import { useCallback, useRef, useState, useEffect, type ChangeEvent } from 'react'
import { cn } from './cn'

export interface SliderProps {
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  onChangeCommit?: (value: number) => void
  className?: string
  label?: string
  formatValue?: (value: number) => string
  disabled?: boolean
}

/**
 * High-performance slider component optimized for instant feedback.
 * Uses local state during dragging and commits to store on mouse up.
 */
export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  onChangeCommit,
  className,
  label,
  formatValue,
  disabled = false,
}: SliderProps) {
  const [localValue, setLocalValue] = useState(value)
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const isCommittedRef = useRef(true)

  // Sync local value when prop changes (but not during drag)
  useEffect(() => {
    if (!isDragging && localValue !== value) {
      setLocalValue(value)
    }
  }, [value, isDragging, localValue])

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const newValue = parseFloat(e.target.value)
      setLocalValue(newValue)
      isCommittedRef.current = false
      // Instant update during drag
      onChange(newValue)
    },
    [onChange]
  )

  const handleMouseDown = useCallback(() => {
    setIsDragging(true)
    isCommittedRef.current = false
  }, [])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
    if (!isCommittedRef.current && onChangeCommit) {
      onChangeCommit(localValue)
      isCommittedRef.current = true
    }
  }, [localValue, onChangeCommit])

  const handleTouchStart = useCallback(() => {
    setIsDragging(true)
    isCommittedRef.current = false
  }, [])

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false)
    if (!isCommittedRef.current && onChangeCommit) {
      onChangeCommit(localValue)
      isCommittedRef.current = true
    }
  }, [localValue, onChangeCommit])

  const displayValue = isDragging ? localValue : value
  const displayText = formatValue ? formatValue(displayValue) : displayValue.toFixed(step < 1 ? 1 : 0)

  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <div className="flex justify-between text-[10px] font-bold text-fg-subtle uppercase tracking-wider">
          <span>{label}</span>
          <span className="font-mono">{displayText}</span>
        </div>
      )}
      <input
        ref={inputRef}
        type="range"
        min={min}
        max={max}
        step={step}
        value={displayValue}
        onChange={handleChange}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        disabled={disabled}
        className={cn(
          'h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-surface-2',
          'accent-accent',
          'transition-opacity duration-150',
          'disabled:cursor-not-allowed disabled:opacity-45',
          // Webkit slider styling
          '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4',
          '[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent',
          '[&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:transition-all',
          '[&::-webkit-slider-thumb]:duration-100 [&::-webkit-slider-thumb]:hover:scale-110',
          '[&::-webkit-slider-thumb]:active:scale-95',
          // Firefox slider styling
          '[&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full',
          '[&::-moz-range-thumb]:bg-accent [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer',
          '[&::-moz-range-thumb]:shadow-sm [&::-moz-range-thumb]:transition-all [&::-moz-range-thumb]:duration-100',
          '[&::-moz-range-thumb]:hover:scale-110 [&::-moz-range-thumb]:active:scale-95',
          // Track styling
          '[&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-lg',
          '[&::-webkit-slider-runnable-track]:bg-surface-2',
          '[&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-lg [&::-moz-range-track]:bg-surface-2',
          className
        )}
      />
    </div>
  )
}
