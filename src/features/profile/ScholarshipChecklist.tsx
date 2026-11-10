import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, ChevronDown, Compass, GraduationCap, Star } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/db'
import { useLocalized } from '@/lib/i18nField'
import { Button } from '@/components/ui/button'
import { Badge, Card } from '@/components/ui/card'
import { Select, Textarea } from '@/components/ui/form'
import { useToast } from '@/components/ui/toast'

// Spec 22 (Lộ trình học bổng v2): dữ liệu từ scholarship_roadmap (máy chủ kiểm quyền: phụ huynh đã xác nhận, chính học viên,
// admin). Phụ huynh đã xác nhận: chọn hướng (set_scholarship_tracks), sửa lớp (set_student_grade), đánh dấu mục
// (set_scholarship_item). Mục tự động (★) đã có dữ liệu thì khoá; chưa có thì bố mẹ đánh dấu được (vd. giải ngoài).

type Status = 'not_started' | 'in_progress' | 'done'
const STATUSES: Status[] = ['not_started', 'in_progress', 'done']
export const TRACKS = ['us', 'uk', 'au', 'asia', 'vn', 'hs', 'career'] as const
type Track = (typeof TRACKS)[number]
type Bucket = 'now' | 'upcoming' | 'later' | 'done'
const BUCKETS: Bucket[] = ['now', 'upcoming', 'later', 'done']
const STAGES = ['primary', 'lower_secondary', 'upper_secondary', 'post_graduation'] as const
const GRADES = Array.from({ length: 13 }, (_, i) => i + 1)

interface RoadmapItem {
  id: string
  code: string
  track: 'common' | Track
  group: 'golf' | 'academic' | 'personal' | 'admission'
  stage: (typeof STAGES)[number]
  title_vi: string
  title_en: string
  help_vi: string | null
  help_en: string | null
  start_grade: number
  start_note_vi: string | null
  start_note_en: string | null
  has_deadline: boolean
  is_verified: boolean
  status: Status
  source: 'auto' | 'guardian'
  auto_done: boolean
  note: string | null
  updated_at: string | null
  bucket: Bucket | null
}
interface TrackCompare {
  track: Track
  due_count: number
  done_count: number
  missing_count: number
  pct: number | null
  next: { code: string; title_vi: string; title_en: string; start_grade: number } | null
}
interface Roadmap {
  student_id: string
  current_grade: number | null
  tracks: Track[]
  can_edit: boolean
  items: RoadmapItem[]
  compare?: TrackCompare[]
}

// Nhóm nào đang mở: nhớ trong phiên trình duyệt; mặc định mở "Cần làm ngay", "Sắp tới" và các cấp học
function useOpenGroups(studentId: string) {
  const key = `scholarship-open-v2:${studentId}`
  const [open, setOpenState] = useState<string[]>(() => {
    try {
      const v = sessionStorage.getItem(key)
      if (v) return JSON.parse(v) as string[]
    } catch {
      // bộ nhớ phiên bị chặn: dùng mặc định
    }
    return ['now', 'upcoming', ...STAGES]
  })
  const toggle = (g: string) => {
    const next = open.includes(g) ? open.filter((x) => x !== g) : [...open, g]
    setOpenState(next)
    try {
      sessionStorage.setItem(key, JSON.stringify(next))
    } catch {
      // vẫn chạy, chỉ không nhớ
    }
  }
  return [open, toggle] as const
}

