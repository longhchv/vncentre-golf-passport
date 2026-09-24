import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { KeyRound, Lock, Trash2, Unlock, UserPlus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { invokeFunction } from '@/lib/functions'
import { formatDateTime } from '@/lib/i18nField'
import { Button } from '@/components/ui/button'
import { Badge, Card } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { Field, FormError, Input } from '@/components/ui/form'
import { useToast } from '@/components/ui/toast'
import type { StudentProfile } from '@/features/profile/useStudentProfile'

const RELATIONSHIPS = ['mother', 'father', 'guardian', 'other'] as const

/** Lỗi từ CSDL/Edge Function (mã) → câu song ngữ trong guardians.errors. */
function useErrorText() {
  const { t } = useTranslation()
  return (e: unknown) => {
    const code = String((e as { message?: string })?.message ?? '')
    return t(`guardians.errors.${code}`, { defaultValue: t('errors.generic') })
  }
}

/**
 * Hồ sơ con → Người giám hộ (F6, F7): danh sách người giám hộ; người có quyền quản lý mời thêm, bật/tắt quyền,
 * gỡ người khác (không gỡ được người giám hộ chính cuối cùng); tạo/đổi tài khoản học viên cho con.
 */
export function GuardiansTab({ profile }: { profile: StudentProfile }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()
  const errText = useErrorText()
  const [inviting, setInviting] = useState(false)
  const manage = Boolean(profile.can_manage)
  const refresh = () => qc.invalidateQueries({ queryKey: ['student_profile', profile.student.id] })

  const toggle = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      const { error } = await supabase!.rpc('set_guardian_can_manage', { p_link_id: id, p_value: value })
      if (error) throw error
    },
    onSuccess: () => { toast(t('common.saved')); refresh() },
    onError: (e) => toast(errText(e), 'error'),
  })
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase!.rpc('remove_guardian_link', { p_link_id: id })
      if (error) throw error
    },
    onSuccess: () => { toast(t('guardians.removed')); refresh() },
    onError: (e) => toast(errText(e), 'error'),
  })

  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {(profile.guardians ?? []).map((g) => (
          <li key={g.link_id}>
            <Card className="space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">
                    {g.name || '—'} {g.is_me && <span className="text-sm text-navy/55">({t('profile.you')})</span>}
                  </p>
                  <p className="text-sm text-navy/60">{g.relationship ? t(`relationship.${g.relationship}`) : ''}</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {g.is_primary && <Badge>{t('students.primary')}</Badge>}
                  {g.can_manage ? <Badge tone="good">{t('profile.canManage')}</Badge> : <Badge>{t('guardians.viewOnly')}</Badge>}
                  {!g.has_account && <Badge>{t('students.noAccount')}</Badge>}
                  {g.status === 'pending_confirmation' && <Badge tone="warn">{t('students.pendingConfirmation')}</Badge>}
                </div>
              </div>
              {manage && !g.is_me && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={toggle.isPending}
                    onClick={() => toggle.mutate({ id: g.link_id, value: !g.can_manage })}>
                    {g.can_manage ? t('guardians.revokeManage') : t('guardians.grantManage')}
                  </Button>
                  <Button size="sm" variant="ghost" disabled={remove.isPending}
                    onClick={() => window.confirm(t('guardians.confirmRemove', { name: g.name ?? '' })) && remove.mutate(g.link_id)}>
                    <Trash2 className="h-4 w-4" /> {t('guardians.remove')}
                  </Button>
                </div>
              )}
            </Card>
          </li>
        ))}
      </ul>

      {manage ? (
        <>
          <Button size="full" variant="outline" onClick={() => setInviting(true)}>
            <UserPlus className="h-5 w-5" /> {t('guardians.invite')}
          </Button>
          <InviteGuardianDialog studentId={profile.student.id} open={inviting} onClose={() => setInviting(false)} />
          <StudentAccountCard studentId={profile.student.id} />
        </>
      ) : (
        <p className="rounded-xl bg-navy/5 p-3 text-sm text-navy/65">{t('guardians.viewOnlyHint')}</p>
      )}
    </div>
  )
}

