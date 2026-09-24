import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ShieldCheck, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { formatDateTime } from '@/lib/i18nField'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { Checkbox, Field, FormError, Textarea } from '@/components/ui/form'
import { Mascot } from '@/components/Mascot'
import { useToast } from '@/components/ui/toast'

interface ConsentStatus {
  is_guardian: boolean
  needs_reconsent: boolean
  versions?: { terms: string; privacy: string }
  accepted?: { terms: string | null; privacy: string | null }
}

function useConsentStatus() {
  const { session, guardianId } = useAuth()
  return useQuery({
    queryKey: ['my_consent_status', session?.user.id],
    enabled: Boolean(session && guardianId),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('my_consent_status')
      if (error) throw error
      return data as ConsentStatus
    },
  })
}

/**
 * F18: khi Điều khoản hoặc Chính sách có phiên bản mới, phụ huynh phải đồng ý lại mới dùng tiếp.
 * Bọc không gian phụ huynh.
 */
export function ReconsentGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { signOut } = useAuth()
  const status = useConsentStatus()
  const [agree, setAgree] = useState(false)
  const accept = useMutation({
    mutationFn: async () => {
      const { error } = await supabase!.rpc('accept_legal')
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my_consent_status'] }),
  })
  if (!status.data?.needs_reconsent) return <>{children}</>
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-4 py-10">
      <Mascot className="mx-auto h-20 w-20" />
      <h1 className="text-center text-xl font-bold">{t('consents.updatedTitle')}</h1>
      <p className="text-navy/75">{t('consents.updatedBody')}</p>
      <p className="text-sm">
        <Link to="/terms" target="_blank" className="text-bronze underline">{t('pages.terms')}</Link>
        {' · '}
        <Link to="/privacy" target="_blank" className="text-bronze underline">{t('pages.privacy')}</Link>
      </p>
      <Checkbox label={t('activation.consent.terms')} checked={agree} onChange={(e) => setAgree(e.target.checked)} />
      <FormError message={accept.isError ? t('errors.generic') : null} />
      <Button size="full" disabled={!agree || accept.isPending} onClick={() => accept.mutate()}>{t('consents.continue')}</Button>
      <Button size="full" variant="ghost" onClick={() => signOut()}>{t('auth.signOut')}</Button>
    </div>
  )
}

interface ChildConsents {
  student_id: string
  full_name: string
  can_manage: boolean
  photo_required: boolean
  leaderboard_name: { granted: boolean; at: string } | null
  photo: { granted: boolean; at: string } | null
}

/** Tài khoản → Quản lý đồng ý (F18): phiên bản Điều khoản/Chính sách đã đồng ý; bật/tắt đồng ý tuỳ chọn cho từng con. */
export function ConsentsCard() {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()
  const status = useConsentStatus()
  const list = useQuery({
    queryKey: ['my_consents'],
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('my_consents')
      if (error) throw error
      return data as ChildConsents[]
    },
  })
  const set = useMutation({
    mutationFn: async (v: { student: string; type: 'leaderboard_name' | 'photo'; granted: boolean }) => {
      const { error } = await supabase!.rpc('set_consent', { p_student_id: v.student, p_type: v.type, p_granted: v.granted })
      if (error) throw error
    },
    onSuccess: () => { toast(t('common.saved')); qc.invalidateQueries({ queryKey: ['my_consents'] }) },
    onError: () => toast(t('errors.generic'), 'error'),
  })
  const acc = status.data?.accepted
  return (
    <Card className="space-y-4 p-4">
      <p className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-5 w-5 text-bronze" /> {t('account.consents')}</p>
      <p className="text-sm text-navy/70">
        {t('consents.acceptedVersions', { terms: acc?.terms ?? '—', privacy: acc?.privacy ?? '—' })}{' '}
        <Link to="/terms" className="text-bronze underline">{t('pages.terms')}</Link> · <Link to="/privacy" className="text-bronze underline">{t('pages.privacy')}</Link>
      </p>
      {list.data?.map((c) => (
        <div key={c.student_id} className="space-y-1 rounded-xl bg-navy/5 p-3">
          <p className="font-semibold">{c.full_name}</p>
          <Checkbox label={t('activation.consent.leaderboard')} disabled={!c.can_manage || set.isPending} checked={Boolean(c.leaderboard_name?.granted)}
            onChange={(e) => set.mutate({ student: c.student_id, type: 'leaderboard_name', granted: e.target.checked })} />
          {c.leaderboard_name && <p className="-mt-2 pl-8 text-xs text-navy/50">{formatDateTime(c.leaderboard_name.at, i18n.language)}</p>}
          {c.photo_required && (
            <>
              <Checkbox label={t('activation.consent.photo')} disabled={!c.can_manage || set.isPending} checked={Boolean(c.photo?.granted)}
                onChange={(e) => set.mutate({ student: c.student_id, type: 'photo', granted: e.target.checked })} />
              {c.photo && <p className="-mt-2 pl-8 text-xs text-navy/50">{formatDateTime(c.photo.at, i18n.language)}</p>}
            </>
          )}
          {!c.can_manage && <p className="text-xs text-navy/55">{t('guardians.viewOnlyHint')}</p>}
        </div>
      ))}
    </Card>
  )
}

/** Hồ sơ con → Thông tin: "Yêu cầu xoá dữ liệu của con" (F18) → hàng chờ admin xử lý thủ công. */
export function DataDeletionRequest({ studentId }: { studentId: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const pending = useQuery({
    queryKey: ['data_deletion_pending', studentId],
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('data_deletion_pending', { p_student_id: studentId })
      if (error) throw error
      return data as boolean
    },
  })
  const send = useMutation({
    mutationFn: async () => {
      const { error } = await supabase!.rpc('request_data_deletion', { p_student_id: studentId, p_reason: reason })
      if (error) throw error
    },
    onSuccess: () => {
      toast(t('consents.deletionSent'))
      setOpen(false)
      qc.invalidateQueries({ queryKey: ['data_deletion_pending', studentId] })
    },
    onError: () => toast(t('errors.generic'), 'error'),
  })
  return (
    <Card className="space-y-2 p-4">
      <p className="font-semibold">{t('consents.deletionTitle')}</p>
      {pending.data ? (
        <p className="text-sm text-brown">{t('consents.deletionPending')}</p>
      ) : (
        <>
          <p className="text-sm text-navy/65">{t('consents.deletionHint')}</p>
          <Button variant="ghost" size="sm" onClick={() => setOpen(true)}><Trash2 className="h-4 w-4" /> {t('consents.deletionButton')}</Button>
        </>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title={t('consents.deletionTitle')}>
        <div className="space-y-3">
          <p className="text-navy/75">{t('consents.deletionExplain')}</p>
          <Field label={t('consents.deletionReason')}><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <Button size="full" disabled={send.isPending} onClick={() => send.mutate()}>{t('consents.deletionSend')}</Button>
        </div>
      </Dialog>
    </Card>
  )
}
