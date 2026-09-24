import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { normalizeCode } from '@/lib/codes'

/** Lấy mã sổ từ nội dung QR: URL …/p/{mã} hoặc chính mã. */
export function codeFromQr(text: string): string {
  const m = text.match(/\/p\/([^/?#\s]+)/i)
  return normalizeCode(m ? decodeURIComponent(m[1]) : text)
}

/**
 * Quét QR bằng camera sau của điện thoại (@zxing/browser). Cần HTTPS.
 * Gọi onCode một lần với mã đã chuẩn hoá rồi tự tắt camera.
 */
export function QrScanner({ onCode, hint }: { onCode: (code: string, rawText: string) => void; hint?: string }) {
  const { t } = useTranslation()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const done = useRef(false)

  useEffect(() => {
    let controls: { stop: () => void } | undefined
    let cancelled = false
    ;(async () => {
      try {
        const { BrowserQRCodeReader } = await import('@zxing/browser')
        const reader = new BrowserQRCodeReader()
        controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' } } },
          videoRef.current!,
          (result) => {
            if (result && !done.current) {
              done.current = true
              controls?.stop()
              if (navigator.vibrate) navigator.vibrate(60)
              onCode(codeFromQr(result.getText()), result.getText())
            }
          },
        )
        if (cancelled) controls.stop()
      } catch (e) {
        const name = (e as Error)?.name
        setError(name === 'NotAllowedError' ? t('scanner.denied') : name === 'NotFoundError' ? t('scanner.noCamera') : t('scanner.failed'))
      }
    })()
    return () => {
      cancelled = true
      controls?.stop()
    }
  }, [onCode, t])

  return (
    <div className="space-y-2">
      <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-navy">
        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
        <div className="pointer-events-none absolute inset-[18%] rounded-2xl border-4 border-gold/80" />
      </div>
      <p className={error ? 'text-sm font-medium text-red-700' : 'text-sm text-navy/60'}>{error ?? hint ?? t('scanner.hint')}</p>
    </div>
  )
}
