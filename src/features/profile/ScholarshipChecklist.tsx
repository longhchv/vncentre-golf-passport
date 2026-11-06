import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ChevronDown, GraduationCap } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/db'
import { useLocalized } from '@/lib/i18nField'
import { Button } from '@/components/ui/button'
import { Badge, Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/form'
import { useToast } from '@/components/ui/toast'

// Spec 15 mục 3.2 / 4 khối 6: Hành trang học bổng. Dữ liệu từ scholarship_checklist (máy chủ kiểm quyền: phụ huynh đã
// xác nhận, chính học viên, admin); ghi qua set_scholarship_item (chỉ phụ huynh đã xác nhận, không đổi mục tự động).

type Status = 'not_started' | 'in_progress' | 'done'
const STATUSES: Status[] = ['not_started', 'in_progress', 'done']

interface ChecklistItem {
  id: string
  group: 'golf' | 'academic' | 'personal'
  title_vi: string
  title_en: string
  help_vi: string | null
  help_en: string | null
  status: Status
  source: 'auto' | 'guardian'
  note: string | null
  updated_at: string | null
}
interface ChecklistStage {
  stage: 'primary' | 'lower_secondary' | 'upper_secondary'
  done_count: number
  total_count: number
  items: ChecklistItem[]
}
interface Checklist {
  student_id: string
  stages: ChecklistStage[]
  can_edit: boolean
}

// Trạng thái mở/thu chỉ nhớ trong phiên trình duyệt (spec 15 mục 4), không lưu máy chủ
function useOpenStages(studentId: string) {
  const key = `scholarship-open:${studentId}`
  const [open, setOpenState] = useState<string[]>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(key) ?? '[]') as string[]
    } catch {
      return []
    }
  })
  const setOpen = (next: string[]) => {
    setOpenState(next)
    try {
      sessionStorage.setItem(key, JSON.stringify(next))
    } catch {
      // trình duyệt chặn bộ nhớ phiên: vẫn chạy, chỉ không nhớ
    }
  }
  return [open, setOpen] as const
}

export function ScholarshipChecklist({ studentId }: { studentId: string }) {
  const { t } = useTranslation()
  const [open, setOpen] = useOpenStages(studentId)
  const q = useQuery({
    queryKey: ['scholarship_checklist', studentId],
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('scholarship_checklist', { p_student_id: studentId })
      if (error) throw error
      return data as Checklist | null
    },
  })
  if (!q.data) return null
  const list = q.data

  const toggle = (stage: string) => setOpen(open.includes(stage) ? open.filter((s) => s !== stage) : [...open, stage])

  return (
    <section id="athlete-scholarship" className="scroll-mt-20 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <GraduationCap className="h-5 w-5 text-bronze" aria-hidden /> {t('scholarship.title')}
        </h2>
        {open.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setOpen([])}>
            {t('scholarship.collapseAll')}
          </Button>
        )}
      </div>
      <p className="text-sm text-navy/70">{t('scholarship.intro')}</p>

      {list.stages.map((st) => {
        const isOpen = open.includes(st.stage)
        return (
          <Card key={st.stage} className="overflow-hidden">
            <button
              type="button"
              onClick={() => toggle(st.stage)}
              aria-expanded={isOpen}
              className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left"
            >
              <span className="font-semibold">{t(`scholarship.stage.${st.stage}`)}</span>
              <span className="flex shrink-0 items-center gap-2 text-sm text-navy/65">
                {t('scholarship.doneOf', { done: st.done_count, total: st.total_count })}
                <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden />
              </span>
            </button>
            {isOpen && (
              <ul className="divide-y divide-navy/10 border-t border-navy/10">
                {st.items.map((it) => (
                  <ChecklistRow key={it.id} item={it} studentId={list.student_id} canEdit={list.can_edit} />
                ))}
              </ul>
            )}
          </Card>
        )
      })}
    </section>
  )
}

function ChecklistRow({ item, studentId, canEdit }: { item: ChecklistItem; studentId: string; canEdit: boolean }) {
  const { t } = useTranslation()
  const loc = useLocalized()
  const qc = useQueryClient()
  const toast = useToast()
  const [noteOpen, setNoteOpen] = useState(false)
  const [note, setNote] = useState(item.note ?? '')
  const editable = canEdit && item.source === 'guardian'

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
      qc.invalidateQueries({ queryKey: ['scholarship_checklist'] })
      setNoteOpen(false)
    },
    onError: (e) => toast(errorMessage(e, t), 'error'),
  })

  const help = loc(item, 'help')
  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-semibold break-words">{loc(item, 'title')}</p>
          {help && <p className="text-sm text-navy/60">{help}</p>}
          <p className="pt-1 text-xs text-navy/55">
            {t(`scholarship.group.${item.group}`)} ·{' '}
            {item.source === 'auto' ? t('scholarship.sourceAuto') : t('scholarship.sourceGuardian')}
          </p>
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
