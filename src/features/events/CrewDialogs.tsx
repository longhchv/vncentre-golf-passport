import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { formatCode } from '@/lib/codes'
import { Button } from '@/components/ui/button'
import { Field, FormError, Input, Select } from '@/components/ui/form'
import { Dialog } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { useCrewDepartments } from './CrewAdmin'

const rpc = async <T,>(fn: string, args: Record<string, unknown>) => {
  const { data, error } = await supabase!.rpc(fn, args)
  if (error) throw error
  return data as T
}

interface Result {
  status: 'ok' | 'error' | 'suspect'; error?: string; taken_by?: string; reason?: string
  student_code?: string | null; passport_code?: string | null; slot_code?: string | null
  candidates?: { student_id: string; student_code: string; full_name: string }[]
}

/** Thêm từng người: Họ tên, Bộ phận, Vị trí, SĐT hoặc email, Năm sinh (tuỳ chọn). Cùng quy tắc ghép người như khi dán danh sách. */
export function AddPersonDialog({ eventId, onClose }: { eventId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const depts = useCrewDepartments()
  const [name, setName] = useState('')
  const [dept, setDept] = useState('')
  const [position, setPosition] = useState('')
  const [contact, setContact] = useState('')
  const [year, setYear] = useState('')
  const [suspect, setSuspect] = useState<Result | null>(null)
  const [decision, setDecision] = useState('')
  const [error, setError] = useState<string | null>(null)

  const row = (d: string) => [{ line: 1, full_name: name, department: dept, position, contact, birth_year: year, decision: d }]
  const run = useMutation({
    mutationFn: async () => {
      // Xem trước (ghép người, nghi trùng) rồi mới ghi
      if (!suspect) {
        const [p] = await rpc<Result[]>('crew_import', { p_event_id: eventId, p_rows: row('auto'), p_commit: false })
        if (p.status !== 'ok') return p
      }
      const [r] = await rpc<Result[]>('crew_import', { p_event_id: eventId, p_rows: row(suspect ? decision : 'auto'), p_commit: true })
      return r
    },
    onSuccess: (r) => {
      setError(null)
      if (r.status === 'suspect') { setSuspect(r); return }
      if (r.status === 'error') { setError(t(`crew.error.${r.error}`, { name: r.taken_by })); return }
      toast(t('crewBoard.personAdded', { name, code: r.passport_code ? formatCode(r.passport_code) : '' }))
      onClose()
    },
    onError: (e) => setError((e as Error).message),
  })

  return (
    <Dialog open onClose={onClose} title={t('crewBoard.addPerson')}>
      <div className="space-y-3">
        <Field label={t('crew.name') + ' *'}><Input value={name} onChange={(e) => { setName(e.target.value); setSuspect(null) }} autoComplete="off" /></Field>
        <Field label={t('crew.department') + ' *'}>
          <Select value={dept} onChange={(e) => setDept(e.target.value)}>
            <option value="" />
            {depts.data?.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </Select>
        </Field>
        <Field label={t('crewBoard.position')} hint={t('crewBoard.positionHint')}><Input value={position} onChange={(e) => setPosition(e.target.value)} /></Field>
        <Field label={t('crewBoard.contact') + ' *'} hint={t('crewBoard.contactHint')}>
          <Input value={contact} onChange={(e) => { setContact(e.target.value); setSuspect(null) }} inputMode="email" autoComplete="off" />
        </Field>
        <Field label={t('crewBoard.birthYear')} hint={t('crewBoard.birthYearHint')}>
          <Input value={year} inputMode="numeric" onChange={(e) => setYear(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))} className="w-28" />
        </Field>
        {suspect && (
          <div className="space-y-2 rounded-xl bg-amber-50 p-3 text-sm">
            <p className="text-amber-800">{t(`crew.suspect.${suspect.reason}`)}</p>
            <Select value={decision} onChange={(e) => setDecision(e.target.value)}>
              <option value="">{t('crewBoard.chooseOne')}</option>
              {suspect.candidates?.map((c) => <option key={c.student_id} value={c.student_id}>{t('crew.useExisting', { name: c.full_name, code: c.student_code })}</option>)}
              <option value="new">{t('crew.createNew')}</option>
            </Select>
          </div>
        )}
        <FormError message={error} />
        <Button size="full" disabled={!name.trim() || !dept || !contact.trim() || run.isPending || (!!suspect && !decision)} onClick={() => run.mutate()}>
          {run.isPending ? t('common.loading') : t('common.add')}
        </Button>
      </div>
    </Dialog>
  )
}

/** Thêm bộ phận mới với tên tự đặt; việc của bộ phận thêm bằng "Thêm việc cho cả bộ phận". */
export function AddDepartmentDialog({ eventId, onClose }: { eventId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()
  const [name, setName] = useState('')
  const [label, setLabel] = useState('')
  const [color, setColor] = useState('#5B6475')
  const add = useMutation({
    mutationFn: () => rpc<{ role_code: string; label: string }>('crew_add_department', { p_event_id: eventId, p_name: name, p_badge_label: label || null, p_color: color }),
    onSuccess: (r) => {
      toast(t('crewBoard.departmentAdded', { name: r.label }))
      qc.invalidateQueries({ queryKey: ['crew_departments'] })
      onClose()
    },
  })
  return (
    <Dialog open onClose={onClose} title={t('crewBoard.addDepartment')}>
      <div className="space-y-3">
        <Field label={t('crewBoard.departmentName') + ' *'}><Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('crewBoard.departmentNamePlaceholder')} /></Field>
        <Field label={t('crewBoard.badgeLabel')} hint={t('crewBoard.badgeLabelHint')}><Input value={label} onChange={(e) => setLabel(e.target.value)} /></Field>
        <Field label={t('crewBoard.badgeColor')}>
          <div className="flex items-center gap-2">
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-11 w-16 rounded-lg border border-navy/15" aria-label={t('crewBoard.badgeColor')} />
            <span className="font-mono text-sm">{color}</span>
          </div>
        </Field>
        <p className="text-sm text-navy/60">{t('crewBoard.departmentTasksHint')}</p>
        <FormError message={add.isError ? t(`crewBoard.errors.${(add.error as Error).message}`, { defaultValue: (add.error as Error).message }) : null} />
        <Button size="full" disabled={!name.trim() || add.isPending} onClick={() => add.mutate()}>{t('common.add')}</Button>
      </div>
    </Dialog>
  )
}