export function ScholarshipChecklist({ studentId }: { studentId: string }) {
  const { t } = useTranslation()
  const [open, toggle] = useOpenGroups(studentId)
  const [pickTracks, setPickTracks] = useState(false)
  const q = useQuery({
    queryKey: ['scholarship_roadmap', studentId],
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('scholarship_roadmap', { p_student_id: studentId })
      if (error) throw error
      return data as Roadmap | null
    },
  })
  if (!q.data) return null
  const rm = q.data

  const groups: { key: string; label: string; items: RoadmapItem[] }[] =
    rm.current_grade == null
      ? STAGES.map((s): { key: string; label: string; items: RoadmapItem[] } => ({ key: s, label: t(`scholarship.stage.${s}`), items: rm.items.filter((i) => i.stage === s && i.bucket !== 'done') })).concat([
          { key: 'done', label: t('scholarship.bucket.done'), items: rm.items.filter((i) => i.bucket === 'done') },
        ])
      : BUCKETS.map((b) => ({ key: b, label: t(`scholarship.bucket.${b}`), items: rm.items.filter((i) => i.bucket === b) }))

  return (
    <section id="athlete-scholarship" className="scroll-mt-20 space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <GraduationCap className="h-5 w-5 text-bronze" aria-hidden /> {t('scholarship.title')}
      </h2>
      <p className="text-sm text-navy/70">{t('scholarship.introV2')}</p>
      <p className="rounded-lg bg-bronze/10 px-3 py-2 text-sm text-navy/80">{t('scholarship.disclaimer')}</p>

      <GradeRow rm={rm} />

      <Card className="space-y-2 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 font-semibold">
            <Compass className="h-4 w-4 text-bronze" aria-hidden /> {t('scholarship.tracksTitle')}
          </p>
          {rm.can_edit && !pickTracks && (
            <Button size="sm" variant="ghost" onClick={() => setPickTracks(true)}>
              {rm.tracks.length ? t('scholarship.changeTracks') : t('scholarship.chooseTracks')}
            </Button>
          )}
        </div>
        {pickTracks ? (
          <TrackPicker rm={rm} onDone={() => setPickTracks(false)} />
        ) : rm.tracks.length ? (
          <div className="flex flex-wrap gap-1.5">
            {rm.tracks.map((tr) => (
              <Badge key={tr}>{t(`scholarship.track.${tr}.name`)}</Badge>
            ))}
          </div>
        ) : (
          <p className="text-sm text-navy/65">{t(rm.can_edit ? 'scholarship.noTracksEdit' : 'scholarship.noTracks')}</p>
        )}
      </Card>

      {rm.compare && rm.compare.length > 0 && <CompareCard compare={rm.compare} />}

      {groups.map((g) => {
        if (!g.items.length) return null
        const isOpen = open.includes(g.key)
        return (
          <Card key={g.key} className="overflow-hidden">
            <button
              type="button"
              onClick={() => toggle(g.key)}
              aria-expanded={isOpen}
              className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left"
            >
              <span className="font-semibold">{g.label}</span>
              <span className="flex shrink-0 items-center gap-2 text-sm text-navy/65">
                {g.items.length}
                <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden />
              </span>
            </button>
            {isOpen && (
              <ul className="divide-y divide-navy/10 border-t border-navy/10">
                {g.items.map((it) => (
                  <ChecklistRow key={it.id} item={it} studentId={rm.student_id} canEdit={rm.can_edit} highlight={g.key === 'now'} />
                ))}
              </ul>
            )}
          </Card>
        )
      })}
    </section>
  )
}

// So sánh mức sẵn sàng giữa các hướng đã chọn (spec 22 mục 4): không xếp hạng, không gợi ý "hướng tốt nhất"
function CompareCard({ compare }: { compare: TrackCompare[] }) {
  const { t } = useTranslation()
  const loc = useLocalized()
  return (
    <Card className="space-y-3 p-4">
      <div>
        <p className="font-semibold">{t('scholarship.compareTitle')}</p>
        <p className="text-sm text-navy/65">{t('scholarship.compareHint')}</p>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {compare.map((c) => (
          <li key={c.track} className="space-y-1.5 rounded-lg p-3 ring-1 ring-navy/15">
            <p className="font-semibold">{t(`scholarship.track.${c.track}.name`)}</p>
            {c.pct == null ? (
              <p className="text-sm text-navy/65">{t('scholarship.compareNoneDue')}</p>
            ) : (
              <>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span>{t('scholarship.compareDone', { done: c.done_count, due: c.due_count })}</span>
                  <b>{c.pct}%</b>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-navy/10" role="progressbar" aria-valuenow={c.pct} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-full rounded-full bg-bronze" style={{ width: `${c.pct}%` }} />
                </div>
                {c.missing_count > 0 && <p className="text-sm text-navy/70">{t('scholarship.compareMissing', { n: c.missing_count })}</p>}
              </>
            )}
            {c.next && (
              <p className="text-sm text-navy/70">
                {t('scholarship.compareNext')}: <span className="font-semibold text-navy">{loc(c.next, 'title')}</span>
              </p>
            )}
          </li>
        ))}
      </ul>
    </Card>
  )
}

function GradeRow({ rm }: { rm: Roadmap }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [grade, setGrade] = useState(String(rm.current_grade ?? ''))
  const save = useMutation({
    mutationFn: async (g: number) => {
      const { error } = await supabase!.rpc('set_student_grade', { p_student_id: rm.student_id, p_grade: g })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scholarship_roadmap'] })
      setEditing(false)
    },
    onError: (e) => toast(errorMessage(e, t), 'error'),
  })
  const label = (g: number) => (g === 13 ? t('scholarship.grade13') : t('scholarship.gradeN', { n: g }))

  if (editing) {
    return (
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (grade) save.mutate(Number(grade))
        }}
      >
        <Select value={grade} onChange={(e) => setGrade(e.target.value)} aria-label={t('scholarship.currentGrade')} className="w-auto">
          <option value="">—</option>
          {GRADES.map((g) => (
            <option key={g} value={g}>
              {label(g)}
            </option>
          ))}
        </Select>
        <Button type="submit" size="sm" disabled={!grade || save.isPending}>
          {t('common.save')}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
          {t('common.cancel')}
        </Button>
      </form>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {rm.current_grade == null ? (
        <span className="flex items-center gap-1.5 text-navy/80">
          <AlertTriangle className="h-4 w-4 text-bronze" aria-hidden /> {t('scholarship.gradeMissing')}
        </span>
      ) : (
        <span>
          {t('scholarship.currentGrade')}: <b>{label(rm.current_grade)}</b>
        </span>
      )}
      {rm.can_edit && (
        <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
          {rm.current_grade == null ? t('scholarship.addGrade') : t('scholarship.editGrade')}
        </Button>
      )}
    </div>
  )
}

