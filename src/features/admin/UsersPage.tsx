import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { KeyRound, Lock, LockOpen, Plus, Share2, Copy, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { errorMessage, useTable } from '@/lib/db'
import { formatDateTime } from '@/lib/i18nField'
import { useAuth } from '@/auth/AuthProvider'
import { Button } from '@/components/ui/button'
import { Badge, Card } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { Checkbox, Field, FormError, Input, Select } from '@/components/ui/form'
import { useToast } from '@/components/ui/toast'
import { STAFF_ROLES, type AdminUserRow, type Role, type School } from '@/lib/types'

async function callAdminUsers(body: Record<string, unknown>) {
  const { data, error } = await supabase!.functions.invoke('admin-users', { body })
  if (error) {
    // Lấy mã lỗi do hàm trả về (ví dụ invalid_email) để hiện đúng thông báo
    const ctx = (error as { context?: Response }).context
    const detail = ctx ? await ctx.json().catch(() => null) : null
    throw new Error(detail?.error ?? error.message)
  }
  return data as { user_id?: string; link?: string | null; email_sent?: boolean; existed?: boolean }
}

type Filter = 'staff' | 'all'

/** Người dùng và vai trò (F16): tạo tài khoản nhân viên, gán/gỡ vai trò theo trường, khoá tài khoản. */
export function UsersPage() {
  const { t, i18n } = useTranslation()
  const { profile } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const [filter, setFilter] = useState<Filter>('staff')
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [roleFor, setRoleFor] = useState<AdminUserRow | null>(null)
  const [link, setLink] = useState<{ url: string; email: string | null } | null>(null)
  const schools = useTable<School>('schools', { order: 'name' })
  const schoolName = new Map((schools.data ?? []).map((s) => [s.id, s.short_name || s.name]))

  const users = useQuery({
    queryKey: ['admin_list_users'],
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('admin_list_users')
      if (error) throw error
      return data as AdminUserRow[]
    },
  })

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['admin_list_users'] })
    qc.invalidateQueries({ queryKey: ['audit_logs'] })
  }
  const onError = (e: unknown) => toast(errorMessage(e, t), 'error')

  const removeRole = useMutation({
    mutationFn: async (roleId: string) => {
      const { error } = await supabase!.from('user_roles').update({ deleted_at: new Date().toISOString() }).eq('id', roleId)
      if (error) throw error
    },
    onSuccess: () => {
      refresh()
      toast(t('common.saved'))
    },
    onError,
  })

  const setStatus = useMutation({
    mutationFn: (v: { user_id: string; status: 'active' | 'suspended' }) => callAdminUsers({ action: 'set_status', ...v }),
    onSuccess: () => {
      refresh()
      toast(t('common.saved'))
    },
    onError,
  })

  const loginLink = useMutation({
    mutationFn: (u: AdminUserRow) => callAdminUsers({ action: 'login_link', user_id: u.user_id }).then((r) => ({ ...r, email: u.email })),
    onSuccess: (r) => r.link && setLink({ url: r.link, email: r.email }),
    onError,
  })

  const q = search.trim().toLowerCase()
  const rows = (users.data ?? [])
    .filter((u) => filter === 'all' || u.roles.length > 0)
    .filter((u) => !q || `${u.full_name ?? ''} ${u.email ?? ''} ${u.phone ?? ''}`.toLowerCase().includes(q))

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t('admin.nav.users')}</h1>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> {t('users.createStaff')}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(['staff', 'all'] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`min-h-10 rounded-full px-4 text-sm font-semibold ${filter === f ? 'bg-navy text-white' : 'bg-white text-navy/70 ring-1 ring-navy/15'}`}
          >
            {t(`users.filter.${f}`)}
          </button>
        ))}
        <Input className="max-w-xs" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('users.searchPlaceholder')} />
      </div>

      {users.isPending ? (
        <p className="text-navy/60">{t('common.loading')}</p>
      ) : users.isError ? (
        <p className="text-red-700">{t('errors.loadFailed')}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((u) => (
            <li key={u.user_id}>
              <Card className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">{u.full_name || u.email || u.phone}</p>
                    <p className="text-sm break-all text-navy/60">{[u.email, u.phone].filter(Boolean).join(' · ')}</p>
                    <p className="text-sm text-navy/50">
                      {u.last_sign_in_at
                        ? t('users.lastSignIn', { at: formatDateTime(u.last_sign_in_at, i18n.language) })
                        : t('users.neverSignedIn')}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {u.status === 'suspended' && <Badge tone="bad">{t('users.suspended')}</Badge>}
                    {!u.confirmed && <Badge tone="warn">{t('users.invitePending')}</Badge>}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {u.roles.map((r) => (
                    <span key={r.id} className="inline-flex items-center gap-1 rounded-full bg-navy/8 py-1 pr-1 pl-3 text-sm font-semibold">
                      {t(`roles.${r.role}`)}
                      {r.school_id ? ` · ${schoolName.get(r.school_id) ?? ''}` : ''}
                      <button
                        type="button"
                        aria-label={t('common.remove')}
                        className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-navy/10"
                        disabled={u.user_id === profile?.user_id && r.role === 'admin'}
                        onClick={() => window.confirm(t('users.confirmRemoveRole')) && removeRole.mutate(r.id)}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </span>
                  ))}
                  <Button size="sm" variant="outline" onClick={() => setRoleFor(u)}>
                    <Plus className="h-4 w-4" /> {t('users.addRole')}
                  </Button>
                </div>

                <div className="flex flex-wrap gap-2 border-t border-navy/10 pt-3">
                  {u.email && (
                    <Button size="sm" variant="ghost" disabled={loginLink.isPending} onClick={() => loginLink.mutate(u)}>
                      <KeyRound className="h-4 w-4" /> {u.confirmed ? t('users.resetLink') : t('users.inviteLink')}
                    </Button>
                  )}
                  {u.user_id !== profile?.user_id &&
                    (u.status === 'active' ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => window.confirm(t('users.confirmSuspend')) && setStatus.mutate({ user_id: u.user_id, status: 'suspended' })}
                      >
                        <Lock className="h-4 w-4" /> {t('users.suspend')}
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => setStatus.mutate({ user_id: u.user_id, status: 'active' })}>
                        <LockOpen className="h-4 w-4" /> {t('users.unsuspend')}
                      </Button>
                    ))}
                </div>
              </Card>
            </li>
          ))}
          {rows.length === 0 && <li className="text-navy/50">{t('common.empty')}</li>}
        </ul>
      )}

      <CreateStaffDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        schools={schools.data ?? []}
        onCreated={(r, email) => {
          refresh()
          if (r.link) setLink({ url: r.link, email })
          else toast(r.email_sent ? t('users.inviteEmailSent', { email }) : t('users.roleAdded'))
        }}
      />
      <AddRoleDialog user={roleFor} onClose={() => setRoleFor(null)} schools={schools.data ?? []} onDone={refresh} />
      <LinkDialog link={link} onClose={() => setLink(null)} />
    </div>
  )
}

