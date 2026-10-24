import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Checkbox, Field, FormError, Input, Select, Textarea } from '@/components/ui/form'
import { compressImage } from '@/lib/compressImage'
import {
  recordEngagement, saveCredential, saveSelfEngagement, staffErrorMessage, STAFF_GROUPS, uploadCredentialFile, useStaffMutation,
  useStaffSkills, type Credential, type Engagement, type ScopeItem, type StaffScale,
} from './api'

type Form = Record<string, string>
const str = (v: unknown) => (v === null || v === undefined ? '' : String(v))
const MAX_FILE = 5 * 1024 * 1024

function scaleFields(scale: StaffScale | undefined): Form {
  return { participants: str(scale?.participants), schools: str(scale?.schools), partners: str(scale?.partners) }
}
/** Chỉ giữ các con số đã nhập trong scale */
function toScale(f: Form): StaffScale {
  const out: StaffScale = {}
  for (const k of ['participants', 'schools', 'partners'] as const) if (f[k]?.trim()) out[k] = Number(f[k])
  return out
}

/** Nhân sự tự khai việc cũ (source = self, chờ admin duyệt). Sửa nội dung thì quay lại chờ duyệt. */
export function SelfEngagementDialog({ value, onClose }: { value: Engagement | 'new' | null; onClose: () => void }) {
  const { t } = useTranslation()
  const [f, setF] = useState<Form>({})
  const editing = value && value !== 'new' ? value : null
  useEffect(() => {
    if (!value) return
    const e = value === 'new' ? null : value
    setF({
      project_name_vi: str(e?.project_name_vi), project_name_en: str(e?.project_name_en),
      position_vi: str(e?.position_vi), position_en: str(e?.position_en), staff_group: e?.staff_group ?? 'volunteer',
      started_on: str(e?.started_on), ended_on: str(e?.ended_on), hours: str(e?.hours),
      outcome_vi: str(e?.outcome_vi), outcome_en: str(e?.outcome_en), ...scaleFields(e?.scale),
    })
  }, [value])
  const save = useStaffMutation(saveSelfEngagement, { onDone: onClose })
  const set = (k: string) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }))
  const submit = () => save.mutate({
    id: editing?.id ?? null,
    data: { ...f, hours: f.hours || null, ended_on: f.ended_on || null, scale: toScale(f) },
  })
  return (
    <Dialog open={value !== null} onClose={onClose} title={editing ? t('staff.editEngagement') : t('staff.addEngagement')}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); submit() }}>
        <p className="rounded-xl bg-gold/15 p-3 text-sm">{t('staff.selfHint')}</p>
        <Field label={t('staff.f.projectNameVi')}><Input value={f.project_name_vi ?? ''} onChange={set('project_name_vi')} required /></Field>
        <Field label={t('staff.f.projectNameEn')} hint={t('staff.f.enHint')}><Input value={f.project_name_en ?? ''} onChange={set('project_name_en')} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('staff.f.positionVi')}><Input value={f.position_vi ?? ''} onChange={set('position_vi')} /></Field>
          <Field label={t('staff.f.positionEn')}><Input value={f.position_en ?? ''} onChange={set('position_en')} /></Field>
        </div>
        <Field label={t('staff.f.group')}>
          <Select value={f.staff_group ?? 'volunteer'} onChange={set('staff_group')}>
            {STAFF_GROUPS.map((g) => <option key={g} value={g}>{t(`staff.group.${g}`)}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('staff.f.startedOn')}><Input type="date" value={f.started_on ?? ''} onChange={set('started_on')} required /></Field>
          <Field label={t('staff.f.endedOn')}><Input type="date" value={f.ended_on ?? ''} onChange={set('ended_on')} min={f.started_on} /></Field>
        </div>
        <Field label={t('staff.f.hours')}><Input type="number" inputMode="decimal" min={0} step={0.5} value={f.hours ?? ''} onChange={set('hours')} /></Field>
        <ScaleInputs f={f} set={set} />
        <Field label={t('staff.f.outcomeVi')}><Textarea value={f.outcome_vi ?? ''} onChange={set('outcome_vi')} /></Field>
        <Field label={t('staff.f.outcomeEn')}><Textarea value={f.outcome_en ?? ''} onChange={set('outcome_en')} /></Field>
        <Button type="submit" size="full" disabled={save.isPending || !f.project_name_vi?.trim() || !f.started_on}>{t('common.save')}</Button>
      </form>
    </Dialog>
  )
}

