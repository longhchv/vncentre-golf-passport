import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Trophy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { callRpc } from '@/features/partners/shared'
import { newId, vnToday, type LiveBoard, type LiveStudent } from './queue'

// Trình chiếu cho các con (việc 4): bảng điểm trực tiếp trên điện thoại / máy tính bảng, tự làm mới vài giây một lần.
// Theo cá nhân (xếp hạng điểm hôm nay) hoặc theo 2 đội. Không logo (dùng trong trường Vinschool).

type View = 'people' | 'teams'

function shortName(full: string) {
  const parts = full.trim().split(/\s+/)
  return parts.length > 1 ? parts.slice(-2).join(' ') : full
}

export function ShowPage() {
  const { classId = '' } = useParams()
  const { t } = useTranslation()
  const qc = useQueryClient()
  const today = vnToday()
  const [view, setView] = useState<View>('people')
  const [showTotal, setShowTotal] = useState(true)
  const [arranging, setArranging] = useState(false)
  const board = useQuery({
    queryKey: ['live-board', classId, today],
    queryFn: () => callRpc<LiveBoard>('class_live_board', { p_class_id: classId, p_date: today }),
    refetchInterval: 4000,
  })

  const setTeam = async (s: LiveStudent) => {
    const next = s.team === 'A' ? 'B' : s.team === 'B' ? null : 'A'
    await callRpc('class_live_sync', {
      p_ops: [{ op: 'mark', id: newId(), class_id: classId, date: today, student_id: s.id, team: next }],
    })
    await qc.invalidateQueries({ queryKey: ['live-board', classId] })
  }

  if (!board.data) {
    return <div className="flex min-h-dvh items-center justify-center bg-navy text-white/70">{t('common.loading')}</div>
  }
  const students = board.data.students.filter((s) => s.attendance !== 'absent')
  const ranked = [...students].sort((a, b) => b.today - a.today || b.total - a.total || a.full_name.localeCompare(b.full_name))
  const team = (k: 'A' | 'B') => students.filter((s) => s.team === k)
  const teamScore = (k: 'A' | 'B') => team(k).reduce((n, s) => n + s.today, 0)
  const sessionNo = board.data.session?.session_no ?? board.data.next_session_no

  return (
    <div className="min-h-dvh bg-navy px-4 py-4 text-white select-none">
      <div className="mb-3 flex items-center gap-2">
        <Link to={`/coach/live/${classId}`} aria-label={t('common.back')} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <p className="min-w-0 flex-1 truncate text-lg font-bold">
          {board.data.class.name} · {t('classLive.session.no', { no: sessionNo })}
        </p>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {(['people', 'teams'] as const).map((k) => (
          <button key={k} type="button" onClick={() => setView(k)}
            className={cn('min-h-10 rounded-full px-4 text-sm font-semibold', view === k ? 'bg-gold text-navy' : 'bg-white/10')}>
            {t(`classLive.show.${k}`)}
          </button>
        ))}
        {view === 'people' ? (
          <button type="button" onClick={() => setShowTotal(!showTotal)} className="min-h-10 rounded-full bg-white/10 px-4 text-sm font-semibold">
            {showTotal ? t('classLive.show.hideTotal') : t('classLive.show.showTotal')}
          </button>
        ) : (
          <button type="button" onClick={() => setArranging(!arranging)}
            className={cn('min-h-10 rounded-full px-4 text-sm font-semibold', arranging ? 'bg-gold text-navy' : 'bg-white/10')}>
            {t('classLive.show.arrange')}
          </button>
        )}
      </div>

      {view === 'people' ? (
        <ol className="space-y-2">
          {ranked.map((s, i) => (
            <li key={s.id} className={cn('flex items-center gap-4 rounded-2xl px-4 py-3', i === 0 && s.today > 0 ? 'bg-gold text-navy' : 'bg-white/10')}>
              <span className="w-10 shrink-0 text-center text-3xl font-extrabold tabular-nums">{i === 0 && s.today > 0 ? <Trophy className="mx-auto h-8 w-8" /> : i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-2xl font-bold sm:text-3xl">{shortName(s.full_name)}</span>
                {showTotal && <span className="block text-base tabular-nums opacity-80">{t('classLive.show.total', { n: s.total })}</span>}
              </span>
              <span className="text-5xl font-extrabold tabular-nums">{s.today}</span>
            </li>
          ))}
        </ol>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {(['A', 'B'] as const).map((k) => {
              const win = teamScore(k) > teamScore(k === 'A' ? 'B' : 'A')
              return (
                <div key={k} className={cn('rounded-3xl p-4 text-center', win ? 'bg-gold text-navy' : 'bg-white/10')}>
                  <p className="text-2xl font-bold">{t('classLive.show.team', { k })}</p>
                  <p className="text-7xl font-extrabold tabular-nums">{teamScore(k)}</p>
                  <ul className="mt-2 space-y-1 text-lg">
                    {team(k).map((s) => (
                      <li key={s.id} className="flex justify-between gap-2"><span className="truncate">{shortName(s.full_name)}</span><span className="tabular-nums">{s.today}</span></li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
          {arranging && (
            <div className="space-y-2 rounded-2xl bg-white/10 p-3">
              <p className="text-sm opacity-80">{t('classLive.show.arrangeHint')}</p>
              <div className="flex flex-wrap gap-2">
                {students.map((s) => (
                  <button key={s.id} type="button" onClick={() => void setTeam(s)}
                    className={cn('min-h-11 rounded-full px-4 font-semibold',
                      s.team === 'A' ? 'bg-sky-400 text-navy' : s.team === 'B' ? 'bg-rose-400 text-navy' : 'bg-white/20')}>
                    {shortName(s.full_name)} {s.team ? `· ${s.team}` : ''}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
