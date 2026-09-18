'use client'

import { type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">{title}</h1>
        {description ? <p className="mt-1 text-sm text-[var(--muted)]">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function Card({
  children,
  className,
  title,
  action,
}: {
  children: ReactNode
  className?: string
  title?: string
  action?: ReactNode
}) {
  return (
    <section className={cn('rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-sm', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
          {title ? <h2 className="text-sm font-semibold text-[var(--foreground)]">{title}</h2> : <span />}
          {action}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  )
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
}) {
  const variants = {
    primary: 'bg-[var(--primary)] text-[var(--primary-fg)] hover:bg-[var(--primary-hover)]',
    secondary: 'bg-[var(--card)] text-[var(--foreground)] border border-[var(--border)] hover:bg-[var(--gold-soft)]',
    ghost: 'bg-transparent text-[var(--muted)] hover:bg-[var(--gold-soft)] hover:text-[var(--foreground)]',
    danger: 'bg-[var(--danger)] text-white hover:bg-red-700',
  }
  const sizes = {
    sm: 'h-8 px-3 text-xs',
    md: 'h-10 px-4 text-sm',
  }
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  )
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--foreground)] outline-none transition placeholder:text-neutral-400 focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/25',
        className
      )}
      {...props}
    />
  )
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'min-h-24 w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--foreground)] outline-none transition placeholder:text-slate-400 focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20',
        className
      )}
      {...props}
    />
  )
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'h-10 w-full rounded-lg border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20',
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
}

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
      {children}
    </label>
  )
}

export function Field({
  label,
  children,
  className,
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <Label>{label}</Label>
      {children}
    </div>
  )
}

export function Badge({
  children,
  tone = 'slate',
}: {
  children: ReactNode
  tone?: 'slate' | 'teal' | 'amber' | 'red' | 'green' | 'blue'
}) {
  const tones = {
    slate: 'bg-neutral-100 text-neutral-700',
    teal: 'bg-[var(--gold-soft)] text-[#8a7018]',
    amber: 'bg-amber-50 text-amber-900',
    red: 'bg-red-50 text-red-700',
    green: 'bg-emerald-50 text-emerald-800',
    blue: 'bg-neutral-900 text-[var(--primary)]',
  }
  return (
    <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium', tones[tone])}>
      {children}
    </span>
  )
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-[var(--border)] px-4 py-10 text-center">
      <p className="text-sm font-medium text-[var(--foreground)]">{title}</p>
      {description ? <p className="mt-1 text-sm text-[var(--muted)]">{description}</p> : null}
    </div>
  )
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-[var(--muted)]">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-[var(--primary)]" />
      {label}
    </div>
  )
}

export function ErrorBanner({ message }: { message?: string | null }) {
  if (!message) return null
  return (
    <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{message}</div>
  )
}

export function Modal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean
  title: string
  children: ReactNode
  onClose: () => void
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
      <button className="absolute inset-0 cursor-default" aria-label="Close" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-xl border border-[var(--border)] bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <h3 className="text-base font-semibold">{title}</h3>
          <Button variant="ghost" size="sm" onClick={onClose} type="button">
            Close
          </Button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}

export function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card className="!p-0">
      <div className="p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">{label}</p>
        <p className="mt-2 text-3xl font-semibold text-[var(--foreground)]">{value}</p>
        {hint ? <p className="mt-1 text-xs text-[var(--muted)]">{hint}</p> : null}
      </div>
    </Card>
  )
}

export function priorityTone(priority?: string): 'slate' | 'amber' | 'red' | 'teal' {
  switch (priority) {
    case 'URGENT':
      return 'red'
    case 'HIGH':
      return 'amber'
    case 'LOW':
      return 'slate'
    default:
      return 'teal'
  }
}

export function statusTone(status?: string): 'slate' | 'teal' | 'amber' | 'red' | 'green' | 'blue' {
  if (!status) return 'slate'
  if (['OVERDUE', 'LOST', 'REJECTED', 'CANCELLED', 'CLOSED'].includes(status)) return 'red'
  if (['COMPLETED', 'RESOLVED', 'WON', 'CONVERTED'].includes(status)) return 'green'
  if (['IN_PROGRESS', 'ASSIGNED', 'SCHEDULED', 'OPEN', 'NEW'].includes(status)) return 'teal'
  if (['WAITING_CUSTOMER', 'WAITING_INTERNAL', 'NEEDS_CLARIFICATION', 'ON_HOLD'].includes(status)) return 'amber'
  return 'blue'
}