function InviteGuardianDialog({ studentId, open, onClose }: { studentId: string; open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const errText = useErrorText()
  const [target, setTarget] = useState('')
  const [relationship, setRelationship] = useState<string>('father')
  const [sent, setSent] = useState(false)
  const send = useMutation({
    mutationFn: () => {
      const raw = target.trim()
      // SĐT Việt Nam: 09xx… → +849xx…
      const normalized = raw.includes('@') ? raw : raw.replace(/[\s.-]/g, '').replace(/^0/, '+84').replace(/^84/, '+84')
      return invokeFunction('send-invitations', { purpose: 'second_guardian', student_id: studentId, target: normalized, relationship })
    },
    onSuccess: () => setSent(true),
  })
  const close = () => { setSent(false); setTarget(''); send.reset(); onClose() }

  return (
    <Dialog open={open} onClose={close} title={t('guardians.invite')}>
      {sent ? (
        <div className="space-y-3">
          <p>{t('guardians.inviteSent')}</p>
          <Button size="full" onClick={close}>{t('common.close')}</Button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-navy/70">{t('guardians.inviteHint')}</p>
          <Field label={t('guardians.inviteTarget')}>
            <Input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="0912 345 678 / email@..." autoComplete="off" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            {RELATIONSHIPS.map((r) => (
              <Button key={r} type="button" variant={relationship === r ? 'primary' : 'outline'} onClick={() => setRelationship(r)}>
                {t(`relationship.${r}`)}
              </Button>
            ))}
          </div>
          <FormError message={send.isError ? errText(send.error) : null} />
          <Button size="full" disabled={!target.trim() || send.isPending} onClick={() => send.mutate()}>
            {send.isPending ? t('common.loading') : t('guardians.sendInvite')}
          </Button>
        </div>
      )}
    </Dialog>
  )
}

interface AccountInfo {
  exists: boolean
  username: string | null
  is_active: boolean | null
  locked_until: string | null
  date_of_birth: string | null
  age: number | null
  min_age: number
  can_manage: boolean
}

/** Tài khoản học viên (F7): tên đăng nhập + PIN 6 số; chỉ cho con từ min_age tuổi (R14). */
function StudentAccountCard({ studentId }: { studentId: string }) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()
  const errText = useErrorText()
  const [dialog, setDialog] = useState<'create' | 'pin' | null>(null)
  const info = useQuery({
    queryKey: ['student_account_info', studentId],
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('student_account_info', { p_student_id: studentId })
      if (error) throw error
      return data as AccountInfo
    },
  })
  const setActive = useMutation({
    mutationFn: (active: boolean) => invokeFunction('student-accounts', { action: 'set_active', student_id: studentId, active }),
    onSuccess: () => { toast(t('common.saved')); qc.invalidateQueries({ queryKey: ['student_account_info', studentId] }) },
    onError: (e) => toast(errText(e), 'error'),
  })

  const a = info.data
  if (!a) return null
  return (
    <Card className="space-y-3 p-4">
      <p className="flex items-center gap-2 font-semibold"><KeyRound className="h-5 w-5 text-bronze" /> {t('studentAccount.title')}</p>
      {a.exists ? (
        <>
          <p>
            {t('studentAccount.username')}: <span className="font-mono font-bold">{a.username}</span>{' '}
            {a.is_active ? <Badge tone="good">{t('studentAccount.active')}</Badge> : <Badge tone="bad">{t('studentAccount.disabled')}</Badge>}
          </p>
          {a.locked_until && <p className="text-sm text-red-700">{t('studentAccount.lockedUntil', { time: formatDateTime(a.locked_until, i18n.language) })}</p>}
          <p className="text-sm text-navy/60">{t('studentAccount.loginHint')}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setDialog('pin')}>{t('studentAccount.changePin')}</Button>
            <Button size="sm" variant="ghost" disabled={setActive.isPending} onClick={() => setActive.mutate(!a.is_active)}>
              {a.is_active ? <><Lock className="h-4 w-4" /> {t('studentAccount.lock')}</> : <><Unlock className="h-4 w-4" /> {t('studentAccount.unlock')}</>}
            </Button>
          </div>
        </>
      ) : a.age === null ? (
        <p className="text-sm text-navy/65">{t('studentAccount.needDob')}</p>
      ) : a.age < a.min_age ? (
        <p className="text-sm text-navy/65">{t('studentAccount.tooYoung', { age: a.min_age })}</p>
      ) : (
        <>
          <p className="text-sm text-navy/65">{t('studentAccount.intro')}</p>
          <Button size="sm" onClick={() => setDialog('create')}>{t('studentAccount.create')}</Button>
        </>
      )}
      <AccountDialog mode={dialog} studentId={studentId} onClose={() => setDialog(null)} />
    </Card>
  )
}

