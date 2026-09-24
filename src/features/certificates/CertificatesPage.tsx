import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Eye, FileDown, Search, Upload } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { errorMessage, useTable } from '@/lib/db'
import { invokeFunction } from '@/lib/functions'
import { formatDate, useLocalized } from '@/lib/i18nField'
import { Button } from '@/components/ui/button'
import { Badge, Card } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { Field, FormError, Input, Select, Textarea } from '@/components/ui/form'
import { useToast } from '@/components/ui/toast'
import { Mascot } from '@/components/Mascot'
import type { ClassRow, Level, Program, RosterRow } from '@/lib/types'
import type { CertificateData } from '../../../supabase/functions/_shared/certificateLayout'
import { CertificateViewer } from './CertificateViewer'

const CertificateSvg = lazy(() => import('./CertificateSvg').then((m) => ({ default: m.CertificateSvg })))

interface Template {
  id: string
  code: string
  name_vi: string
  name_en: string
  type: 'summer_camp' | 'course_completion' | 'level_completion' | 'tournament'
  background_image_url: string | null
  signer_name: string | null
  signer_title: string | null
  signature_image_url: string | null
  is_active: boolean
}

type Tab = 'issue' | 'issued' | 'templates'

/** Chứng nhận (F9) — admin: phát hành, danh sách, mẫu; HLV trưởng: phát hành, danh sách. */
export function CertificatesPage() {
  const { t } = useTranslation()
  const { hasRole } = useAuth()
  const isAdmin = hasRole('admin')
  const tabs: Tab[] = isAdmin ? ['issue', 'issued', 'templates'] : ['issue', 'issued']
  const [tab, setTab] = useState<Tab>('issue')
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">{t('admin.nav.certificates')}</h1>
      <div className="flex flex-wrap gap-2">
        {tabs.map((k) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={`min-h-10 rounded-full px-4 text-sm font-semibold ${tab === k ? 'bg-navy text-white' : 'bg-white text-navy/70 ring-1 ring-navy/15'}`}>
            {t(`certificates.tab.${k}`)}
          </button>
        ))}
      </div>
      {tab === 'issue' && <IssueTab onIssued={() => setTab('issued')} />}
      {tab === 'issued' && <IssuedTab canRevoke={isAdmin} />}
      {tab === 'templates' && <TemplatesTab />}
    </div>
  )
}

//------------------------------------------------------------------------------ Phát hành

interface PreviewItem { student_id: string; full_name: string; status: 'ok' | 'no_level' | 'duplicate'; data: CertificateData }

