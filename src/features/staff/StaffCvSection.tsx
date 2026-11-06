import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Ban, Download, ExternalLink, FileDown } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { invokeFunction } from '@/lib/functions'
import { formatDateTime } from '@/lib/i18nField'
import { formatVerifyCode as formatCode } from '../../../supabase/functions/_shared/certificateLayout'
import { Button } from '@/components/ui/button'
import { Badge, Card } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { Checkbox, Field, FormError, Input } from '@/components/ui/form'
import { useToast } from '@/components/ui/toast'
import { staffErrorMessage, type StaffProfileData } from './api'

type MissingEn = { entity: 'engagement' | 'credential'; id: string; field: 'project_name' | 'position' | 'outcome' | 'title'; vi: string; context: string | null }
type CvExport = { id: string; verify_code: string; cv_type: string; lang: 'vi' | 'en'; exported_at: string; status: 'valid' | 'revoked' }

const cvKeys = { list: (u?: string) => ['staff_cv_list', u ?? 'me'] as const }

function cvError(e: unknown, t: (k: string) => string) {
  const m = (e as Error)?.message ?? ''
  for (const code of ['no_cv_type', 'missing_en', 'revoked']) if (m.startsWith(code)) return t(`staff.cv.errors.${code}`)
  return staffErrorMessage(e, t)
}

