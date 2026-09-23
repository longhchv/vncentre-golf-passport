import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Tone = 'success' | 'error'
interface ToastItem {
  id: number
  message: string
  tone: Tone
}

const ToastContext = createContext<(message: string, tone?: Tone) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const show = useCallback((message: string, tone: Tone = 'success') => {
    const id = Date.now() + Math.random()
    setItems((prev) => [...prev, { id, message, tone }])
    setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== id)), 4000)
  }, [])

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 px-4"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
        role="status"
        aria-live="polite"
      >
        {items.map((i) => (
          <div
            key={i.id}
            className={cn(
              'pointer-events-auto w-full max-w-md rounded-xl px-4 py-3 text-base font-medium shadow-lg',
              i.tone === 'success' ? 'bg-navy text-white' : 'bg-red-700 text-white',
            )}
          >
            {i.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