function IssueTab({ onIssued }: { onIssued: () => void }) {
  const { t } = useTranslation()
  const loc = useLocalized()
  const qc = useQueryClient()
  const toast = useToast()
  const classes = useTable<ClassRow>('classes', { order: 'name' })
  const programs = useTable<Program>('programs', { order: 'code' })
  const levels = useTable<Level>('levels', { order: 'number' })
  const templates = useTable<Template>('certificate_templates', { order: 'code' })
  const [classId, setClassId] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [templateId, setTemplateId] = useState('')
  const [program, setProgram] = useState('')
  const [levelId, setLevelId] = useState('')
  const [issuedAt, setIssuedAt] = useState(new Date().toISOString().slice(0, 10))
  const [language, setLanguage] = useState<'en' | 'bilingual'>('en')
  const [preview, setPreview] = useState<PreviewItem[] | null>(null)
  const [result, setResult] = useState<{ issued: number; skipped: number; emails: number } | null>(null)

  const activeClasses = (classes.data ?? []).filter((c) => !c.deleted_at && c.status !== 'archived')
  const cls = activeClasses.find((c) => c.id === classId)
  const tpl = templates.data?.find((x) => x.id === templateId)
  const classLevels = (levels.data ?? []).filter((l) => l.program_id === cls?.program_id)

  const roster = useQuery({
    queryKey: ['class_roster', classId],
    enabled: Boolean(classId),
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('class_roster', { p_class_id: classId })
      if (error) throw error
      return (data as RosterRow[]).filter((r) => r.enrollment_status !== 'dropped')
    },
  })
  // Chọn lớp → chọn sẵn cả lớp, gợi ý tên chương trình
  useEffect(() => {
    setSelected(new Set((roster.data ?? []).map((r) => r.student_id)))
  }, [roster.data])
  useEffect(() => {
    const p = programs.data?.find((x) => x.id === cls?.program_id)
    if (p) setProgram(p.name_en)
    setLevelId(cls?.target_level_id ?? '')
    setPreview(null)
  }, [cls, programs.data])
  useEffect(() => { setPreview(null) }, [templateId, program, levelId, issuedAt, language, selected])

  const payload = { program: program.trim(), level_id: levelId || null, issued_at: issuedAt, language }
  const ids = [...selected]

  const runPreview = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase!.rpc('certificate_issue_preview', { p_template_id: templateId, p_student_ids: ids, p_data: payload })
      if (error) throw error
      return data as PreviewItem[]
    },
    onSuccess: setPreview,
  })
  const pdfSample = useMutation({
    mutationFn: async () => {
      const ok = preview?.find((p) => p.status === 'ok')
      const { data, error } = await supabase!.functions.invoke('certificates', {
        body: { action: 'preview_pdf', template_id: templateId, student_ids: [ok?.student_id ?? ids[0]], data: payload },
      })
      if (error) throw error
      const url = URL.createObjectURL(new Blob([data as Blob], { type: 'application/pdf' }))
      const a = document.createElement('a')
      a.href = url
      a.target = '_blank'
      a.rel = 'noopener'
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    },
    onError: (e) => toast(errorMessage(e, t), 'error'),
  })
  const issue = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase!.rpc('certificate_issue', { p_template_id: templateId, p_student_ids: ids, p_data: payload, p_class_id: classId || null })
      if (error) throw error
      const r = data as { issued: number; certificate_ids: string[]; skipped: unknown[] }
      let emails = 0
      // Email báo phụ huynh (gửi theo nhóm; lỗi email không làm hỏng việc phát hành)
      for (let i = 0; i < r.certificate_ids.length; i += 100) {
        try {
          const e = await invokeFunction<{ sent: number }>('certificates', { action: 'notify_email', certificate_ids: r.certificate_ids.slice(i, i + 100) })
          emails += e.sent
        } catch { /* bỏ qua */ }
      }
      return { issued: r.issued, skipped: r.skipped.length, emails }
    },
    onSuccess: (r) => {
      setResult(r)
      setPreview(null)
      qc.invalidateQueries({ queryKey: ['admin_certificates'] })
    },
    onError: (e) => toast(errorMessage(e, t), 'error'),
  })

  const okItems = preview?.filter((p) => p.status === 'ok') ?? []
  const skipped = preview?.filter((p) => p.status !== 'ok') ?? []
  const needLevel = tpl?.type === 'level_completion'
  const canPreview = templateId && ids.length > 0 && program.trim() && (!needLevel || levelId)

  if (result) {
    return (
      <Card className="flex flex-col items-center gap-3 p-6 text-center">
        <Mascot className="h-20 w-20" />
        <p className="text-xl font-bold">{t('certificates.issuedN', { count: result.issued })}</p>
        {result.skipped > 0 && <p className="text-navy/65">{t('certificates.skippedN', { count: result.skipped })}</p>}
        <p className="text-navy/65">{t('certificates.emailsSent', { count: result.emails })}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={() => setResult(null)} variant="outline">{t('certificates.issueMore')}</Button>
          <Button onClick={onIssued}>{t('certificates.tab.issued')}</Button>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4">
        <p className="font-semibold">1. {t('certificates.chooseStudents')}</p>
        <Field label={t('fields.className')}>
          <Select value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">—</option>
            {activeClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        {roster.data && (
          <div className="space-y-1">
            <label className="flex min-h-10 items-center gap-2 text-sm font-semibold">
              <input type="checkbox" className="h-5 w-5 accent-bronze" checked={selected.size === roster.data.length && roster.data.length > 0}
                onChange={(e) => setSelected(e.target.checked ? new Set(roster.data!.map((r) => r.student_id)) : new Set())} />
              {t('review.selectAll')} ({selected.size}/{roster.data.length})
            </label>
            <ul className="max-h-72 space-y-1 overflow-y-auto rounded-xl bg-navy/5 p-2">
              {roster.data.map((r) => (
                <li key={r.student_id}>
                  <label className="flex min-h-10 items-center gap-2">
                    <input type="checkbox" className="h-5 w-5 accent-bronze" checked={selected.has(r.student_id)}
                      onChange={() => setSelected((s) => { const n = new Set(s); if (n.has(r.student_id)) n.delete(r.student_id); else n.add(r.student_id); return n })} />
                    <span>{r.full_name}</span>
                    <span className="text-sm text-navy/55">{[r.current_grade_class, r.level_number ? `L${r.level_number}` : null].filter(Boolean).join(' · ')}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <Card className="space-y-3 p-4">
        <p className="font-semibold">2. {t('certificates.details')}</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {templates.data?.filter((x) => x.is_active && x.type !== 'tournament').map((x) => (
            <Button key={x.id} type="button" variant={templateId === x.id ? 'primary' : 'outline'} onClick={() => setTemplateId(x.id)}>
              {loc(x, 'name')}
            </Button>
          ))}
        </div>
        <Field label={t('certificates.program') + ' *'} hint={t('certificates.programHint')}>
          <Input value={program} onChange={(e) => setProgram(e.target.value)} />
        </Field>
        <Field label={t('fields.level') + (needLevel ? ' *' : '')} hint={needLevel ? t('certificates.levelHint') : undefined}>
          <Select value={levelId} onChange={(e) => setLevelId(e.target.value)}>
            <option value="">—</option>
            {classLevels.map((l) => <option key={l.id} value={l.id}>{loc(l, 'name')}</option>)}
          </Select>
        </Field>
        <Field label={t('certificates.issuedAt')}>
          <Input type="date" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          {(['en', 'bilingual'] as const).map((l) => (
            <Button key={l} type="button" variant={language === l ? 'primary' : 'outline'} onClick={() => setLanguage(l)}>
              {t(`certificates.language.${l}`)}
            </Button>
          ))}
        </div>
        <FormError message={runPreview.isError ? errorMessage(runPreview.error, t) : null} />
        <Button size="full" disabled={!canPreview || runPreview.isPending} onClick={() => runPreview.mutate()}>
          <Eye className="h-5 w-5" /> {t('certificates.preview')}
        </Button>
      </Card>

      {preview && (
        <Card className="space-y-4 p-4">
          <p className="font-semibold">3. {t('certificates.confirm')}</p>
          <p>{t('certificates.willIssue', { count: okItems.length })}</p>
          {skipped.length > 0 && (
            <div className="rounded-xl bg-gold/15 p-3 text-sm text-brown">
              <p className="font-semibold">{t('certificates.skippedN', { count: skipped.length })}</p>
              <ul className="list-disc pl-5">
                {skipped.map((s) => <li key={s.student_id}>{s.full_name} — {t(`certificates.skip.${s.status}`)}</li>)}
              </ul>
            </div>
          )}
          {okItems.slice(0, 3).map((p) => (
            <div key={p.student_id} className="overflow-hidden rounded-xl shadow ring-1 ring-navy/10">
              <Suspense fallback={<div className="aspect-[1.414] animate-pulse bg-navy/5" />}>
                <CertificateSvg data={p.data} />
              </Suspense>
            </div>
          ))}
          <div className="grid gap-2 sm:grid-cols-2">
            <Button variant="outline" size="full" disabled={pdfSample.isPending || !okItems.length} onClick={() => pdfSample.mutate()}>
              <FileDown className="h-5 w-5" /> {pdfSample.isPending ? t('certificates.preparing') : t('certificates.samplePdf')}
            </Button>
            <Button size="full" disabled={!okItems.length || issue.isPending}
              onClick={() => window.confirm(t('certificates.confirmIssue', { count: okItems.length })) && issue.mutate()}>
              {issue.isPending ? t('common.loading') : t('certificates.issueN', { count: okItems.length })}
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}

//------------------------------------------------------------------------------ Đã phát hành

interface IssuedRow {
  id: string
  student_name: string
  student_code: string
  class_name: string | null
  title_vi: string
  title_en: string
  status: 'valid' | 'revoked'
  issued_at: string
  verify_code: string
  revoked_reason: string | null
}

function IssuedTab({ canRevoke }: { canRevoke: boolean }) {
  const { t, i18n } = useTranslation()
  const loc = useLocalized()
  const qc = useQueryClient()
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [term, setTerm] = useState('')
  const [status, setStatus] = useState('')
  const [viewing, setViewing] = useState<string | null>(null)
  const [revoking, setRevoking] = useState<IssuedRow | null>(null)
  const [reason, setReason] = useState('')
  const list = useQuery({
    queryKey: ['admin_certificates', term, status],
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('admin_certificates', { p_search: term || null, p_status: status || null, p_limit: 200 })
      if (error) throw error
      return data as IssuedRow[]
    },
  })
  const revoke = useMutation({
    mutationFn: async () => {
      const { error } = await supabase!.rpc('revoke_certificate', { p_id: revoking!.id, p_reason: reason.trim() })
      if (error) throw error
    },
    onSuccess: () => {
      toast(t('certificates.revokedDone'))
      setRevoking(null)
      setReason('')
      qc.invalidateQueries({ queryKey: ['admin_certificates'] })
    },
    onError: (e) => toast(errorMessage(e, t), 'error'),
  })

  return (
    <div className="space-y-3">
      <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); setTerm(search.trim()) }}>
        <Input className="min-w-0 flex-1" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('certificates.searchHint')} />
        <Select className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">{t('common.all')}</option>
          <option value="valid">{t('certificates.valid')}</option>
          <option value="revoked">{t('certificates.revoked')}</option>
        </Select>
        <Button type="submit" variant="outline"><Search className="h-4 w-4" /></Button>
      </form>
      {list.data?.length === 0 && <p className="text-navy/60">{t('common.empty')}</p>}
      <ul className="space-y-2">
        {list.data?.map((c) => (
          <li key={c.id}>
            <Card className="space-y-2 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">{c.student_name} <span className="text-sm font-normal text-navy/55">{c.student_code}</span></p>
                  <p className="text-sm text-navy/70">{loc(c, 'title')}</p>
                  <p className="text-sm text-navy/55">{[c.class_name, formatDate(c.issued_at, i18n.language)].filter(Boolean).join(' · ')} · <span className="font-mono">{c.verify_code}</span></p>
                  {c.revoked_reason && <p className="text-sm text-red-700">{c.revoked_reason}</p>}
                </div>
                <Badge tone={c.status === 'valid' ? 'good' : 'bad'}>{t(`certificates.${c.status}`)}</Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setViewing(c.id)}><Eye className="h-4 w-4" /> {t('certificates.view')}</Button>
                {canRevoke && c.status === 'valid' && (
                  <Button size="sm" variant="ghost" onClick={() => setRevoking(c)}>{t('certificates.revoke')}</Button>
                )}
              </div>
            </Card>
          </li>
        ))}
      </ul>
      <CertificateViewer id={viewing} onClose={() => setViewing(null)} />
      <Dialog open={revoking !== null} onClose={() => setRevoking(null)} title={t('certificates.revoke')}>
        <div className="space-y-3">
          <p>{revoking?.student_name} — {revoking && loc(revoking, 'title')}</p>
          <p className="rounded-xl bg-gold/15 p-3 text-sm text-brown">{t('certificates.revokeHint')}</p>
          <Field label={t('review.reason') + ' *'}>
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <Button size="full" disabled={!reason.trim() || revoke.isPending} onClick={() => revoke.mutate()}>{t('certificates.confirmRevoke')}</Button>
        </div>
      </Dialog>
    </div>
  )
}

//------------------------------------------------------------------------------ Mẫu

const BG_RATIO = 3500 / 2475

function readImageSize(file: File) {
  return new Promise<{ w: number; h: number }>((resolve, reject) => {
    const img = new Image()
    img.onload = () => { resolve({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(img.src) }
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}

/** Vẽ lại ảnh qua canvas: thu nhỏ về maxWidth và đổi định dạng. */
async function reencode(file: File, maxWidth: number, type: 'image/jpeg' | 'image/png', quality?: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxWidth / bitmap.width)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')!
  if (type === 'image/jpeg') {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode_failed'))), type, quality))
}

function TemplatesTab() {
  const templates = useTable<Template>('certificate_templates', { order: 'code' })
  return (
    <div className="space-y-4">
      {templates.data?.filter((x) => x.type !== 'tournament').map((x) => <TemplateCard key={x.id} tpl={x} />)}
    </div>
  )
}

function TemplateCard({ tpl }: { tpl: Template }) {
  const { t } = useTranslation()
  const loc = useLocalized()
  const qc = useQueryClient()
  const toast = useToast()
  const [signerName, setSignerName] = useState(tpl.signer_name ?? '')
  const [signerTitle, setSignerTitle] = useState(tpl.signer_title ?? '')
  const [error, setError] = useState<string | null>(null)

  const sample: CertificateData = useMemo(() => ({
    student_name: 'Nguyễn Văn An', class_name: '3A', school_name: 'Trường Tiểu học Mẫu', program: 'SNAG Golf @ School Basic',
    level_label: tpl.type === 'level_completion' ? 'Level 1' : null, language: 'en', signer_name: signerName, signer_title: signerTitle,
    verify_code: 'SAMPLE0000', verify_url: `${window.location.origin}/verify`, background_path: tpl.background_image_url, signature_path: tpl.signature_image_url,
  }), [tpl, signerName, signerTitle])

  const save = useMutation({
    mutationFn: async (patch: Partial<Template>) => {
      const { error: e } = await supabase!.from('certificate_templates').update(patch).eq('id', tpl.id)
      if (e) throw e
    },
    onSuccess: () => { toast(t('common.saved')); qc.invalidateQueries({ queryKey: ['certificate_templates'] }) },
    onError: (e) => toast(errorMessage(e, t), 'error'),
  })

  async function upload(kind: 'background' | 'signature', file: File | undefined) {
    if (!file) return
    setError(null)
    if (!['image/png', 'image/jpeg'].includes(file.type)) return setError(t('certificates.errors.imageType'))
    const max = kind === 'background' ? 10 : 5
    if (file.size > max * 1024 * 1024) return setError(t('certificates.errors.imageTooBig', { mb: max }))
    if (kind === 'background') {
      const { w, h } = await readImageSize(file)
      if (Math.abs(w / h - BG_RATIO) > 0.03 || w < 2000) return setError(t('certificates.errors.backgroundSize'))
    }
    // Nền → JPEG (máy chủ nhúng thẳng vào PDF, nhẹ CPU); chữ ký → PNG rộng tối đa 1000 px (giữ nền trong suốt)
    const blob = kind === 'background' ? await reencode(file, 3500, 'image/jpeg', 0.9) : await reencode(file, 1000, 'image/png')
    const ext = kind === 'background' ? 'jpg' : 'png'
    const path = kind === 'background' ? `templates/${tpl.id}/${Date.now()}.${ext}` : `signatures/${tpl.id}-${Date.now()}.${ext}`
    const { error: e } = await supabase!.storage.from('certificate-assets').upload(path, blob, { contentType: blob.type })
    if (e) return setError(errorMessage(e, t))
    save.mutate(kind === 'background' ? { background_image_url: path } : { signature_image_url: path })
  }

  return (
    <Card className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-lg font-bold">{loc(tpl, 'name')}</p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-5 w-5 accent-bronze" checked={tpl.is_active} onChange={(e) => save.mutate({ is_active: e.target.checked })} />
          {t('common.active')}
        </label>
      </div>
      <div className="overflow-hidden rounded-xl shadow ring-1 ring-navy/10">
        <Suspense fallback={<div className="aspect-[1.414] animate-pulse bg-navy/5" />}>
          <CertificateSvg data={sample} />
        </Suspense>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-navy/20 bg-white px-4 font-semibold">
          <Upload className="h-4 w-4" /> {t('certificates.uploadBackground')}
          <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => upload('background', e.target.files?.[0])} />
        </label>
        <label className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-navy/20 bg-white px-4 font-semibold">
          <Upload className="h-4 w-4" /> {t('certificates.uploadSignature')}
          <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => upload('signature', e.target.files?.[0])} />
        </label>
      </div>
      <p className="text-sm text-navy/55">{t('certificates.uploadHint')}</p>
      <FormError message={error} />
      <Field label={t('certificates.signerName')}>
        <Input value={signerName} onChange={(e) => setSignerName(e.target.value)} />
      </Field>
      <Field label={t('certificates.signerTitle')} hint={t('certificates.signerTitleHint')}>
        <Textarea rows={2} value={signerTitle} onChange={(e) => setSignerTitle(e.target.value)} />
      </Field>
      <Button disabled={save.isPending} onClick={() => save.mutate({ signer_name: signerName.trim(), signer_title: signerTitle.trim() })}>
        {t('common.save')}
      </Button>
    </Card>
  )
}
