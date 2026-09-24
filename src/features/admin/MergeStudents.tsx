import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeftRight, History, Search, Undo2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { errorMessage, useTable } from '@/lib/db'
import { formatDate, formatDateTime } from '@/lib/i18nField'
import { Button } from '@/components/ui/button'
import { Badge, Card } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/form'
import { useToast } from '@/components/ui/toast'
import type { School, StudentSearchRow } from '@/lib/types'
import { useAuth } from '@/auth/AuthProvider'

type FieldKey = 'full_name' | 'date_of_birth' | 'gender' | 'nationality' | 'current_school_id' | 'current_grade_class' | 'avatar_url' | 'golf_goals' | 'golf_goals_other'
const FIELDS: FieldKey[] = ['full_name', 'date_of_birth', 'gender', 'nationality', 'current_school_id', 'current_grade_class', 'avatar_url', 'golf_goals', 'golf_goals_other']
const FIELD_LABEL: Record<FieldKey, string> = {
  full_name: 'fields.studentName', date_of_birth: 'fields.dateOfBirth', gender: 'fields.gender', nationality: 'fields.nationality',
  current_school_id: 'fields.school', current_grade_class: 'fields.gradeClass', avatar_url: 'merge.photo', golf_goals: 'fields.golfGoals',
  golf_goals_other: 'fields.golfGoalsOther',
}
const COUNT_KEYS = ['guardians', 'classes', 'courses', 'levels', 'passports', 'certificates', 'orders', 'account'] as const

interface PreviewStudent {
  id: string
  student_code: string
  created_at: string
  activated_at: string | null
  verification_status: string
  fields: Record<FieldKey, unknown>
  school_name: string | null
  level_number: number | null
  counts: Record<(typeof COUNT_KEYS)[number], number>
  guardian_names: (string | null)[]
  active_passport: string | null
}
interface Preview { students: [PreviewStudent, PreviewStudent]; shared_guardians: number; both_active_passport: boolean; both_accounts: boolean }

