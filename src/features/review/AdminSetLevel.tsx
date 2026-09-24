import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/db'
import { useAuth } from '@/auth/AuthProvider'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, Input, Select } from '@/components/ui/form'
import { useToast } from '@/components/ui/toast'
import { useStudentProfile } from '@/features/profile/useStudentProfile'

/** Admin sửa level trực tiếp (F12): bắt buộc lý do, ghi nhật ký. */
export function AdminSetLevel({ studentId }: { studentId: string }) {
  const { t } = useTranslation()
  const { hasRole } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const profile = useStudentProfile(studentId)
  const [open, setOpen] = useState(false)
  const [level, setLevel] = useState('')
  const [reason, setReason] = useState('')

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase!.rpc('admin_set_level', { p_student_id: studentId, p_level_number: Number(level), p_reason: reason })
      if (error) throw error
    },
    onSuccess: () => {
      toast(t('common.saved'))
      setOpen(false)
      setReason('')
      qc.invalidateQueries({ queryKey: ['student_profile', studentId] })
      qc.invalidateQueries({ queryKey: ['admin_search_students'] })
    },
    onError: (e) => toast(errorMessage(e, t), 'error'),
  })

  const current = profile.data?.level?.number
  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm text-navy/60">{t('parent.currentLevel')}</p>
          <p className="text-2xl font-bold">Level {current ?? '…'}</p>
        </div>
        {hasRole('admin') && !open && (
          <Button size="sm" variant="outline" onClick={() => { setLevel(String(current ?? 1)); setOpen(true) }}>
            {t('review.editLevel')}
          </Button>
        )}
      </div>
      {open && (
        <div className="space-y-3">
          <Field label={t('review.newLevel')}>
            <Select value={level} onChange={(e) => setLevel(e.target.value)}>
              {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>Level {n}</option>
              ))}
            </Select>
          </Field>
          <Field label={t('review.reason') + ' *'}>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <p className="text-sm text-navy/60">{t('review.editLevelHint')}</p>
          <div className="flex gap-2">
            <Button size="sm" disabled={!reason.trim() || save.isPending} onClick={() => save.mutate()}>{t('common.save')}</Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
          </div>
        </div>
      )}
    </Card>
  )
}
