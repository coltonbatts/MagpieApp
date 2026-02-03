import type { InputHTMLAttributes } from 'react'
import { cn } from './cn'

type InputVariant = 'field' | 'slider' | 'checkbox'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  variant?: InputVariant
}

const VARIANT: Record<InputVariant, string> = {
  field: cn(
    'h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-fg',
    'placeholder:text-fg-subtle'
  ),
  slider:
    'h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-surface-2 accent-accent',
  checkbox:
    'h-4 w-4 rounded border border-border bg-surface text-accent accent-accent',
}

export function Input({
  className,
  type = 'text',
  variant = 'field',
  ...props
}: InputProps) {
  return (
    <input
      type={type}
      className={cn(
        VARIANT[variant],
        'transition-colors duration-180 ease-standard',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        'disabled:cursor-not-allowed disabled:opacity-45',
        className
      )}
      {...props}
    />
  )
}
