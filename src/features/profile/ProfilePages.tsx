import { useCallback, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Bell } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import { formatDateTime, useLocalized } from '@/lib/i18nField'
import { Card } from '@/components/ui/card'
import { FormError } from '@/components/ui/form'
import { Mascot } from '@/components/Mascot'
import { QrScanner } from '@/features/passports/QrScanner'
import { rpc, type PassportLookup } from '@/features/activation/api'
import { useStudentProfile } from './useStudentProfile'
import { StudentProfileView } from './StudentProfileView'

function ProfileLoader({ studentId, back }: { studentId: string; back: { to: string; label: string } }) {
  const { t } = useTranslation()
  const q = useStudentProfile(studentId)
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link to={back.to} className="inline-flex items-center gap-1 text-sm font-semibold text-bronze">
        <ArrowLeft className="h-4 w-4" /> {back.label}
      </Link>
      {q.isPending ? (
        <p className="text-navy/60">{t('common.loading')}</p>
      ) : q.isError ? (
        <Card className="flex flex-col items-center gap-3 p-6 text-center">
          <Mascot />
          <p className="font-semibold">{t('coach.noAccessStudent')}</p>
        </Card>
      ) : (
        <StudentProfileView profile={q.data} />
      )}
    </div>
  )
}

/** Phụ huynh · Hồ sơ con. */
export function ParentChildPage() {
  const { studentId = '' } = useParams()
  const { t } = useTranslation()
  return <ProfileLoader studentId={studentId} back={{ to: '/app', label: t('parent.nav.home') }} />
}

/** Học viên · Hồ sơ của mình (F7: chỉ xem, không sửa, không tải PDF). */
export function StudentMePage() {
  const { t } = useTranslation()
  const { studentId } = useAuth()
  const q = useStudentProfile(studentId ?? '')
  if (q.isPending) return <p className="text-navy/60">{t('common.loading')}</p>
  if (q.isError) return <p className="text-red-700">{t('errors.loadFailed')}</p>
  return (
    <div className="mx-auto max-w-2xl">
      <StudentProfileView profile={q.data} />
    </div>
  )
}

/** HLV · Hồ sơ học viên (không có liên hệ phụ huynh — F14, R8). */
export function CoachStudentPage() {
  const { studentId = '' } = useParams()
  const { t } = useTranslation()
  return <ProfileLoader studentId={studentId} back={{ to: '/coach', label: t('coach.myClasses') }} />
}

/** HLV · Quét QR sổ → mở hồ sơ học viên nếu thuộc lớp mình; lớp khác → "Bạn không có quyền xem học viên này" (F14). */
export function CoachScanPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [key, setKey] = useState(0)

  const onCode = useCallback(
    async (code: string) => {
      setError(null)
      try {
        const r = await rpc<PassportLookup>('passport_lookup', { p_code: code })
        if (r.result === 'ok' && r.relation !== 'none' && r.student_id) {
          navigate(`/coach/students/${r.student_id}`)
          return
        }
        setError(r.result === 'not_found' ? t('scan.wrongCode') : r.result === 'locked' ? t('scan.locked', { minutes: r.retry_minutes }) : t('coach.noAccessStudent'))
      } catch {
        setError(t('errors.generic'))
      }
      setKey((k) => k + 1)
    },
    [navigate, t],
  )

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-bold">{t('coach.scanPassport')}</h1>
      <QrScanner key={key} onCode={onCode} />
      <FormError message={error} />
    </div>
  )
}

interface NotificationRow {
  id: string
  type: string
  title_vi: string
  title_en: string
  body_vi: string | null
  body_en: string | null
  link: string | null
  read_at: string | null
  created_at: string
}

/** Hộp thông báo trong app (02 mục 3.2). */
export function NotificationsPage() {
  const { t, i18n } = useTranslation()
  const loc = useLocalized()
  const { session } = useAuth()
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ['notifications', session?.user.id],
    queryFn: async () => {
      const { data, error } = await supabase!.from('notifications').select('*').order('created_at', { ascending: false }).limit(100)
      if (error) throw error
      return data as NotificationRow[]
    },
  })
  const markRead = useMutation({
    mutationFn: async (ids: string[]) => {
      await supabase!.from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })
  const unread = (q.data ?? []).filter((n) => !n.read_at).map((n) => n.id)

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">{t('parent.nav.notifications')}</h1>
        {unread.length > 0 && (
          <button type="button" className="text-sm font-semibold text-bronze" onClick={() => markRead.mutate(unread)}>
            {t('notifications.markAllRead')}
          </button>
        )}
      </div>
      {q.data?.length === 0 && (
        <Card className="flex flex-col items-center gap-2 p-6 text-center">
          <Bell className="h-8 w-8 text-navy/30" />
          <p className="text-navy/65">{t('notifications.empty')}</p>
        </Card>
      )}
      <ul className="space-y-2">
        {q.data?.map((n) => {
          const body = (
            <Card className={`space-y-1 p-4 ${n.read_at ? '' : 'border-bronze bg-gold/10'}`}>
              <p className="font-semibold">{loc(n, 'title')}</p>
              {loc(n, 'body') && <p className="text-navy/75">{loc(n, 'body')}</p>}
              <p className="text-xs text-navy/50">{formatDateTime(n.created_at, i18n.language)}</p>
            </Card>
          )
          return (
            <li key={n.id} onClick={() => !n.read_at && markRead.mutate([n.id])}>
              {n.link ? <Link to={n.link}>{body}</Link> : body}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