/** Gộp học viên trùng (F10): chọn hồ sơ thứ hai → so sánh cạnh nhau → chọn hồ sơ giữ lại và giá trị từng trường → gộp. */
export function MergeStudentsDialog({ student, open, onClose, onMerged }: {
  student: { id: string; full_name: string }
  open: boolean
  onClose: () => void
  onMerged: (keepId: string) => void
}) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()
  const schools = useTable<School>('schools', { order: 'name' })
  const [query, setQuery] = useState(student.full_name)
  const [term, setTerm] = useState(student.full_name)
  const [other, setOther] = useState<string | null>(null)
  const [keepIdx, setKeepIdx] = useState<0 | 1>(0)
  const [choice, setChoice] = useState<Partial<Record<FieldKey, 0 | 1>>>({})

  const search = useQuery({
    queryKey: ['admin_search_students', 'merge', term],
    enabled: open && !other && term.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('admin_search_students', { p_query: term, p_school_id: null, p_limit: 30 })
      if (error) throw error
      return (data as StudentSearchRow[]).filter((s) => s.id !== student.id)
    },
  })
  const preview = useQuery({
    queryKey: ['student_merge_preview', student.id, other],
    enabled: Boolean(other),
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('student_merge_preview', { p_a: student.id, p_b: other })
      if (error) throw error
      return data as Preview
    },
  })
  const merge = useMutation({
    mutationFn: async () => {
      const s = preview.data!.students
      const keep = s[keepIdx], remove = s[1 - keepIdx]
      const fields: Record<string, string> = {}
      for (const f of FIELDS) if ((choice[f] ?? keepIdx) !== keepIdx) fields[f] = 'remove'
      const { error } = await supabase!.rpc('merge_students', { p_keep: keep.id, p_remove: remove.id, p_fields: fields })
      if (error) throw error
      return keep.id
    },
    onSuccess: (keepId) => {
      toast(t('merge.done'))
      qc.invalidateQueries({ queryKey: ['admin_search_students'] })
      qc.invalidateQueries({ queryKey: ['student'] })
      qc.invalidateQueries({ queryKey: ['student_merges'] })
      close()
      onMerged(keepId)
    },
    onError: (e) => toast(errorMessage(e, t), 'error'),
  })

  function close() {
    setOther(null)
    setChoice({})
    setKeepIdx(0)
    onClose()
  }

  const show = (f: FieldKey, v: unknown) => {
    if (v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length)) return '—'
    if (f === 'date_of_birth') return formatDate(String(v), i18n.language)
    if (f === 'gender') return t(`gender.${v}`)
    if (f === 'current_school_id') return schools.data?.find((s) => s.id === v)?.name ?? String(v)
    if (f === 'golf_goals') return (v as string[]).map((g) => t(`golfGoals.${g}`)).join(', ')
    if (f === 'avatar_url') return t('merge.hasPhoto')
    return String(v)
  }

  const p = preview.data
  return (
    <Dialog open={open} onClose={close} title={t('merge.title')}>
      {!other ? (
        <div className="space-y-3">
          <p className="text-navy/70">{t('merge.pickOther', { name: student.full_name })}</p>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setTerm(query.trim()) }}>
            <Input value={query} onChange={(e) => setQuery(e.target.value)} />
            <Button type="submit" aria-label={t('common.search')}><Search className="h-5 w-5" /></Button>
          </form>
          {search.data?.length === 0 && <p className="text-navy/60">{t('common.empty')}</p>}
          <ul className="space-y-2">
            {search.data?.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => setOther(s.id)} className="w-full rounded-xl bg-white p-3 text-left shadow-sm hover:ring-2 hover:ring-bronze">
                  <span className="block font-semibold">{s.full_name} <span className="text-sm font-normal text-navy/55">{s.student_code}</span></span>
                  <span className="block text-sm text-navy/60">
                    {[s.date_of_birth ? formatDate(s.date_of_birth, i18n.language) : null, s.school_name, s.current_grade_class].filter(Boolean).join(' · ')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : !p ? (
        <p className="text-navy/60">{preview.isError ? errorMessage(preview.error, t) : t('common.loading')}</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {p.students.map((s, i) => (
              <button key={s.id} type="button" onClick={() => setKeepIdx(i as 0 | 1)}
                className={`rounded-xl p-3 text-left ring-2 ${keepIdx === i ? 'bg-emerald-50 ring-emerald-600' : 'bg-white ring-navy/10'}`}>
                <span className="block text-xs font-semibold uppercase text-navy/55">{keepIdx === i ? t('merge.keep') : t('merge.remove')}</span>
                <span className="block font-mono text-sm">{s.student_code}</span>
                <span className="block text-xs text-navy/55">{formatDateTime(s.created_at, i18n.language)}</span>
                {s.activated_at && <Badge tone="good">{t('roster.activated')}</Badge>}
              </button>
            ))}
          </div>
          <p className="text-sm text-navy/60">{t('merge.pickValues')}</p>
          <div className="space-y-2">
            {FIELDS.map((f) => {
              const v0 = p.students[0].fields[f], v1 = p.students[1].fields[f]
              const same = JSON.stringify(v0) === JSON.stringify(v1)
              const sel = choice[f] ?? keepIdx
              return (
                <div key={f} className="space-y-1">
                  <p className="text-sm font-semibold text-navy/70">{t(FIELD_LABEL[f])}</p>
                  {same ? (
                    <p className="rounded-lg bg-navy/5 px-3 py-2 text-sm">{show(f, v0)}</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {[v0, v1].map((v, i) => (
                        <button key={i} type="button" onClick={() => setChoice((c) => ({ ...c, [f]: i as 0 | 1 }))}
                          className={`rounded-lg px-3 py-2 text-left text-sm ring-2 ${sel === i ? 'bg-gold/20 ring-bronze' : 'bg-white ring-navy/10'}`}>
                          {show(f, v)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <Card className="space-y-2 p-3">
            <p className="text-sm font-semibold">{t('merge.related')}</p>
            <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-1 text-sm">
              {COUNT_KEYS.map((k) => (
                <div key={k} className="contents">
                  <span className="text-navy/65">{t(`merge.count.${k}`)}</span>
                  <span className="text-right">{p.students[0].counts[k]}</span>
                  <span className="text-right">{p.students[1].counts[k]}</span>
                </div>
              ))}
            </div>
            <p className="text-sm text-navy/60">{t('merge.allMove')}</p>
          </Card>
          {(p.shared_guardians > 0 || p.both_active_passport || p.both_accounts) && (
            <ul className="list-disc space-y-1 rounded-xl bg-gold/15 p-3 pl-7 text-sm text-brown">
              {p.shared_guardians > 0 && <li>{t('merge.warnSharedGuardian', { count: p.shared_guardians })}</li>}
              {p.both_active_passport && <li>{t('merge.warnPassports', { code: p.students[1 - keepIdx].active_passport })}</li>}
              {p.both_accounts && <li>{t('merge.warnAccounts')}</li>}
            </ul>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            <Button variant="ghost" onClick={() => setOther(null)}><ArrowLeftRight className="h-4 w-4" /> {t('merge.pickAnother')}</Button>
            <Button disabled={merge.isPending}
              onClick={() => window.confirm(t('merge.confirm', { keep: p.students[keepIdx].student_code, remove: p.students[1 - keepIdx].student_code })) && merge.mutate()}>
              {t('merge.doMerge')}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  )
}

interface MergeRow {
  id: string
  merged_at: string
  undone_at: string | null
  from_name: string
  from_code: string
  to_name: string
  to_code: string
  merged_by: string | null
  undo_until: string
  can_undo: boolean
}

/** Lịch sử gộp + hoàn tác trong 30 ngày. */
export function MergeHistoryButton() {
  const { hasRole } = useAuth()
  if (!hasRole('admin')) return null
  return <MergeHistory />
}

function MergeHistory() {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const list = useQuery({
    queryKey: ['student_merges'],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('student_merges_list', { p_limit: 200 })
      if (error) throw error
      return data as MergeRow[]
    },
  })
  const undo = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase!.rpc('undo_student_merge', { p_merge_id: id })
      if (error) throw error
    },
    onSuccess: () => {
      toast(t('merge.undone'))
      qc.invalidateQueries({ queryKey: ['student_merges'] })
      qc.invalidateQueries({ queryKey: ['admin_search_students'] })
    },
    onError: (e) => toast(t(`merge.errors.${String((e as { message?: string }).message)}`, { defaultValue: errorMessage(e, t) }), 'error'),
  })
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}><History className="h-4 w-4" /> {t('merge.history')}</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={t('merge.history')}>
        {list.data?.length === 0 && <p className="text-navy/60">{t('common.empty')}</p>}
        <ul className="space-y-2">
          {list.data?.map((m) => (
            <li key={m.id}>
              <Card className="space-y-2 p-3">
                <p className="text-sm">
                  <span className="font-semibold">{m.from_name}</span> <span className="font-mono text-navy/55">{m.from_code}</span>
                  {' → '}
                  <span className="font-semibold">{m.to_name}</span> <span className="font-mono text-navy/55">{m.to_code}</span>
                </p>
                <p className="text-xs text-navy/55">{formatDateTime(m.merged_at, i18n.language)} · {m.merged_by ?? '—'}</p>
                {m.undone_at ? (
                  <Badge>{t('merge.undoneOn', { date: formatDateTime(m.undone_at, i18n.language) })}</Badge>
                ) : m.can_undo ? (
                  <Button size="sm" variant="outline" disabled={undo.isPending}
                    onClick={() => window.confirm(t('merge.confirmUndo')) && undo.mutate(m.id)}>
                    <Undo2 className="h-4 w-4" /> {t('merge.undo', { date: formatDate(m.undo_until, i18n.language) })}
                  </Button>
                ) : (
                  <Badge>{t('merge.undoExpired')}</Badge>
                )}
              </Card>
            </li>
          ))}
        </ul>
      </Dialog>
    </>
  )
}
