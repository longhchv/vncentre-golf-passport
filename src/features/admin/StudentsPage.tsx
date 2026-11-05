import { useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Plus, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { errorMessage, useTable } from '@/lib/db'
import { formatDate, useLocalized } from '@/lib/i18nField'
import { Button } from '@/components/ui/button'
import { Badge, Card, TableWrap, td, th } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { Input, Select } from '@/components/ui/form'
import { useToast } from '@/components/ui/toast'
import { EntityForm, type FieldSpec } from '@/features/admin/EntityForm'
import { GOLF_GOALS, type PassportTier, type School } from '@/lib/types'
import { MergeHistoryButton } from './MergeStudents'

const PAGE_SIZE = 50
const VERIFICATION = ['verified', 'pending_review', 'event_guest'] as const

export interface AdminStudentRow {
  id: string
  student_code: string
  full_name: string
  date_of_birth: string | null
  birth_year: number | null
  school_name: string | null
  current_grade_class: string | null
  level_number: number | null
  verification_status: 'verified' | 'pending_review' | 'event_guest'
  activated: boolean
  passports: { code: string; tier_code: string; status: string }[]
  league_stages: number
}

/**
 * Học viên (admin/HLV trưởng): tìm theo mã VNC, tên (bỏ dấu), SĐT phụ huynh, mã sổ; lọc trường, hạng sổ, xác minh,
 * đã thi SNAG League; phân trang (F16, spec 14 mục 1.1). Bấm dòng → trang chi tiết /admin/students/:id.
 */
export function StudentsPage() {
  const { t, i18n } = useTranslation()
  const localized = useLocalized()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState(params.get('q') ?? '')
  const [creating, setCreating] = useState(false)
  const schools = useTable<School>('schools', { order: 'name' })
  const tiers = useTable<PassportTier>('passport_tiers', { order: 'level_from' })

  const submitted = params.get('q') ?? ''
  const schoolId = params.get('school') ?? ''
  const tier = params.get('tier') ?? ''
  const verification = params.get('verification') ?? ''
  const league = params.get('league') ?? ''
  const page = Math.max(Number(params.get('page') ?? '1') || 1, 1)
  const openId = params.get('open')

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key !== 'page') next.delete('page')
    setParams(next, { replace: true })
  }

  const results = useQuery({
    queryKey: ['admin_students_page', submitted, schoolId, tier, verification, league, page],
    enabled: !openId,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('admin_students_page', {
        p_query: submitted || null,
        p_school_id: schoolId || null,
        p_tier_code: tier || null,
        p_verification: verification || null,
        p_league: league === '' ? null : league === 'yes',
        p_limit: PAGE_SIZE,
        p_offset: (page - 1) * PAGE_SIZE,
      })
      if (error) throw error
      return data as { total: number; rows: AdminStudentRow[] }
    },
  })

  // Link cũ /admin/students?open=… (trang quét sổ, hàng chờ ghép) → trang chi tiết
  if (openId) return <Navigate to={`/admin/students/${openId}`} replace />

  const total = results.data?.total ?? 0
  const pages = Math.max(Math.ceil(total / PAGE_SIZE), 1)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t('admin.nav.students')}</h1>
        <div className="flex flex-wrap gap-2">
          <MergeHistoryButton />
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> {t('students.add')}
          </Button>
        </div>
      </div>

      <Card className="space-y-3 p-4">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            setFilter('q', query.trim())
          }}
        >
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('students.searchPlaceholderFull')} />
          <Button type="submit" aria-label={t('common.search')}>
            <Search className="h-5 w-5" />
          </Button>
        </form>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Select value={schoolId} onChange={(e) => setFilter('school', e.target.value)} aria-label={t('fields.school')}>
            <option value="">{t('students.allSchools')}</option>
            {schools.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.short_name || s.name}
              </option>
            ))}
          </Select>
          <Select value={tier} onChange={(e) => setFilter('tier', e.target.value)} aria-label={t('students.filter.tier')}>
            <option value="">{t('students.filter.allTiers')}</option>
            {tiers.data?.map((x) => (
              <option key={x.id} value={x.code}>
                {localized(x, 'name')}
              </option>
            ))}
          </Select>
          <Select value={verification} onChange={(e) => setFilter('verification', e.target.value)} aria-label={t('students.filter.verification')}>
            <option value="">{t('students.filter.allVerification')}</option>
            {VERIFICATION.map((v) => (
              <option key={v} value={v}>
                {t(`verification.${v}`)}
              </option>
            ))}
          </Select>
          <Select value={league} onChange={(e) => setFilter('league', e.target.value)} aria-label={t('students.filter.league')}>
            <option value="">{t('students.filter.leagueAny')}</option>
            <option value="yes">{t('students.filter.leagueYes')}</option>
            <option value="no">{t('students.filter.leagueNo')}</option>
          </Select>
        </div>
      </Card>

      {results.isPending ? (
        <p className="text-navy/60">{t('common.loading')}</p>
      ) : results.isError ? (
        <p className="text-red-700">{t('errors.loadFailed')}</p>
      ) : (
        <>
          <p className="text-sm text-navy/60">{t('students.resultCount', { count: total })}</p>
          <TableWrap>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={th}>{t('fields.studentName')}</th>
                  <th className={th}>{t('fields.dateOfBirth')}</th>
                  <th className={th}>{t('fields.school')}</th>
                  <th className={th}>{t('fields.level')}</th>
                  <th className={th}>{t('students.passports')}</th>
                  <th className={th}>{t('fields.parentActivation')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy/10">
                {results.data.rows.map((s) => (
                  <tr key={s.id} className="cursor-pointer hover:bg-navy/3" onClick={() => navigate(`/admin/students/${s.id}`)}>
                    <td className={td}>
                      <Link
                        to={`/admin/students/${s.id}`}
                        className="font-semibold text-navy underline-offset-4 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {s.full_name}
                      </Link>
                      <div className="text-sm text-navy/55">{s.student_code}</div>
                    </td>
                    <td className={`${td} whitespace-nowrap`}>
                      {s.date_of_birth ? formatDate(s.date_of_birth, i18n.language) : (s.birth_year ?? '—')}
                    </td>
                    <td className={td}>
                      {s.school_name ?? '—'}
                      {s.current_grade_class ? <span className="text-navy/55"> · {s.current_grade_class}</span> : null}
                    </td>
                    <td className={`${td} whitespace-nowrap`}>{s.level_number ? `Level ${s.level_number}` : '—'}</td>
                    <td className={`${td} text-sm`}>
                      {s.passports.length === 0
                        ? '—'
                        : s.passports.map((p) => (
                            <div key={p.code} className="font-mono">
                              {p.code}
                            </div>
                          ))}
                    </td>
                    <td className={td}>
                      <div className="flex flex-wrap gap-1">
                        {s.activated ? <Badge tone="good">{t('roster.activated')}</Badge> : <Badge>{t('roster.notActivated')}</Badge>}
                        {s.verification_status !== 'verified' && <Badge tone="warn">{t(`verification.${s.verification_status}`)}</Badge>}
                        {s.league_stages > 0 && <Badge>{t('students.leagueBadge', { count: s.league_stages })}</Badge>}
                      </div>
                    </td>
                  </tr>
                ))}
                {results.data.rows.length === 0 && (
                  <tr>
                    <td className={`${td} text-navy/50`} colSpan={6}>
                      {t('common.empty')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </TableWrap>
          {pages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setFilter('page', String(page - 1))}>
                {t('students.prevPage')}
              </Button>
              <span className="text-sm text-navy/70">{t('students.pageOf', { page, pages })}</span>
              <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setFilter('page', String(page + 1))}>
                {t('students.nextPage')}
              </Button>
            </div>
          )}
        </>
      )}

      <NewStudentDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(id) => navigate(`/admin/students/${id}`)}
        schools={schools.data ?? []}
      />
    </div>
  )
}

