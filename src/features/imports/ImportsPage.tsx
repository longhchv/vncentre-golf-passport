import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { useTable } from '@/lib/db'
import { formatDateTime } from '@/lib/i18nField'
import { Badge, Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { ClassRow, School } from '@/lib/types'
import { StudentListImport, type ImportBatch } from './StudentListImport'
import { HistoryImport } from './HistoryImport'

type Tab = 'student_list' | 'course_history'

/** Admin · Nhập dữ liệu (F10; lịch sử khoá học F12 ở Bước 9). */
export function ImportsPage() {
  const { t, i18n } = useTranslation()
  const [tab, setTab] = useState<Tab>('student_list')
  const [session, setSession] = useState<{ key: number; batch?: ImportBatch }>({ key: 0 })
  const schools = useTable<School>('schools', { order: 'name' })
  const classes = useTable<ClassRow>('classes', { order: 'name' })
  const schoolName = new Map((schools.data ?? []).map((s) => [s.id, s.short_name || s.name]))
  const className = new Map((classes.data ?? []).map((c) => [c.id, c.name]))

  const batches = useQuery({
    queryKey: ['import_batches'],
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('import_batches')
        .select('*')
        .eq('type', 'student_list')
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) throw error
      return data as ImportBatch[]
    },
  })

  const restart = (batch?: ImportBatch) => {
    setSession((s) => ({ key: s.key + 1, batch }))
    window.scrollTo({ top: 0 })
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">{t('admin.nav.imports')}</h1>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {(['student_list', 'course_history'] as Tab[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={cn(
              'min-h-10 shrink-0 rounded-full px-4 text-sm font-semibold',
              tab === k ? 'bg-navy text-white' : 'bg-white text-navy/70 ring-1 ring-navy/15',
            )}
          >
            {t(`import.tab.${k}`)}
          </button>
        ))}
      </div>

      {tab === 'course_history' ? (
        <HistoryImport mode="center" />
      ) : (
        <>
          <StudentListImport key={session.key} resumeBatch={session.batch} onFinished={() => restart()} />

          <section className="space-y-3 pt-4">
            <h2 className="text-lg font-bold">{t('import.history')}</h2>
            {batches.data?.length === 0 && <p className="text-navy/50">{t('common.empty')}</p>}
            <ul className="space-y-2">
              {batches.data?.map((b) => (
                <li key={b.id}>
                  <button type="button" className="w-full text-left" onClick={() => restart(b)}>
                    <Card className="flex flex-wrap items-center justify-between gap-2 p-3 hover:border-bronze">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{b.file_name}</p>
                        <p className="text-sm text-navy/60">
                          {[b.school_id && schoolName.get(b.school_id), b.class_id && className.get(b.class_id), formatDateTime(b.created_at, i18n.language)]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                        {b.status === 'committed' && b.totals && (
                          <p className="text-sm text-navy/60">
                            {t('import.historyTotals', {
                              created: b.totals.created ?? 0,
                              updated: b.totals.updated ?? 0,
                              errors: b.totals.errors ?? 0,
                            })}
                          </p>
                        )}
                      </div>
                      <Badge tone={b.status === 'committed' ? 'good' : b.status === 'cancelled' ? 'neutral' : 'warn'}>
                        {t(`import.batchStatus.${b.status}`)}
                      </Badge>
                    </Card>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  )
}
