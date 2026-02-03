import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from './cn'

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'inset'
  elevated?: boolean
  title?: ReactNode
  description?: ReactNode
}

export function Panel({
  variant = 'default',
  elevated = false,
  title,
  description,
  className,
  children,
  ...props
}: PanelProps) {
  return (
    <section
      className={cn(
        'rounded-lg border border-border',
        variant === 'inset' ? 'bg-surface-2' : 'bg-surface',
        elevated ? 'shadow-sm' : '',
        className
      )}
      {...props}
    >
      {(title || description) && (
        <header className="px-4 pt-4">
          {title && (
            <div className="text-sm font-medium text-fg">{title}</div>
          )}
          {description && (
            <div className="mt-0.5 text-xs text-fg-muted">{description}</div>
          )}
        </header>
      )}
      <div className={cn('px-4', title || description ? 'pb-4 pt-3' : 'py-4')}>
        {children}
      </div>
    </section>
  )
}