/** Trường thông tin học viên dùng chung cho thêm mới (ở đây) và sửa (trang chi tiết). */
export function useStudentFields(schools: School[]): FieldSpec[] {
  const { t } = useTranslation()
  return [
    { name: 'full_name', labelKey: 'fields.studentName', required: true },
    { name: 'date_of_birth', labelKey: 'fields.dateOfBirth', type: 'date' },
    {
      name: 'gender',
      labelKey: 'fields.gender',
      type: 'select',
      options: ['male', 'female', 'other'].map((v) => ({ value: v, label: t(`gender.${v}`) })),
    },
    { name: 'nationality', labelKey: 'fields.nationality' },
    {
      name: 'current_school_id',
      labelKey: 'fields.school',
      type: 'select',
      options: schools.map((s) => ({ value: s.id, label: s.short_name || s.name })),
    },
    { name: 'current_grade_class', labelKey: 'fields.gradeClass' },
    {
      name: 'golf_goals',
      labelKey: 'fields.golfGoals',
      type: 'multicheck',
      options: GOLF_GOALS.map((g) => ({ value: g, label: t(`golfGoals.${g}`) })),
    },
    { name: 'golf_goals_other', labelKey: 'fields.golfGoalsOther' },
  ]
}

function NewStudentDialog({
  open,
  onClose,
  onCreated,
  schools,
}: {
  open: boolean
  onClose: () => void
  onCreated: (id: string) => void
  schools: School[]
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()
  const fields = useStudentFields(schools)
  const save = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const res = await supabase!.from('students').insert(values).select('id').single()
      if (res.error) throw res.error
      return res.data.id as string
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ['admin_students_page'] })
      toast(t('common.saved'))
      onClose()
      onCreated(id)
    },
    onError: (e) => toast(errorMessage(e, t), 'error'),
  })
  return (
    <Dialog open={open} onClose={onClose} title={t('students.add')}>
      <EntityForm fields={fields} initial={{ golf_goals: [] }} isEdit={false} busy={save.isPending} onSubmit={(v) => save.mutate(v)} />
    </Dialog>
  )
}
