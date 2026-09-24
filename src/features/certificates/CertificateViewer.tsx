import { lazy, Suspense, useState } from 'react'
import { Link } from 'react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Download, Share2, ZoomIn, ZoomOut } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { invokeFunction } from '@/lib/functions'
import { formatDate, useLocalized } from '@/lib/i18nField'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { FormError } from '@/components/ui/form'
import { useToast } from '@/components/ui/toast'
import type { CertificateData } from '../../../supabase/functions/_shared/certificateLayout'

// Font chứng nhận chỉ tải khi mở chứng nhận
const CertificateSvg = lazy(() => import('./CertificateSvg').then((m) => ({ default: m.CertificateSvg })))

export interface CertificateViewData {
  id: string
  student_id: string
  type: string
  status: 'valid' | 'revoked'
  title_vi: string | null
  title_en: string | null
  issued_at: string
  verify_code: string
  data: CertificateData
  revoked_at: string | null
  revoked_reason: string | null
  viewer: 'guardian' | 'student' | 'staff'
  needs_email: boolean
  can_download: boolean
}

export function certificateErrorText(t: (k: string, o?: Record<string, unknown>) => string, e: unknown) {
  const code = String((e as { message?: string })?.message ?? '')
  return t(`certificates.errors.${code}`, { defaultValue: t('errors.generic') })
}

/** Tải PDF: máy chủ tạo (lần đầu) rồi trả link có hạn; trình duyệt tải về. */
export function useDownloadCertificate() {
  return useMutation({
    mutationFn: async (id: string) => {
      const r = await invokeFunction<{ url: string }>('certificates', { action: 'pdf', certificate_id: id })
      window.location.assign(r.url)
    },
  })
}

export function CertificateStage({ data }: { data: CertificateData }) {
  const [zoom, setZoom] = useState(false)
  const { t } = useTranslation()
  return (
    <div className="space-y-2">
      <div className="overflow-auto rounded-xl shadow-md ring-1 ring-navy/10">
        <div style={{ width: zoom ? '220%' : '100%' }}>
          <Suspense fallback={<div className="aspect-[1.414] animate-pulse bg-navy/5" />}>
            <CertificateSvg data={data} />
          </Suspense>
        </div>
      </div>
      <button type="button" onClick={() => setZoom((z) => !z)} className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-bronze">
        {zoom ? <ZoomOut className="h-4 w-4" /> : <ZoomIn className="h-4 w-4" />} {zoom ? t('certificates.zoomOut') : t('certificates.zoomIn')}
      </button>
    </div>
  )
}

/** Xem một chứng nhận: hình chứng nhận, tải PDF (phụ huynh có email / nhân viên), chia sẻ link xác thực. */
export function CertificateViewer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const loc = useLocalized()
  const toast = useToast()
  const q = useQuery({
    queryKey: ['certificate_view', id],
    enabled: Boolean(id),
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('certificate_view', { p_id: id })
      if (error) throw error
      return data as CertificateViewData
    },
  })
  const download = useDownloadCertificate()
  const c = q.data

  async function share() {
    if (!c) return
    const url = c.data.verify_url
    try {
      if (navigator.share) await navigator.share({ title: loc(c, 'title') ?? '', url })
      else {
        await navigator.clipboard.writeText(url)
        toast(t('common.copied'))
      }
    } catch {
      /* người dùng huỷ chia sẻ */
    }
  }

  return (
    <Dialog open={id !== null} onClose={onClose} title={c ? (loc(c, 'title') ?? t('profile.tab.certificates')) : t('profile.tab.certificates')}>
      {q.isPending ? (
        <p className="text-navy/60">{t('common.loading')}</p>
      ) : q.isError ? (
        <FormError message={certificateErrorText(t, q.error)} />
      ) : c ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm text-navy/65">
            <span>{formatDate(c.issued_at, i18n.language)}</span>
            <span>·</span>
            <span className="font-mono">{c.data.verify_code}</span>
            {c.status === 'revoked' && <Badge tone="bad">{t('certificates.revoked')}</Badge>}
          </div>
          <CertificateStage data={c.data} />
          {c.status === 'revoked' && c.revoked_reason && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{c.revoked_reason}</p>}
          <div className="grid gap-2 sm:grid-cols-2">
            {c.can_download && (
              <Button size="full" disabled={download.isPending} onClick={() => download.mutate(c.id)}>
                <Download className="h-5 w-5" /> {download.isPending ? t('certificates.preparing') : t('certificates.downloadPdf')}
              </Button>
            )}
            {c.status === 'valid' && (
              <Button size="full" variant="outline" onClick={share}>
                <Share2 className="h-5 w-5" /> {t('certificates.shareVerify')}
              </Button>
            )}
          </div>
          {c.needs_email && (
            <div className="space-y-2 rounded-xl bg-gold/15 p-3 text-sm text-brown">
              <p>{t('certificates.needEmail')}</p>
              <Button asChild size="sm" variant="outline"><Link to="/account">{t('account.addEmail')}</Link></Button>
            </div>
          )}
          {c.viewer === 'student' && <p className="text-sm text-navy/60">{t('certificates.studentNoDownload')}</p>}
          <FormError message={download.isError ? certificateErrorText(t, download.error) : null} />
        </div>
      ) : null}
    </Dialog>
  )
}