/** S5 · Xuất CV và các bản đã xuất (tải lại trong 24 giờ, thu hồi). userId: admin xuất / thu hồi cho người khác */
export function StaffCvSection({ data, userId }: { data: StaffProfileData; userId?: string }) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const list = useQuery({
    queryKey: cvKeys.list(userId),
    queryFn: async () => {
      const { data: rows, error } = await supabase!.rpc('staff_cv_list', { p_user_id: userId ?? null })
      if (error) throw error
      return rows as CvExport[]
    },
  })
  const get = useMutation({
    mutationFn: (id: string) => invokeFunction<{ url: string }>('staff-cv', { action: 'download', id }),
    onSuccess: (r) => { window.location.href = r.url },
    onError: (e) => toast(cvError(e, t), 'error'),
  })
  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase!.rpc('staff_cv_revoke', { p_id: id })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff_cv_list'] })
      toast(t('staff.cv.revoked'))
    },
    onError: (e) => toast(cvError(e, t), 'error'),
  })
  const canExport = Boolean(data.profile.cv_type)

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold">{t('staff.cv.title')}</h2>
        <Button size="sm" disabled={!canExport} onClick={() => setOpen(true)}>
          <FileDown className="h-4 w-4" /> {t('staff.cv.export')}
        </Button>
      </div>
      {!canExport && <p className="text-sm text-navy/60">{t('staff.cv.needCvType')}</p>}
      {list.data && list.data.length > 0 && (
        <ul className="space-y-2">
          {list.data.map((x) => (
            <li key={x.id}>
              <Card className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {t(`staff.cvType.${x.cv_type}`)} · {x.lang === 'en' ? 'English' : 'Tiếng Việt'}
                  </p>
                  <p className="text-sm text-navy/60">
                    {formatDateTime(x.exported_at, i18n.language)} · <span className="font-mono">{formatCode(x.verify_code)}</span>
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  {x.status === 'revoked' && <Badge tone="bad">{t('staff.cv.revokedBadge')}</Badge>}
                  <Button asChild size="sm" variant="ghost" aria-label={t('staff.cv.verifyPage')}>
                    <Link to={`/verify/${x.verify_code}`}><ExternalLink className="h-4 w-4" /></Link>
                  </Button>
                  {x.status === 'valid' && (
                    <>
                      <Button size="sm" variant="ghost" aria-label={t('staff.cv.download')} disabled={get.isPending} onClick={() => get.mutate(x.id)}>
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" aria-label={t('staff.cv.revoke')}
                        onClick={() => window.confirm(t('staff.cv.confirmRevoke')) && revoke.mutate(x.id)}>
                        <Ban className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <ExportDialog open={open} onClose={() => setOpen(false)} data={data} userId={userId} />
    </section>
  )
}

function ExportDialog({ open, onClose, data, userId }: { open: boolean; onClose: () => void; data: StaffProfileData; userId?: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [lang, setLang] = useState<'vi' | 'en'>('vi')
  const [contact, setContact] = useState(data.profile.show_contact_on_cv)
  const [en, setEn] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ url: string; verify_code: string } | null>(null)
  useEffect(() => {
    if (open) { setLang('vi'); setContact(data.profile.show_contact_on_cv); setEn({}); setError(null); setResult(null) }
  }, [open, data.profile.show_contact_on_cv])

  // Tiếng Anh: liệt kê các dòng còn thiếu chữ EN để chủ hồ sơ tự nhập (app không dịch, D49)
  const missing = useQuery({
    queryKey: ['staff_cv_missing_en', userId ?? 'me'],
    enabled: open && lang === 'en',
    staleTime: 0,
    queryFn: async () => {
      const { data: rows, error: e } = await supabase!.rpc('staff_cv_missing_en', { p_user_id: userId ?? null })
      if (e) throw e
      return rows as MissingEn[]
    },
  })
  const key = (m: MissingEn) => `${m.entity}:${m.id}:${m.field}`
  const saveEn = useMutation({
    mutationFn: async () => {
      for (const m of missing.data ?? []) {
        const v = en[key(m)]?.trim()
        if (!v) continue
        const { error: e } = await supabase!.rpc('staff_set_en_text', { p_entity: m.entity, p_id: m.id, p_data: { [`${m.field}_en`]: v } })
        if (e) throw e
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff_cv_missing_en'] })
      qc.invalidateQueries({ queryKey: ['staff_profile'] })
    },
    onError: (e) => setError(cvError(e, t)),
  })
  const doExport = useMutation({
    mutationFn: () => invokeFunction<{ url: string; verify_code: string }>('staff-cv', {
      action: 'export', lang, show_contact: contact, user_id: userId ?? null,
    }),
    onSuccess: (r) => {
      setResult(r)
      qc.invalidateQueries({ queryKey: ['staff_cv_list'] })
    },
    onError: (e) => setError(cvError(e, t)),
  })
  const blocked = lang === 'en' && (missing.isPending || (missing.data?.length ?? 0) > 0)
  const ownOwner = !userId

  return (
    <Dialog open={open} onClose={onClose} title={t('staff.cv.export')}>
      {result ? (
        <div className="space-y-4 text-center">
          <p className="text-lg font-bold">{t('staff.cv.ready')}</p>
          <p className="text-navy/65">{t('staff.cv.readyHint')}</p>
          <Button asChild size="full"><a href={result.url}><Download className="h-4 w-4" /> {t('staff.cv.download')}</a></Button>
          <p className="text-sm text-navy/60">{t('staff.cv.codeLine', { code: formatCode(result.verify_code) })}</p>
        </div>
      ) : (
        <div className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-navy/80">{t('staff.cv.language')}</legend>
            <div className="grid grid-cols-2 gap-2">
              {(['vi', 'en'] as const).map((l) => (
                <Button key={l} type="button" variant={lang === l ? 'primary' : 'outline'} onClick={() => setLang(l)}>
                  {l === 'vi' ? 'Tiếng Việt' : 'English'}
                </Button>
              ))}
            </div>
          </fieldset>

          {lang === 'en' && (missing.data?.length ?? 0) > 0 && (
            <div className="space-y-3 rounded-xl bg-gold/15 p-3">
              <p className="text-sm font-semibold">{t('staff.cv.missingEn', { count: missing.data!.length })}</p>
              {missing.data!.map((m) => (
                <Field key={key(m)} label={`${t(`staff.cv.field.${m.field}`)}${m.context && m.field !== 'project_name' ? ` · ${m.context}` : ''}`} hint={m.vi}>
                  <Input value={en[key(m)] ?? ''} onChange={(e) => setEn((p) => ({ ...p, [key(m)]: e.target.value }))}
                    disabled={!ownOwner} />
                </Field>
              ))}
              {ownOwner ? (
                <Button type="button" size="sm" disabled={saveEn.isPending || !Object.values(en).some((v) => v.trim())} onClick={() => saveEn.mutate()}>
                  {t('staff.cv.saveEn')}
                </Button>
              ) : (
                <p className="text-sm text-navy/65">{t('staff.cv.ownerMustEnter')}</p>
              )}
            </div>
          )}

          <Checkbox label={t('staff.cv.showContact')} checked={contact} onChange={(e) => setContact(e.target.checked)} />
          <p className="-mt-2 text-sm text-navy/60">{t('staff.cv.showContactHint')}</p>
          <p className="text-sm text-navy/65">{t('staff.cv.snapshotHint')}</p>
          <FormError message={error} />
          <Button size="full" disabled={blocked || doExport.isPending} onClick={() => { setError(null); doExport.mutate() }}>
            <FileDown className="h-4 w-4" /> {doExport.isPending ? t('staff.cv.exporting') : t('staff.cv.export')}
          </Button>
        </div>
      )}
    </Dialog>
  )
}
