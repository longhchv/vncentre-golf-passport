import { cn } from '@/lib/utils'

/**
 * Linh vật rồng — BẢN VẼ TẠM. Thay bằng file PNG gốc khi anh Long gửi (phụ lục D, D2).
 */
export function Mascot({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" role="img" aria-label="Golf Passport dragon" className={cn('h-24 w-24', className)}>
      <defs>
        <linearGradient id="mascot-body" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F9C74F" />
          <stop offset="1" stopColor="#B06829" />
        </linearGradient>
      </defs>
      {/* sừng */}
      <path d="M38 30 L32 12 L46 26 Z" fill="#6A3A16" />
      <path d="M82 30 L88 12 L74 26 Z" fill="#6A3A16" />
      {/* đầu */}
      <ellipse cx="60" cy="52" rx="34" ry="28" fill="url(#mascot-body)" />
      {/* thân */}
      <ellipse cx="60" cy="92" rx="26" ry="22" fill="url(#mascot-body)" />
      <ellipse cx="60" cy="96" rx="15" ry="14" fill="#FBE7B0" />
      {/* mắt */}
      <circle cx="47" cy="48" r="7" fill="#fff" />
      <circle cx="73" cy="48" r="7" fill="#fff" />
      <circle cx="48" cy="49" r="3.5" fill="#080634" />
      <circle cx="74" cy="49" r="3.5" fill="#080634" />
      {/* mũi, miệng */}
      <circle cx="55" cy="62" r="1.8" fill="#6A3A16" />
      <circle cx="65" cy="62" r="1.8" fill="#6A3A16" />
      <path d="M50 68 Q60 76 70 68" stroke="#6A3A16" strokeWidth="3" fill="none" strokeLinecap="round" />
      {/* gậy golf */}
      <line x1="90" y1="70" x2="104" y2="112" stroke="#080634" strokeWidth="4" strokeLinecap="round" />
      <path d="M100 110 L112 112 L110 116 L99 115 Z" fill="#080634" />
      <circle cx="84" cy="80" r="6" fill="url(#mascot-body)" />
    </svg>
  )
}