function AccountDialog({ mode, studentId, onClose }: { mode: 'create' | 'pin' | null; studentId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()
  const errText = useErrorText()
  const [username, setUsername] = useState('')
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const suggestions = useQuery({
    queryKey: ['student_username_suggest', studentId],
    enabled: mode === 'create',
    staleTime: Infinity,
    queryFn: () => invokeFunction<{ suggestions: string[] }>('student-accounts', { action: 'suggest', student_id: studentId }),
  })
  const save = useMutation({
    mutationFn: () =>
      invokeFunction('student-accounts', mode === 'create'
        ? { action: 'create', student_id: studentId, username: username.trim().toLowerCase(), pin }
        : { action: 'set_pin', student_id: studentId, pin }),
    onSuccess: () => {
      toast(mode === 'create' ? t('studentAccount.created') : t('studentAccount.pinChanged'))
      qc.invalidateQueries({ queryKey: ['student_account_info', studentId] })
      close()
    },
  })
  const close = () => { setPin(''); setPin2(''); setUsername(''); save.reset(); onClose() }
  const pinOk = /^\d{6}$/.test(pin) && pin === pin2

  return (
    <Dialog open={mode !== null} onClose={close} title={mode === 'create' ? t('studentAccount.create') : t('studentAccount.changePin')}>
      <div className="space-y-4">
        {mode === 'create' && (
          <Field label={t('studentAccount.username')} hint={t('studentAccount.usernameHint')}>
            <Input value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} autoCapitalize="none" autoComplete="off" className="font-mono" />
          </Field>
        )}
        {mode === 'create' && (suggestions.data?.suggestions.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-2">
            {suggestions.data!.suggestions.map((s) => (
              <Button key={s} size="sm" variant="outline" className="font-mono" onClick={() => setUsername(s)}>{s}</Button>
            ))}
          </div>
        )}
        <Field label={t('studentAccount.pin')} hint={t('studentAccount.pinHint')}>
          <Input type="password" inputMode="numeric" maxLength={6} autoComplete="new-password" value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} className="font-mono text-lg tracking-[0.5em]" />
        </Field>
        <Field label={t('studentAccount.pinAgain')} error={pin2.length === 6 && pin !== pin2 ? t('auth.passwordMismatch') : null}>
          <Input type="password" inputMode="numeric" maxLength={6} autoComplete="new-password" value={pin2}
            onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))} className="font-mono text-lg tracking-[0.5em]" />
        </Field>
        <FormError message={save.isError ? errText(save.error) : null} />
        <Button size="full" disabled={!pinOk || (mode === 'create' && username.trim().length < 3) || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? t('common.loading') : t('common.save')}
        </Button>
      </div>
    </Dialog>
  )
}
