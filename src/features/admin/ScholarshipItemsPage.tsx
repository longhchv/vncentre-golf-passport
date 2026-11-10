import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { CrudTable } from '@/features/admin/CrudTable'
import { useLocalized } from '@/lib/i18nField'
import { Badge, Card, TableWrap, td, th } from '@/components/ui/card'

interface ScholarshipItem {
  id: string
  code: string | null
  track: 'common' | 'us' | 'uk' | 'au' | 'asia' | 'vn' | 'hs' | 'career'
  stage: 'primary' | 'lower_secondary' | 'upper_secondary' | 'post_graduation'
  item_group: 'golf' | 'academic' | 'personal' | 'admission'
  start_grade: number | null
  start_note_vi: string | null
  start_note_en: string | null
  has_deadline: boolean
  source_ref: string | null
  is_verified: boolean
  title_vi: string
  title_en: string
  help_vi: string | null
  help_en: string | null
  auto_source: 'courses' | 'competitions' | 'culture_awards' | null
  sort_order: number
  is_active: boolean
}

const TRACKS = ['common', 'us', 'uk', 'au', 'asia', 'vn', 'hs', 'career']

/**
 * Admin · Danh mục Lộ trình học bổng (spec 22). Cấp học tự suy từ "lớp bắt đầu" (trigger CSDL), không chọn tay.
 * Mục chưa xác minh hiện nhãn "Đang xác minh" cho phụ huynh. Nguồn chỉ admin xem. Thống kê: bước 5 của spec.
 */
export function ScholarshipItemsPage() {
  const { t } = useTranslation()
  const loc = useLocalized()
  const opts = (prefix: string, values: string[]) => values.map((v) => ({ value: v, label: t(`${prefix}.${v}`) }))
  const trackLabel = (tr: string) => (tr === 'common' ? t('scholarship.allTracks') : t(`scholarship.track.${tr}.name`))
  return (
    <div className="space-y-3">
      <p className="text-sm text-navy/65">{t('scholarship.adminIntroV2')}</p>
      <ScholarshipStats />
      <CrudTable<ScholarshipItem>
        table="scholarship_checklist_items"
        titleKey="admin.nav.scholarship"
        order="sort_order"
        newDefaults={{ is_active: true, is_verified: false, track: 'common' }}
        columns={[
          { key: 'sort_order', labelKey: 'scholarship.fields.sortOrder' },
          { key: 'code', labelKey: 'scholarship.fields.code', render: (r) => r.code ?? '—' },
          { key: 'track', labelKey: 'scholarship.fields.track', render: (r) => trackLabel(r.track) },
          { key: 'start_grade', labelKey: 'scholarship.fields.startGrade', render: (r) => r.start_grade ?? '—' },
          { key: 'title', labelKey: 'fields.name', render: (r) => loc(r, 'title') },
          { key: 'source_ref', labelKey: 'scholarship.fields.sourceRef', render: (r) => r.source_ref ?? '—' },
          {
            key: 'is_verified',
            labelKey: 'scholarship.fields.verified',
            render: (r) => (r.is_verified ? '✓' : <Badge tone="warn">{t('scholarship.verifying')}</Badge>),
          },
          {
            key: 'auto_source',
            labelKey: 'scholarship.fields.autoSource',
            render: (r) => (r.auto_source ? <Badge tone="good">{t(`scholarship.autoSource.${r.auto_source}`)}</Badge> : '—'),
          },
          { key: 'is_active', labelKey: 'scholarship.fields.active', render: (r) => (r.is_active ? '✓' : '—') },
        ]}
        fields={[
          { name: 'code', labelKey: 'scholarship.fields.code', required: true },
          { name: 'track', labelKey: 'scholarship.fields.track', type: 'select', required: true, options: TRACKS.map((v) => ({ value: v, label: trackLabel(v) })) },
          { name: 'item_group', labelKey: 'scholarship.fields.group', type: 'select', required: true, options: opts('scholarship.group', ['golf', 'academic', 'personal', 'admission']) },
          { name: 'start_grade', labelKey: 'scholarship.fields.startGrade', type: 'number', required: true, hintKey: 'scholarship.fields.startGradeHint' },
          { name: 'title_vi', labelKey: 'scholarship.fields.titleVi', required: true },
          { name: 'title_en', labelKey: 'scholarship.fields.titleEn', required: true },
          { name: 'start_note_vi', labelKey: 'scholarship.fields.startNoteVi' },
          { name: 'start_note_en', labelKey: 'scholarship.fields.startNoteEn' },
          { name: 'has_deadline', labelKey: 'scholarship.fields.hasDeadline', type: 'checkbox' },
          { name: 'help_vi', labelKey: 'scholarship.fields.helpVi', type: 'textarea' },
          { name: 'help_en', labelKey: 'scholarship.fields.helpEn', type: 'textarea' },
          { name: 'source_ref', labelKey: 'scholarship.fields.sourceRef' },
          { name: 'is_verified', labelKey: 'scholarship.fields.verified', type: 'checkbox' },
          { name: 'auto_source', labelKey: 'scholarship.fields.autoSource', type: 'select', hintKey: 'scholarship.fields.autoSourceHint', options: opts('scholarship.autoSource', ['courses', 'competitions', 'culture_awards']) },
          { name: 'sort_order', labelKey: 'scholarship.fields.sortOrder', type: 'number', required: true },
          { name: 'is_active', labelKey: 'scholarship.fields.active', type: 'checkbox' },
        ]}
      />
    </div>
  )
}

