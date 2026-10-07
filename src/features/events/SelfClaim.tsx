import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Camera, CheckCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { compressImage } from '@/lib/compressImage'
import { Button } from '@/components/ui/button'
import { FormError } from '@/components/ui/form'

/**
 * E5 · Tự xác nhận hoàn thành bằng ảnh (người không qua quầy): chụp cả mặt thẻ có 4 ô điểm,
 * nén dưới 1 MB trên máy, gửi cho Ban tổ chức duyệt. Không cần tài khoản.
 */
export function SelfClaim({ code }: { code: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [photo, setPhoto] = useState<Blob | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  const errText = (e: unknown) => {
    const c = String((e as { message?: string })?.message ?? '').split(':')[0]
    return t(`selfClaim.errors.${c}`, { defaultValue: t('errors.generic') })
  }

  async function pick(file: File | undefined) {
    if (!file) return
    setError(null)
    setBusy(true)
    try {
      const blob = await compressImage(file)
      setPhoto(blob)
      setPreview(URL.createObjectURL(blob))
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }

  async function send() {
    if (!photo) return
    setBusy(true)
    setError(null)
    const form = new FormData()
    form.append('code', code)
    form.append('photo', photo, 'card.jpg')
    const { error } = await supabase!.functions.invoke('event-claim', { body: form })
    setBusy(false)
    if (error) {
      const ctx = (error as { context?: Response }).context
      const detail = ctx ? await ctx.json().catch(() => null) : null
      return setError(errText({ message: detail?.error ?? error.message }))
    }
    setSent(true)
    qc.invalidateQueries({ queryKey: ['event_card_status', code] })
  }

  if (sent) {
    return (
      <p className="flex items-center justify-center gap-2 font-semibold text-emerald-700">
        <CheckCircle2 className="h-5 w-5" /> {t('selfClaim.sent')}
      </p>
    )
  }
  if (!open) {
    return <Button variant="outline" size="full" onClick={() => setOpen(true)}><Camera className="h-5 w-5" /> {t('selfClaim.button')}</Button>
  }
  return (
    <div className="space-y-3 text-left">
      <p className="font-semibold">{t('selfClaim.title')}</p>
      <p className="text-sm text-navy/70">{t('selfClaim.hint')}</p>
      {preview && <img src={preview} alt="" className="max-h-80 w-full rounded-xl object-contain ring-1 ring-navy/15" />}
      <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-bronze/50 px-4 font-semibold text-bronze">
        <Camera className="h-5 w-5" /> {preview ? t('selfClaim.retake') : t('selfClaim.take')}
        <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
      </label>
      <FormError message={error} />
      <Button size="full" disabled={!photo || busy} onClick={send}>{busy ? t('common.loading') : t('selfClaim.send')}</Button>
    </div>
  )
}
