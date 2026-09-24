import { cn } from '@/lib/utils'

/** Linh vật rồng của Golf Passport (file gốc: tai-san-chung-nhan/linh-vat-rong.png, thu nhỏ thành webp). */
export function Mascot({ className }: { className?: string }) {
  return (
    <img
      src="/mascot-256.webp"
      srcSet="/mascot-256.webp 1x, /mascot-512.webp 2x"
      alt=""
      aria-hidden
      draggable={false}
      className={cn('h-24 w-24 object-contain', className)}
    />
  )
}
