import { useCallback, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Camera, Keyboard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, FormError, Input } from '@/components/ui/form'
import { Mascot } from '@/components/Mascot'
import { checkCode, normalizeCode } from '@/lib/codes'
import { QrScanner } from '@/features/passports/QrScanner'

type Mode = 'scan' | 'type'

/**
 * /activate — Kích hoạt Golf Passport: quét QR trên sổ ngay trong app (khi đã cài app lên màn hình,
 * phụ huynh không cần mở ứng dụng Camera riêng) hoặc gõ mã 8 ký tự.
 * QR trên chứng nhận giấy (/c/…) cũng được nhận ở đây (luồng F4: Bước 10).
 */
export function ActivatePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('scan')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [scanKey, setScanKey] = useState(0)

  function goPassport(raw: string) {
    const c = checkCode(raw, 'passport')
    if (!c.ok) {
      setError(c.reason === 'invalid_chars' ? t('codes.invalidChars') : t('codes.wrongLength'))
      return false
    }
    navigate(`/p/${c.code}`)
    return true
  }

  const onScan = useCallback(
    (_code: string, rawText: string) => {
      setError(null)
      const claim = rawText.match(/\/c\/([^/?#\s]+)/i)
      if (claim) {
        navigate(`/c/${normalizeCode(decodeURIComponent(claim[1]))}`)
        return
      }
      const passport = rawText.match(/\/p\/([^/?#\s]+)/i)
      const ok = goPassport(passport ? decodeURIComponent(passport[1]) : rawText)
      if (!ok) {
        setError(t('activation.notPassportQr'))
        setScanKey((k) => k + 1) // bật lại camera để quét mã khác
      }
    },
    [navigate, t], // eslint-disable-line react-hooks/exhaustive-deps
  )

  function submit(e: FormEvent) {
    e.preventDefault()
    goPassport(code)
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4">
      <Mascot className="h-20 w-20" />
      <h1 className="text-2xl font-bold">{t('pages.activate')}</h1>

      <div className="grid w-full grid-cols-2 gap-1 rounded-xl bg-navy/5 p-1" role="tablist">
        {(['scan', 'type'] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => {
              setMode(m)
              setError(null)
            }}
            className={`flex min-h-11 items-center justify-center gap-2 rounded-lg text-sm font-semibold ${mode === m ? 'bg-white shadow-sm' : 'text-navy/60'}`}
          >
            {m === 'scan' ? <Camera className="h-4 w-4" /> : <Keyboard className="h-4 w-4" />}
            {t(`activation.mode.${m}`)}
          </button>
        ))}
      </div>

      {mode === 'scan' ? (
        <div className="w-full space-y-3">
          <QrScanner key={scanKey} onCode={onScan} hint={t('activation.scanHint')} />
          <FormError message={error} />
          <button type="button" className="w-full text-center text-sm font-semibold text-bronze" onClick={() => setMode('type')}>
            {t('activation.cannotScan')}
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="w-full space-y-4">
          <p className="text-center text-navy/75">{t('activation.manualHint')}</p>
          <Field label={t('passports.code')} hint={t('codes.hint')}>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="XXXX-XXXX"
              autoCapitalize="characters"
              autoComplete="off"
              className="text-center font-mono text-2xl tracking-widest"
            />
          </Field>
          <FormError message={error} />
          <Button type="submit" size="full" disabled={!code.trim()}>
            {t('activation.next')}
          </Button>
        </form>
      )}
    </div>
  )
}
