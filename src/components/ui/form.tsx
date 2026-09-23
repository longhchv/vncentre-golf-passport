import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'

const control =
  'w-full rounded-xl border border-navy/20 bg-white px-3 py-2.5 text-base text-navy placeholder:text-navy/40 ' +
  'focus:border-bronze focus:outline-none focus:ring-2 focus:ring-gold/50 disabled:bg-navy/5'

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(control, 'min-h-12', className)} {...props} />
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(control, 'min-h-24', className)} {...props} />
}

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select className={cn(control, 'min-h-12 pr-8', className)} {...props} />
}

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string
  hint?: string
  error?: string | null
  children: ReactNode
  className?: string
}) {
  return (
    <label className={cn('flex flex-col gap-1.5', className)}>
      <span className="text-sm font-semibold text-navy/80">{label}</span>
      {children}
      {hint && !error && <span className="text-sm text-navy/55">{hint}</span>}
      {error && <span className="text-sm font-medium text-red-700">{error}</span>}
    </label>
  )
}

export function Checkbox({ label, className, ...props }: ComponentProps<'input'> & { label: string }) {
  return (
    <label className={cn('flex min-h-12 items-center gap-3', className)}>
      <input type="checkbox" className="h-5 w-5 shrink-0 accent-bronze" {...props} />
      <span className="text-base">{label}</span>
    </label>
  )
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null
  return <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{message}</p>
}
