import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/** Hộp thoại dùng thẻ <dialog> gốc của trình duyệt; trên điện thoại hiện toàn màn hình. */
export function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const { t } = useTranslation()

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      className="m-0 h-dvh max-h-dvh w-full max-w-full bg-cream p-0 text-navy backdrop:bg-navy/50 sm:m-auto sm:h-auto sm:max-h-[90dvh] sm:max-w-2xl sm:rounded-2xl"
    >
      {open && (
        <div className="flex h-full flex-col">
          <div
            className="sticky top-0 flex items-center justify-between gap-3 border-b border-navy/10 bg-white px-4 py-3"
            style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top, 0px))' }}
          >
            <h2 className="text-lg font-bold">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.close')}
              className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-navy/5"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div
            className="flex-1 overflow-y-auto p-4"
            style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
          >
            {children}
          </div>
        </div>
      )}
    </dialog>
  )
}
