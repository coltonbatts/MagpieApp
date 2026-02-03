import type { ButtonHTMLAttributes } from 'react'
import { cn } from './cn'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    'bg-accent-soft text-fg border border-border-strong shadow-sm hover:bg-accent-soft/85 active:bg-accent-soft/75',
  secondary:
    'bg-surface text-fg border border-border hover:bg-surface-2 active:bg-surface-2/80',
  ghost:
    'bg-transparent text-fg border border-transparent hover:bg-surface-2 active:bg-surface-2/80',
  danger:
    'bg-surface text-fg border border-border-strong hover:bg-surface-2 active:bg-surface-2/80',
}

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-[13px]',
  md: 'h-9 px-3.5 text-sm',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  type = 'button',
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium',
        'transition-colors duration-180 ease-standard',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        'disabled:pointer-events-none disabled:opacity-45',
        SIZE[size],
        VARIANT[variant],
        className
      )}
      {...props}
    />
  )
}
