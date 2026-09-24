import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Camera } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox, Field, FormError, Input, Select } from '@/components/ui/form'
import { useToast } from '@/components/ui/toast'
import { GOLF_GOALS } from '@/lib/types'
import type { StudentProfile } from './useStudentProfile'
import { Avatar } from './StudentProfileView'

/** Thu nhỏ ảnh trên máy trước khi tải lên (tối đa 600px, JPEG) — nhẹ trên 4G, dưới giới hạn 2 MB. */
export async function resizeImage(file: File, max = 600): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('resize'))), 'image/jpeg', 0.85))
}

/** Thông tin (F8): phụ huynh có quyền quản lý sửa ngày sinh, giới tính, ảnh, mục tiêu golf. */
export function ChildInfoForm({ profile }: { profile: StudentProfile }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()
  const s = profile.student
  const [dob, setDob] = useState(s.date_of_birth ?? '')
  const [gender, setGender] = useState<string>(s.gender ?? '')
  const [goals, setGoals] = useState<string[]>(s.golf_goals ?? [])
  const [goalsOther, setGoalsOther] = useState(s.golf_goals_other ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const readOnly = !profile.can_manage

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['student_profile', s.id] })
    qc.invalidateQueries({ queryKey: ['my_children'] })
  }

  async function save(patch: Record<string, unknown>) {
    const { error: e } = await supabase!.rpc('update_child_info', { p_student_id: s.id, p_data: patch })
    if (e) throw e
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await save({ date_of_birth: dob, gender, golf_goals: goals, golf_goals_other: goals.includes('other') ? goalsOther : '' })
      refresh()
      toast(t('common.saved'))
    } catch {
      setError(t('errors.generic'))
    } finally {
      setBusy(false)
    }
  }

  async function onPhoto(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const blob = await resizeImage(file)
      const path = `${s.id}/${Date.now()}.jpg`
      const { error: ue } = await supabase!.storage.from('student-photos').upload(path, blob, { contentType: 'image/jpeg' })
      if (ue) throw ue
      await save({ avatar_path: path })
      refresh()
      toast(t('profile.photoUpdated'))
    } catch {
      setError(t('profile.photoFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="space-y-4 p-4">
      {readOnly && <p className="rounded-xl bg-navy/5 p-3 text-sm text-navy/70">{t('profile.readOnlyGuardian')}</p>}
      <div className="flex items-center gap-4">
        <Avatar path={s.avatar_path} className="h-24 w-24" />
        {!readOnly && (
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border-2 border-navy/20 bg-white px-4 font-semibold">
            <Camera className="h-5 w-5" /> {t('profile.changePhoto')}
            <input type="file" accept="image/*" className="sr-only" disabled={busy} onChange={(e) => onPhoto(e.target.files?.[0])} />
          </label>
        )}
      </div>
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label={t('fields.dateOfBirth')}>
          <Input type="date" value={dob} disabled={readOnly} onChange={(e) => setDob(e.target.value)} />
        </Field>
        <Field label={t('fields.gender')}>
          <Select value={gender} disabled={readOnly} onChange={(e) => setGender(e.target.value)}>
            <option value="">—</option>
            {['male', 'female', 'other'].map((g) => (
              <option key={g} value={g}>{t(`gender.${g}`)}</option>
            ))}
          </Select>
        </Field>
        <fieldset className="space-y-1">
          <legend className="text-sm font-semibold text-navy/80">{t('fields.golfGoals')}</legend>
          {GOLF_GOALS.map((g) => (
            <Checkbox
              key={g}
              label={t(`golfGoals.${g}`)}
              disabled={readOnly}
              checked={goals.includes(g)}
              onChange={(e) => setGoals(e.target.checked ? [...goals, g] : goals.filter((x) => x !== g))}
            />
          ))}
        </fieldset>
        {goals.includes('other') && (
          <Field label={t('fields.golfGoalsOther')}>
            <Input value={goalsOther} disabled={readOnly} onChange={(e) => setGoalsOther(e.target.value)} />
          </Field>
        )}
        <FormError message={error} />
        {!readOnly && (
          <Button type="submit" size="full" disabled={busy}>
            {busy ? t('common.loading') : t('common.save')}
          </Button>
        )}
      </form>
    </Card>
  )
}