function ScaleInputs({ f, set }: { f: Form; set: (k: string) => (e: { target: { value: string } }) => void }) {
  const { t } = useTranslation()
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold text-navy/80">{t('staff.f.scale')}</legend>
      <div className="grid grid-cols-3 gap-2">
        {(['participants', 'schools', 'partners'] as const).map((k) => (
          <Field key={k} label={t(`staff.scale.${k}`)}>
            <Input type="number" inputMode="numeric" min={0} value={f[k] ?? ''} onChange={set(k)} />
          </Field>
        ))}
      </div>
    </fieldset>
  )
}

/** Chứng chỉ, kinh nghiệm tự khai kèm ảnh hoặc PDF (kho riêng tư staff-files) */
export function CredentialDialog({ value, userId, onClose }: { value: Credential | 'new' | null; userId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const [f, setF] = useState<Form>({})
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const editing = value && value !== 'new' ? value : null
  useEffect(() => {
    if (!value) return
    const c = value === 'new' ? null : value
    setF({
      type: c?.type ?? 'certificate', title_vi: str(c?.title_vi), title_en: str(c?.title_en), issuer: str(c?.issuer),
      issued_on: str(c?.issued_on), expires_on: str(c?.expires_on), years: str(c?.years), file_path: str(c?.file_path),
    })
    setFile(null)
    setError(null)
  }, [value])
  const save = useStaffMutation(saveCredential, { onDone: onClose })
  const set = (k: string) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }))

  async function submit() {
    setError(null)
    setBusy(true)
    try {
      let path = f.file_path || null
      if (file) {
        if (file.type === 'application/pdf') {
          if (file.size > MAX_FILE) throw new Error('file_too_large')
          path = await uploadCredentialFile(userId, file, 'pdf')
        } else if (file.type.startsWith('image/')) {
          path = await uploadCredentialFile(userId, await compressImage(file, 1_500_000, 2000), 'jpg')
        } else {
          throw new Error('file_type')
        }
      }
      const certificate = f.type === 'certificate'
      save.mutate({
        id: editing?.id ?? null,
        data: {
          type: f.type, title_vi: f.title_vi, title_en: f.title_en, issuer: f.issuer, file_path: path,
          issued_on: f.issued_on || null, expires_on: certificate ? f.expires_on || null : null,
          years: certificate ? null : f.years || null,
        },
      })
    } catch (e) {
      const m = (e as Error).message
      setError(['file_too_large', 'file_type', 'photo_type', 'photo_too_large'].includes(m) ? t(`staff.errors.${m}`) : staffErrorMessage(e, t))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={value !== null} onClose={onClose} title={editing ? t('staff.editCredential') : t('staff.addCredential')}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); submit() }}>
        <p className="rounded-xl bg-gold/15 p-3 text-sm">{t('staff.selfHint')}</p>
        <Field label={t('staff.f.credentialType')}>
          <Select value={f.type ?? 'certificate'} onChange={set('type')}>
            <option value="certificate">{t('staff.credentialType.certificate')}</option>
            <option value="prior_experience">{t('staff.credentialType.prior_experience')}</option>
          </Select>
        </Field>
        <Field label={t('staff.f.titleVi')}><Input value={f.title_vi ?? ''} onChange={set('title_vi')} required /></Field>
        <Field label={t('staff.f.titleEn')} hint={t('staff.f.enHint')}><Input value={f.title_en ?? ''} onChange={set('title_en')} /></Field>
        <Field label={f.type === 'certificate' ? t('staff.f.issuer') : t('staff.f.workplace')}><Input value={f.issuer ?? ''} onChange={set('issuer')} /></Field>
        {f.type === 'certificate' ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('staff.f.issuedOn')}><Input type="date" value={f.issued_on ?? ''} onChange={set('issued_on')} /></Field>
            <Field label={t('staff.f.expiresOn')} hint={t('staff.f.expiresHint')}><Input type="date" value={f.expires_on ?? ''} onChange={set('expires_on')} min={f.issued_on} /></Field>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('staff.f.startedOn')}><Input type="date" value={f.issued_on ?? ''} onChange={set('issued_on')} /></Field>
            <Field label={t('staff.f.years')}><Input type="number" inputMode="decimal" min={0} step={0.5} value={f.years ?? ''} onChange={set('years')} /></Field>
          </div>
        )}
        <Field label={t('staff.f.file')} hint={f.file_path && !file ? t('staff.f.fileKept') : t('staff.f.fileHint')}>
          <Input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </Field>
        <FormError message={error} />
        <Button type="submit" size="full" disabled={busy || save.isPending || !f.title_vi?.trim()}>{t('common.save')}</Button>
      </form>
    </Dialog>
  )
}