function TrackPicker({ rm, onDone }: { rm: Roadmap; onDone: () => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()
  const [sel, setSel] = useState<Track[]>(rm.tracks)
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase!.rpc('set_scholarship_tracks', { p_student_id: rm.student_id, p_tracks: sel })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scholarship_roadmap'] })
      qc.invalidateQueries({ queryKey: ['scholarship_checklist'] })
      onDone()
    },
    onError: (e) => toast(errorMessage(e, t), 'error'),
  })
  return (
    <div className="space-y-2">
      <p className="text-sm text-navy/65">{t('scholarship.tracksHint')}</p>
      <ul className="space-y-1.5">
        {TRACKS.map((tr) => {
          const on = sel.includes(tr)
          return (
            <li key={tr}>
              <label className={`flex min-h-12 cursor-pointer items-start gap-3 rounded-lg px-3 py-2 ring-1 ${on ? 'bg-navy/5 ring-navy/40' : 'ring-navy/15'}`}>
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={on}
                  onChange={() => setSel(on ? sel.filter((x) => x !== tr) : [...sel, tr])}
                />
                <span>
                  <span className="block font-semibold">{t(`scholarship.track.${tr}.name`)}</span>
                  <span className="block text-sm text-navy/65">{t(`scholarship.track.${tr}.desc`)}</span>
                </span>
              </label>
            </li>
          )
        })}
      </ul>
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <Button type="button" size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
          {t('common.save')}
        </Button>
      </div>
    </div>
  )
}

function ChecklistRow({ item, studentId, canEdit, highlight }: { item: RoadmapItem; studentId: string; canEdit: boolean; highlight: boolean }) {
  const { t } = useTranslation()
  const loc = useLocalized()
  const qc = useQueryClient()
  const toast = useToast()
  const [noteOpen, setNoteOpen] = useState(false)
  const [note, setNote] = useState(item.note ?? '')
  const editable = canEdit && !item.auto_done

  const save = useMutation({
    mutationFn: async (v: { status: Status; note: string | null }) => {
      const { error } = await supabase!.rpc('set_scholarship_item', {
        p_student_id: studentId,
        p_item_id: item.id,
        p_status: v.status,
        p_note: v.note,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scholarship_roadmap'] })
      setNoteOpen(false)
    },
    onError: (e) => toast(errorMessage(e, t), 'error'),
  })

  const help = loc(item, 'help')
  const when = loc(item, 'start_note')
  const deadline = highlight && item.has_deadline && item.status !== 'done'
  return (
    <li className={`space-y-2 px-4 py-3 ${deadline ? 'border-l-4 border-bronze bg-bronze/5' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold break-words">
            {item.source === 'auto' && <Star className="mr-1 inline h-4 w-4 text-bronze" aria-label={t('scholarship.sourceAuto')} />}
            {loc(item, 'title')}
          </p>
          <p className="pt-0.5 text-sm text-navy/70">
            {item.start_grade === 13 ? t('scholarship.grade13') : t('scholarship.fromGrade', { n: item.start_grade })}
            {when && <span className={deadline ? 'font-semibold text-navy' : ''}> · {when}</span>}
          </p>
          {help && <p className="text-sm text-navy/60">{help}</p>}
          <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs text-navy/55">
            <span>
              {item.track === 'common' ? t('scholarship.allTracks') : t(`scholarship.track.${item.track}.name`)} · {t(`scholarship.group.${item.group}`)}
            </span>
            {!item.is_verified && (
              <Badge tone="warn" className="text-xs">
                {t('scholarship.verifying')}
              </Badge>
            )}
          </div>
        </div>
        {!editable && (
          <Badge tone={item.status === 'done' ? 'good' : item.status === 'in_progress' ? 'warn' : undefined}>
            {t(`scholarship.status.${item.status}`)}
          </Badge>
        )}
      </div>

      {editable && (
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={loc(item, 'title')}>
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={item.status === s}
              disabled={save.isPending}
              onClick={() => item.status !== s && save.mutate({ status: s, note: item.note })}
              className={`min-h-9 rounded-full px-3 text-sm font-semibold ${
                item.status === s ? 'bg-navy text-white' : 'bg-white text-navy/70 ring-1 ring-navy/15'
              }`}
            >
              {t(`scholarship.status.${s}`)}
            </button>
          ))}
          <button type="button" className="min-h-9 px-2 text-sm font-semibold text-bronze" onClick={() => setNoteOpen((o) => !o)}>
            {item.note ? t('scholarship.editNote') : t('scholarship.addNote')}
          </button>
        </div>
      )}

      {item.note && !noteOpen && <p className="text-sm whitespace-pre-line text-navy/75">{item.note}</p>}

      {editable && noteOpen && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate({ status: item.status, note: note.trim() || null })
          }}
        >
          <Textarea value={note} maxLength={500} rows={3} onChange={(e) => setNote(e.target.value)} placeholder={t('scholarship.notePlaceholder')} />
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setNoteOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" size="sm" disabled={save.isPending}>
              {t('common.save')}
            </Button>
          </div>
        </form>
      )}
    </li>
  )
}