interface Stats {
  students_total: number
  students_with_grade: number
  students_with_tracks: number
  by_track: { track: string; students: number }[]
  by_grade: { grade: number; students: number; due: number; done: number; pct: number | null }[]
}

/** Thống kê (spec 22 mục 5): số học viên theo từng hướng; tỉ lệ hoàn thành mục đến hạn theo lớp. */
function ScholarshipStats() {
  const { t } = useTranslation()
  const q = useQuery({
    queryKey: ['scholarship_admin_stats'],
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('scholarship_admin_stats')
      if (error) throw error
      return data as Stats
    },
  })
  if (!q.data) return null
  const s = q.data
  const gradeLabel = (g: number) => (g === 13 ? t('scholarship.grade13') : t('scholarship.gradeN', { n: g }))
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card className="space-y-2 p-4">
        <p className="font-semibold">{t('scholarship.stats.tracksTitle')}</p>
        <p className="text-sm text-navy/65">
          {t('scholarship.stats.summary', { total: s.students_total, grade: s.students_with_grade, tracks: s.students_with_tracks })}
        </p>
        {s.by_track.length ? (
          <ul className="space-y-1 text-sm">
            {s.by_track.map((r) => (
              <li key={r.track} className="flex justify-between gap-2">
                <span>{t(`scholarship.track.${r.track}.name`)}</span>
                <b>{r.students}</b>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-navy/55">—</p>
        )}
      </Card>
      <Card className="space-y-2 p-4">
        <p className="font-semibold">{t('scholarship.stats.gradeTitle')}</p>
        {s.by_grade.length ? (
          <TableWrap>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={th}>{t('scholarship.currentGrade')}</th>
                  <th className={th}>{t('scholarship.stats.students')}</th>
                  <th className={th}>{t('scholarship.stats.doneDue')}</th>
                  <th className={th}>%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy/10">
                {s.by_grade.map((r) => (
                  <tr key={r.grade}>
                    <td className={td}>{gradeLabel(r.grade)}</td>
                    <td className={td}>{r.students}</td>
                    <td className={td}>
                      {r.done}/{r.due}
                    </td>
                    <td className={td}>{r.pct == null ? '—' : `${r.pct}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        ) : (
          <p className="text-sm text-navy/55">{t('scholarship.stats.noGrades')}</p>
        )}
      </Card>
    </div>
  )
}
