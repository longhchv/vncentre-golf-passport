import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from '@/components/ui/slot'
import { cn } from '@/lib/utils'
import type { ComponentProps } from 'react'

const buttonVariants = cva(
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 text-base font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        // Nút chính: vàng đồng → vàng sáng (00 mục 10)
        primary: 'bg-linear-to-r from-bronze to-gold text-navy shadow-sm hover:brightness-105 active:brightness-95',
        outline: 'border-2 border-navy/20 bg-white text-navy hover:bg-navy/5',
        ghost: 'text-navy hover:bg-navy/5',
      },
      size: {
        md: '',
        sm: 'min-h-10 px-3 text-sm',
        full: 'w-full',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

type ButtonProps = ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }

export function Button({ className, variant, size, asChild, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button'
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />
}
