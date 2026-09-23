import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('rounded-2xl border border-navy/10 bg-white shadow-sm', className)} {...props} />
}

export function Badge({ className, tone = 'neutral', ...props }: ComponentProps<'span'> & { tone?: 'neutral' | 'good' | 'warn' | 'bad' }) {
  const tones = {
    neutral: 'bg-navy/8 text-navy/80',
    good: 'bg-emerald-100 text-emerald-800',
    warn: 'bg-gold/30 text-brown',
    bad: 'bg-red-100 text-red-800',
  }
  return (
    <span
      className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-semibold', tones[tone], className)}
      {...props}
    />
  )
}

/** Bảng cuộn ngang trên màn hình hẹp (không để cả trang cuộn ngang). */
export function TableWrap({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('overflow-x-auto rounded-2xl border border-navy/10 bg-white', className)} {...props} />
}

export const th = 'whitespace-nowrap bg-navy/5 px-3 py-2.5 text-left text-sm font-semibold text-navy/70'
export const td = 'px-3 py-3 align-top text-base'