/** S3 · Người phụ trách điền vị trí, số giờ, kỹ năng, kết quả chính. Lưu là xong, không cần duyệt. */
export function RecordDialog({ item, onClose }: { item: ScopeItem | null; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const skills = useStaffSkills()
  const [f, setF] = useState<Form>({})
  const [picked, setPicked] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (!item) return
    setF({
      position_vi: str(item.position_vi), position_en: str(item.position_en), hours: str(item.hours),
      outcome_vi: str(item.outcome_vi), outcome_en: str(item.outcome_en), ...scaleFields(item.scale),
    })
    setPicked(new Set(item.skills))
  }, [item])
  const save = useStaffMutation(recordEngagement, { onDone: onClose })
  const set = (k: string) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }))
  const organizer = item?.staff_group === 'organizer' || item?.cv_type === 'organizer'
  return (
    <Dialog open={item !== null} onClose={onClose} title={`${t('staff.record.title')} · ${item?.full_name ?? ''}`}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate({
            id: item!.id,
            data: {
              position_vi: f.position_vi, position_en: f.position_en, hours: f.hours || null,
              outcome_vi: f.outcome_vi, outcome_en: f.outcome_en, scale: toScale(f), skills: [...picked],
            },
          })
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('staff.f.positionVi')}><Input value={f.position_vi ?? ''} onChange={set('position_vi')} placeholder={t('staff.record.positionPlaceholder')} /></Field>
          <Field label={t('staff.f.positionEn')}><Input value={f.position_en ?? ''} onChange={set('position_en')} /></Field>
        </div>
        <Field label={t('staff.f.hours')}><Input type="number" inputMode="decimal" min={0} step={0.5} value={f.hours ?? ''} onChange={set('hours')} /></Field>
        <fieldset className="space-y-1">
          <legend className="text-sm font-semibold text-navy/80">{t('staff.skills')}</legend>
          <div className="grid sm:grid-cols-2">
            {skills.data?.map((s) => (
              <Checkbox
                key={s.code}
                label={i18n.language === 'en' ? s.name_en : s.name_vi}
                checked={picked.has(s.code)}
                onChange={(e) => setPicked((p) => {
                  const n = new Set(p)
                  if (e.target.checked) n.add(s.code)
                  else n.delete(s.code)
                  return n
                })}
              />
            ))}
          </div>
        </fieldset>
        {organizer && <ScaleInputs f={f} set={set} />}
        <Field label={t('staff.f.outcomeVi')} hint={organizer ? undefined : t('staff.record.outcomeHint')}><Textarea value={f.outcome_vi ?? ''} onChange={set('outcome_vi')} /></Field>
        <Field label={t('staff.f.outcomeEn')}><Textarea value={f.outcome_en ?? ''} onChange={set('outcome_en')} /></Field>
        <Button type="submit" size="full" disabled={save.isPending}>{t('common.save')}</Button>
      </form>
    </Dialog>
  )
}

/** Từ chối bắt buộc lý do (S4) */
export function RejectDialog({ open, onClose, onSubmit, busy }: { open: boolean; onClose: () => void; onSubmit: (reason: string) => void; busy: boolean }) {
  const { t } = useTranslation()
  const [reason, setReason] = useState('')
  useEffect(() => { if (open) setReason('') }, [open])
  return (
    <Dialog open={open} onClose={onClose} title={t('review.reject')}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); onSubmit(reason.trim()) }}>
        <Field label={t('staff.queue.reason')}><Textarea value={reason} onChange={(e) => setReason(e.target.value)} required /></Field>
        <Button type="submit" size="full" disabled={busy || !reason.trim()}>{t('review.reject')}</Button>
      </form>
    </Dialog>
  )
}
