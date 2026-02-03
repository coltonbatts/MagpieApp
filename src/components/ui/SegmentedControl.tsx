import { cn } from './cn'

export interface SegmentedOption<TValue extends string> {
  value: TValue
  label: string
  disabled?: boolean
}

export interface SegmentedControlProps<TValue extends string> {
  value: TValue
  onValueChange: (value: TValue) => void
  options: Array<SegmentedOption<TValue>>
  className?: string
  ariaLabel?: string
}

export function SegmentedControl<TValue extends string>({
  value,
  onValueChange,
  options,
  className,
  ariaLabel = 'Segmented control',
}: SegmentedControlProps<TValue>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center rounded-md border border-border bg-surface-2 p-0.5',
        className
      )}
    >
      {options.map((option) => {
        const isActive = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            disabled={option.disabled}
            onClick={() => onValueChange(option.value)}
            className={cn(
              'relative inline-flex h-8 items-center justify-center rounded-[10px] px-3 text-[13px] font-medium',
              'transition-colors duration-180 ease-standard',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
              'disabled:pointer-events-none disabled:opacity-45',
              isActive
                ? 'border border-border bg-surface text-fg shadow-sm'
                : 'border border-transparent text-fg-muted hover:bg-surface/60 hover:text-fg'
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
