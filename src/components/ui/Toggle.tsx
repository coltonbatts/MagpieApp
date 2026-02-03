import type { HTMLAttributes } from 'react'
import { cn } from './cn'

export interface ToggleProps
  extends Omit<HTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
}

export function Toggle({
  checked,
  onCheckedChange,
  disabled,
  className,
  ...props
}: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-10 items-center rounded-full border border-border',
        'transition-colors duration-180 ease-standard',
        checked ? 'bg-accent-soft border-border-strong' : 'bg-surface-2',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        'disabled:pointer-events-none disabled:opacity-45',
        className
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          'inline-block h-4 w-4 rounded-full border bg-surface shadow-sm',
          'transition-transform duration-180 ease-standard',
          checked ? 'translate-x-5 border-border-strong' : 'translate-x-1 border-border'
        )}
      />
    </button>
  )
}