function RoleFields({
  role,
  setRole,
  schoolId,
  setSchoolId,
  schools,
}: {
  role: Role
  setRole: (r: Role) => void
  schoolId: string
  setSchoolId: (s: string) => void
  schools: School[]
}) {
  const { t } = useTranslation()
  return (
    <>
      <Field label={t('fields.role')}>
        <Select value={role} onChange={(e) => setRole(e.target.value as Role)}>
          {STAFF_ROLES.map((r) => (
            <option key={r} value={r}>
              {t(`roles.${r}`)}
            </option>
          ))}
        </Select>
      </Field>
      {role === 'school_manager' && (
        <Field label={t('fields.school') + ' *'}>
          <Select value={schoolId} onChange={(e) => setSchoolId(e.target.value)} required>
            <option value="">—</option>
            {schools.map((s) => (
              <option key={s.id} value={s.id}>
                {s.short_name || s.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
    </>
  )
}

function CreateStaffDialog({
  open,
  onClose,
  schools,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  schools: School[]
  onCreated: (r: { link?: string | null; email_sent?: boolean }, email: string) => void
}) {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<Role>('coach')
  const [schoolId, setSchoolId] = useState('')
  const [sendEmail, setSendEmail] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: () =>
      callAdminUsers({
        action: 'create_staff',
        email,
        full_name: fullName,
        role,
        school_id: role === 'school_manager' ? schoolId : null,
        send_email: sendEmail,
      }),
    onSuccess: (r) => {
      onCreated(r, email.trim())
      setEmail('')
      setFullName('')
      setError(null)
      onClose()
    },
    onError: (e: Error) => setError(t(`users.errors.${e.message}`, { defaultValue: e.message })),
  })

  return (
    <Dialog open={open} onClose={onClose} title={t('users.createStaff')}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          create.mutate()
        }}
      >
        <Field label={t('auth.email') + ' *'}>
          <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label={t('fields.fullName') + ' *'}>
          <Input required value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>
        <RoleFields role={role} setRole={setRole} schoolId={schoolId} setSchoolId={setSchoolId} schools={schools} />
        <Checkbox label={t('users.sendInviteEmail')} checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
        <p className="text-sm text-navy/60">{t('users.inviteHint')}</p>
        <FormError message={error} />
        <Button type="submit" size="full" disabled={create.isPending}>
          {create.isPending ? t('common.loading') : t('users.createStaff')}
        </Button>
      </form>
    </Dialog>
  )
}

function AddRoleDialog({
  user,
  onClose,
  schools,
  onDone,
}: {
  user: AdminUserRow | null
  onClose: () => void
  schools: School[]
  onDone: () => void
}) {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const toast = useToast()
  const [role, setRole] = useState<Role>('coach')
  const [schoolId, setSchoolId] = useState('')

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase!.from('user_roles').insert({
        user_id: user!.user_id,
        role,
        school_id: role === 'school_manager' ? schoolId : null,
        granted_by: profile?.user_id,
      })
      if (error) throw error
    },
    onSuccess: () => {
      onDone()
      toast(t('common.saved'))
      onClose()
    },
    onError: (e) => toast(errorMessage(e, t), 'error'),
  })

  return (
    <Dialog open={user !== null} onClose={onClose} title={`${t('users.addRole')} · ${user?.full_name || user?.email || ''}`}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          add.mutate()
        }}
      >
        <RoleFields role={role} setRole={setRole} schoolId={schoolId} setSchoolId={setSchoolId} schools={schools} />
        <Button type="submit" size="full" disabled={add.isPending || (role === 'school_manager' && !schoolId)}>
          {t('common.save')}
        </Button>
      </form>
    </Dialog>
  )
}

