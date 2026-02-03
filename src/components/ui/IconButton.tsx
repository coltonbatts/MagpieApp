import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  children: ReactNode
  label: string
  variant?: 'ghost' | 'secondary'
  size?: 'sm' | 'md'
}

export function IconButton({
  children,
  label,
  variant = 'ghost',
  size = 'md',
  className,
  type = 'button',
  disabled,
  ...props
}: IconButtonProps) {
  const sizeClass = size === 'sm' ? 'h-8 w-8' : 'h-9 w-9'
  const variantClass =
    variant === 'secondary'
      ? 'bg-surface text-fg border border-border hover:bg-surface-2 active:bg-surface-2/80'
      : 'bg-transparent text-fg border border-transparent hover:bg-surface-2 active:bg-surface-2/80'

  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center rounded-md',
        'transition-colors duration-180 ease-standard',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        'disabled:pointer-events-none disabled:opacity-45',
        sizeClass,
        variantClass,
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}