/** Hiện link mời/đặt lại mật khẩu để admin chép hoặc chia sẻ qua Zalo. */
function LinkDialog({ link, onClose }: { link: { url: string; email: string | null } | null; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator

  async function copy() {
    try {
      await navigator.clipboard.writeText(link!.url)
      toast(t('common.copied'))
    } catch {
      toast(t('users.copyManually'), 'error')
    }
  }

  return (
    <Dialog open={link !== null} onClose={onClose} title={t('users.linkTitle')}>
      {link && (
        <div className="space-y-4">
          <p className="text-navy/75">{t('users.linkBody', { email: link.email ?? '' })}</p>
          <textarea readOnly value={link.url} rows={4} className="w-full rounded-xl border border-navy/20 bg-white p-3 font-mono text-xs break-all" onFocus={(e) => e.target.select()} />
          <div className="flex flex-wrap gap-2">
            <Button onClick={copy}>
              <Copy className="h-4 w-4" /> {t('common.copy')}
            </Button>
            {canShare && (
              <Button
                variant="outline"
                onClick={() => navigator.share({ title: 'VN Centre Golf Passport', text: t('users.shareText'), url: link.url }).catch(() => {})}
              >
                <Share2 className="h-4 w-4" /> {t('users.share')}
              </Button>
            )}
          </div>
          <p className="text-sm text-navy/55">{t('users.linkWarning')}</p>
        </div>
      )}
    </Dialog>
  )
}
