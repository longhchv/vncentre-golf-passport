import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import QRCode from 'qrcode'
import {
  ArrowLeft,
  Camera,
  Check,
  CheckCheck,
  CloudOff,
  Loader2,
  Mic,
  MicOff,
  Minus,
  MonitorPlay,
  Pencil,
  Send,
  Plus,
  Undo2,
  UserPlus,
  Users,
  X,
  Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/i18nField'
import { compressImage } from '@/lib/compressImage'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { Field, FormError, Input, Textarea } from '@/components/ui/form'
import { useToast } from '@/components/ui/toast'
import { callRpc } from '@/features/partners/shared'
import { buzz, burstAt, playScore } from './effects'
import { GiftsPanel } from './GiftsPanel'
import {
  COMMENT_TAGS,
  POINT_TAGS,
  applyPending,
  loadCachedBoard,
  loadQueue,
  newId,
  remainingToday,
  rollToDate,
  saveCachedBoard,
  saveQueue,
  vnToday,
  type Attendance,
  type CommentTag,
  type LiveBoard,
  type LiveOp,
  type LiveStudent,
  type MinusTag,
  type PointTag,
} from './queue'

// Lớp học trực tiếp (yêu cầu 27/11/2026, việc 1, 2, 3, 5): HLV dùng một điện thoại, một tay, ngoài sân.
// Màn hình không hiện logo (dùng được trong trường Vinschool). Mất mạng vẫn chấm được: thao tác nằm trong hàng đợi
// trên máy và tự gửi khi có mạng lại.

type SyncState = 'idle' | 'syncing' | 'offline' | 'error'
type Mode = 'quick' | 'one' | 'team'
interface SyncResult {
  applied: number
  skipped: { index: number; reason: string }[]
}

const ERRORS = ['name_required', 'duplicate_in_class', 'invalid_dob', 'invalid_photo', 'forbidden', 'points_out_of_range']
function errorKey(e: unknown) {
  const msg = (e as { message?: string } | null)?.message ?? ''
  return ERRORS.includes(msg) ? `classLive.errors.${msg}` : 'errors.generic'
}

/** Hàng đợi thao tác: lưu trên máy, gửi ngay khi có mạng, gửi lại khi mạng về hoặc mỗi 10 giây. */
function useLiveQueue(onSynced: () => Promise<unknown>) {
  const { t } = useTranslation()
  const toast = useToast()
  const [ops, setOps] = useState<LiveOp[]>(loadQueue)
  const [state, setState] = useState<SyncState>('idle')
  const opsRef = useRef(ops)
  const busy = useRef(false)
  const syncedRef = useRef(onSynced)
  syncedRef.current = onSynced

  const persist = useCallback((next: LiveOp[]) => {
    opsRef.current = next
    saveQueue(next)
    setOps(next)
  }, [])

  const flush = useCallback(async () => {
    if (busy.current || opsRef.current.length === 0) return
    if (!navigator.onLine) {
      setState('offline')
      return
    }
    busy.current = true
    setState('syncing')
    const batch = opsRef.current.slice(0, 200)
    let ok = false
    try {
      const res = await callRpc<SyncResult>('class_live_sync', { p_ops: batch })
      // Lấy lại bảng điểm trước khi bỏ các thao tác đã gửi → số trên thẻ không nhảy lùi
      await syncedRef.current().catch(() => undefined)
      const sent = new Set(batch.map((o) => o.id))
      persist(opsRef.current.filter((o) => !sent.has(o.id)))
      if (res.skipped.length > 0) {
        const n = (r: string) => res.skipped.filter((x) => x.reason === r).length
        const other = res.skipped.length - n('below_zero') - n('session_cap')
        if (n('below_zero')) toast(t('classLive.sync.belowZero', { count: n('below_zero') }), 'error')
        if (n('session_cap')) toast(t('classLive.sync.cap', { count: n('session_cap') }), 'error')
        if (other) toast(t('classLive.sync.skipped', { count: other }), 'error')
      }
      setState('idle')
      ok = true
    } catch {
      setState(navigator.onLine ? 'error' : 'offline')
    } finally {
      busy.current = false
    }
    if (ok && opsRef.current.length > 0) void flush()
  }, [persist, t, toast])

  const enqueue = useCallback(
    (items: LiveOp | LiveOp[]) => {
      persist([...opsRef.current, ...(Array.isArray(items) ? items : [items])])
      void flush()
    },
    [flush, persist],
  )

  useEffect(() => {
    const retry = () => void flush()
    window.addEventListener('online', retry)
    document.addEventListener('visibilitychange', retry)
    const timer = window.setInterval(retry, 10_000)
    void flush()
    return () => {
      window.removeEventListener('online', retry)
      document.removeEventListener('visibilitychange', retry)
      window.clearInterval(timer)
    }
  }, [flush])

  return { ops, state, enqueue, flush }
}

const AVATAR_COLORS = ['bg-gold/40', 'bg-sky-200', 'bg-emerald-200', 'bg-rose-200', 'bg-violet-200', 'bg-amber-200']

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  return (parts.length > 1 ? parts[parts.length - 2][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2)).toUpperCase()
}

function Avatar({ s, size = 'h-16 w-16 text-xl' }: { s: Pick<LiveStudent, 'id' | 'full_name' | 'avatar_url'>; size?: string }) {
  if (s.avatar_url) return <img src={s.avatar_url} alt="" className={cn('shrink-0 rounded-full object-cover', size)} />
  const color = AVATAR_COLORS[[...s.id].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length]
  return (
    <span className={cn('flex shrink-0 items-center justify-center rounded-full font-bold text-navy', color, size)}>
      {initials(s.full_name)}
    </span>
  )
}

/** Tên gọi trên thẻ: tên riêng (chữ cuối), đủ to để các con nhìn thấy. */
function shortName(full: string) {
  const parts = full.trim().split(/\s+/)
  return parts.length > 1 ? parts.slice(-2).join(' ') : full
}

export function LiveClassPage() {
  const { classId = '' } = useParams()
  const { t, i18n } = useTranslation()
  const toast = useToast()
  const qc = useQueryClient()
  const today = vnToday()
  const [cached] = useState(() => loadCachedBoard(classId))

  const board = useQuery({
    queryKey: ['live-board', classId, today],
    queryFn: () => callRpc<LiveBoard>('class_live_board', { p_class_id: classId, p_date: today }),
    initialData: cached ? rollToDate(cached, today) : undefined,
    initialDataUpdatedAt: 0,
    refetchInterval: 60_000,
  })
  useEffect(() => {
    if (board.data && board.isFetchedAfterMount) saveCachedBoard(board.data)
  }, [board.data, board.isFetchedAfterMount])

  const refetch = useCallback(() => qc.refetchQueries({ queryKey: ['live-board', classId] }), [qc, classId])
  const queue = useLiveQueue(refetch)
  const view = useMemo(() => (board.data ? applyPending(board.data, queue.ops) : undefined), [board.data, queue.ops])

  const [openId, setOpenId] = useState<string | null>(null)
  // Cách chấm: từng bạn (mở thẻ), cả đội (chọn nhiều bạn), chấm nhanh (nút ngay trên hàng của từng bạn). Nhớ theo lớp.
  const modeKey = `vnc-live-mode:${classId}`
  const [savedMode, setSavedMode] = useState<Mode | null>(() => {
    try {
      const v = localStorage.getItem(modeKey)
      return v === 'one' || v === 'team' || v === 'quick' ? v : null
    } catch {
      return null
    }
  })
  const chooseMode = (m: Mode) => {
    setSavedMode(m)
    setPicked(new Set())
    try {
      localStorage.setItem(modeKey, m)
    } catch {
      // bộ nhớ trình duyệt bị chặn: chỉ không nhớ được lựa chọn
    }
  }
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [tag, setTag] = useState<PointTag | null>(null)
  const [adding, setAdding] = useState(false)
  const [editingSession, setEditingSession] = useState(false)
  // Các lần chấm trong phiên này (mới nhất ở cuối) để hoàn tác đúng số điểm vừa bấm
  const history = useRef<{ ids: string[]; delta: number }[]>([])
  const [, setHistoryTick] = useState(0)

  const score = useCallback(
    (all: string[], delta: number, minusTag: MinusTag = 'fix') => {
      if (!view) return
      // Cộng: bỏ các bạn đã chạm trần của buổi. Trừ: bỏ các bạn không đủ điểm buổi (máy chủ cũng chặn).
      const ids = all.filter((sid) => {
        const s = view.students.find((x) => x.id === sid)
        if (!s) return false
        return delta > 0 ? delta <= remainingToday(view, s) : s.today + delta >= 0
      })
      if (ids.length < all.length) {
        toast(
          delta > 0
            ? t('classLive.cap.reached', { count: all.length - ids.length, cap: view.rules?.session_cap })
            : t('classLive.sync.belowZero', { count: all.length - ids.length }),
          'error',
        )
      }
      if (ids.length === 0) return
      const ops: LiveOp[] = ids.map((sid) => ({
        op: 'points',
        id: newId(),
        class_id: classId,
        date: today,
        student_id: sid,
        delta,
        tag: delta < 0 ? minusTag : tag,
      }))
      queue.enqueue(ops)
      if (delta > 0) {
        history.current.push({ ids: [...ids], delta })
        setHistoryTick((n) => n + 1)
      }
      playScore(delta)
      buzz(delta > 0 ? 30 : 60)
      ids.forEach((sid, i) => {
        // Phần tử cuối cùng: thẻ trong bảng chấm, hoặc đầu bảng chấm của bạn đó khi đang mở
        const els = document.querySelectorAll(`[data-sid="${sid}"]`)
        window.setTimeout(() => burstAt(els[els.length - 1] ?? null, delta), i * 60)
      })
    },
    [classId, queue, tag, today, view, t, toast],
  )

  /** Lần chấm gần nhất còn hoàn tác được của một bạn (null nếu không có). */
  const lastFor = (sid: string) => {
    for (let i = history.current.length - 1; i >= 0; i--) if (history.current[i].ids.includes(sid)) return i
    return null
  }
  const undoOne = (sid: string) => {
    const i = lastFor(sid)
    if (i === null) return
    const h = history.current[i]
    h.ids = h.ids.filter((x) => x !== sid)
    if (h.ids.length === 0) history.current.splice(i, 1)
    score([sid], -h.delta)
  }
  const undoTeam = () => {
    const h = history.current.pop()
    if (h) score(h.ids, -h.delta)
  }

  const mark = useCallback(
    (sid: string, patch: Omit<Extract<LiveOp, { op: 'mark' }>, 'op' | 'id' | 'class_id' | 'date' | 'student_id'>) =>
      queue.enqueue({ op: 'mark', id: newId(), class_id: classId, date: today, student_id: sid, ...patch }),
    [classId, queue, today],
  )

  if (!view) {
    if (board.isError) {
      return (
        <Shell>
          <Card className="m-4 space-y-3 p-6 text-center">
            <p className="font-semibold">{t('classLive.loadFailed')}</p>
            <Link to="/coach" className="font-semibold text-bronze">
              {t('coach.myClasses')}
            </Link>
          </Card>
        </Shell>
      )
    }
    return (
      <Shell>
        <p className="p-6 text-center text-navy/60">{t('common.loading')}</p>
      </Shell>
    )
  }

  const steps = view.steps?.length ? view.steps : DEFAULT_STEPS
  const students = view.students
  // Chưa chọn: lớp ít học viên (≤ 10) mở thẳng màn chấm nhanh
  const mode: Mode = savedMode ?? (students.length <= 10 ? 'quick' : 'one')
  const team = mode === 'team'
  const open = students.find((s) => s.id === openId) ?? null
  const sessionNo = view.session?.session_no ?? view.next_session_no
  const unmarked = students.filter((s) => !s.attendance)

  return (
    <Shell>
      <header className="sticky top-0 z-20 space-y-2 border-b border-navy/10 bg-cream/95 px-3 pt-2 pb-2 backdrop-blur" style={{ paddingTop: 'calc(0.5rem + env(safe-area-inset-top, 0px))' }}>
        <div className="flex items-center gap-2">
          <Link to={`/coach/classes/${classId}`} aria-label={t('common.back')} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-navy/5">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg leading-tight font-bold">{view.class.name}</p>
            <p className="text-sm text-navy/60">{formatDate(view.date, i18n.language)}</p>
          </div>
          <SyncPill state={queue.state} pending={queue.ops.length} onRetry={() => void queue.flush()} />
          <Link to={`/coach/live/${classId}/show`} aria-label={t('classLive.show.open')} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white ring-1 ring-navy/10">
            <MonitorPlay className="h-5 w-5 text-bronze" />
          </Link>
        </div>
        <button
          type="button"
          onClick={() => setEditingSession(true)}
          className="flex min-h-11 w-full items-center gap-2 rounded-xl bg-white px-3 text-left ring-1 ring-navy/10"
        >
          <span className="font-semibold whitespace-nowrap">{t('classLive.session.no', { no: sessionNo })}</span>
          <span className="min-w-0 flex-1 truncate text-navy/70">
            {view.session?.topic ||
              (view.topics?.[sessionNo - 1] ? t('classLive.session.suggest', { topic: view.topics[sessionNo - 1] }) : t('classLive.session.addTopic'))}
          </span>
          {view.rules && (
            <span className="shrink-0 rounded-full bg-gold/20 px-2 py-0.5 text-xs font-semibold text-navy/80">
              {t('classLive.cap.short', { cap: view.rules.session_cap })}
            </span>
          )}
          <Pencil className="h-4 w-4 shrink-0 text-bronze" />
        </button>
        <div className="flex gap-2">
          <button type="button" onClick={() => chooseMode('quick')} className={segClass(mode === 'quick')}>
            <Zap className="h-4 w-4" /> {t('classLive.mode.quick')}
          </button>
          <button type="button" onClick={() => chooseMode('one')} className={segClass(mode === 'one')}>
            {t('classLive.mode.one')}
          </button>
          <button type="button" onClick={() => chooseMode('team')} className={segClass(team)}>
            <Users className="h-4 w-4" /> {t('classLive.mode.team')}
          </button>
        </div>
      </header>

      <main className={cn('px-3 pt-3', team ? 'pb-96' : mode === 'quick' ? 'pb-24' : 'pb-28')}>
        {students.length === 0 ? (
          <Card className="space-y-3 p-6 text-center">
            <p>{t('classLive.empty')}</p>
            <Button onClick={() => setAdding(true)}>
              <UserPlus className="h-5 w-5" /> {t('classLive.add.button')}
            </Button>
          </Card>
        ) : mode === 'quick' ? (
          <QuickBoard
            students={students}
            steps={steps}
            tag={tag}
            onTag={setTag}
            remaining={(s) => remainingToday(view, s)}
            onScore={(sid, d) => (d > 0 ? score([sid], d) : score([sid], d, 'penalty'))}
            onOpen={setOpenId}
          />
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {students.map((s) => (
              <li key={s.id}>
                <StudentCard
                  s={s}
                  selected={team && picked.has(s.id)}
                  team={team}
                  onTap={() => {
                    if (!team) return setOpenId(s.id)
                    setPicked((prev) => {
                      const next = new Set(prev)
                      if (next.has(s.id)) next.delete(s.id)
                      else next.add(s.id)
                      return next
                    })
                  }}
                />
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <UserPlus className="h-4 w-4" /> {t('classLive.add.button')}
          </Button>
          {unmarked.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => unmarked.forEach((s) => mark(s.id, { attendance: 'present' }))}
            >
              <CheckCheck className="h-4 w-4" /> {t('classLive.attendance.allPresent', { count: unmarked.length })}
            </Button>
          )}
          {students.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              disabled={Boolean(view.session?.summary_sent_at) || queue.ops.length > 0}
              onClick={async () => {
                if (!window.confirm(t('classLive.summary.confirm'))) return
                try {
                  const n = await callRpc<number>('class_live_send_summary', { p_class_id: classId, p_date: today })
                  toast(t('classLive.summary.sent', { count: n }))
                  await refetch()
                } catch (e) {
                  const m = (e as { message?: string }).message ?? ''
                  toast(m === 'no_session' ? t('classLive.summary.noSession') : navigator.onLine ? t('errors.generic') : t('classLive.needOnline'), 'error')
                }
              }}
            >
              <Send className="h-4 w-4" /> {view.session?.summary_sent_at ? t('classLive.summary.done') : t('classLive.summary.button')}
            </Button>
          )}
        </div>
      </main>

      {mode === 'quick' && students.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-2 border-t border-navy/10 bg-white px-3 pt-2" style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))' }}>
          <p className="min-w-0 flex-1 text-sm text-navy/65">{t('classLive.quick.hint')}</p>
          <button
            type="button"
            disabled={!history.current.length}
            onClick={undoTeam}
            className="flex min-h-12 shrink-0 items-center gap-1 rounded-xl px-4 font-bold text-red-700 ring-1 ring-red-200 disabled:opacity-40"
          >
            <Undo2 className="h-4 w-4" />
            {history.current.length ? `${t('classLive.undo')} −${history.current.at(-1)!.delta}` : t('classLive.undo')}
          </button>
        </div>
      )}

      {team && (
        <TeamBar
          count={picked.size}
          total={students.length}
          tag={tag}
          onTag={setTag}
          onAll={() => setPicked(picked.size === students.length ? new Set() : new Set(students.map((s) => s.id)))}
          steps={steps}
          remaining={Math.max(0, ...students.filter((s) => picked.has(s.id)).map((s) => remainingToday(view, s)))}
          minusMax={Math.max(0, ...students.filter((s) => picked.has(s.id)).map((s) => s.today))}
          onScore={(d) => picked.size > 0 && (d > 0 ? score([...picked], d) : score([...picked], d, 'penalty'))}
          undo={history.current.at(-1)?.delta ?? null}
          onUndo={undoTeam}
        />
      )}

      {open && (
        <StudentSheet
          key={open.id}
          s={open}
          classId={classId}
          tag={tag}
          onTag={setTag}
          steps={steps}
          remaining={remainingToday(view, open)}
          minusMax={open.today}
          cap={view.rules?.session_cap ?? null}
          attendancePoints={view.rules?.attendance_points ?? 0}
          onScore={(d) => (d > 0 ? score([open.id], d) : score([open.id], d, 'penalty'))}
          undo={(() => {
            const i = lastFor(open.id)
            return i === null ? null : history.current[i].delta
          })()}
          onUndo={() => undoOne(open.id)}
          onMark={(patch) => mark(open.id, patch)}
          onClose={() => setOpenId(null)}
          onChanged={refetch}
        />
      )}

      <AddStudentDialog open={adding} classId={classId} onClose={() => setAdding(false)} onCreated={refetch} />
      <SessionDialog
        open={editingSession}
        no={sessionNo}
        topic={view.session?.topic ?? ''}
        lastTopic={view.last_topic}
        topics={view.topics ?? []}
        onClose={() => setEditingSession(false)}
        onSave={(no, topic) => {
          queue.enqueue({ op: 'topic', id: newId(), class_id: classId, date: today, session_no: no, topic })
          setEditingSession(false)
        }}
      />
    </Shell>
  )
}

/** Khung toàn màn hình, không có thanh menu và logo của app. */
function Shell({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh bg-cream text-navy select-none">{children}</div>
}

const segClass = (on: boolean) =>
  cn(
    'flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl text-sm font-semibold',
    on ? 'bg-navy text-white' : 'bg-white text-navy/70 ring-1 ring-navy/15',
  )

function SyncPill({ state, pending, onRetry }: { state: SyncState; pending: number; onRetry: () => void }) {
  const { t } = useTranslation()
  if (pending === 0 && state !== 'offline') {
    return (
      <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-800">
        <Check className="h-3.5 w-3.5" /> {t('classLive.sync.saved')}
      </span>
    )
  }
  return (
    <button
      type="button"
      onClick={onRetry}
      className={cn(
        'flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold',
        state === 'syncing' ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-900',
      )}
    >
      {state === 'syncing' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CloudOff className="h-3.5 w-3.5" />}
      {t('classLive.sync.pending', { count: pending })}
    </button>
  )
}

function StudentCard({ s, selected, team, onTap }: { s: LiveStudent; selected: boolean; team: boolean; onTap: () => void }) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      data-sid={s.id}
      onClick={onTap}
      className={cn(
        'relative flex w-full flex-col items-center gap-1 rounded-2xl border-2 bg-white px-2 pt-3 pb-2 text-center shadow-sm active:scale-[.98]',
        selected ? 'border-bronze ring-4 ring-gold/40' : 'border-transparent',
        s.attendance === 'absent' && 'opacity-55',
      )}
    >
      {team && (
        <span className={cn('absolute top-2 left-2 flex h-7 w-7 items-center justify-center rounded-full border-2', selected ? 'border-bronze bg-bronze text-white' : 'border-navy/25 bg-white')}>
          {selected && <Check className="h-4 w-4" />}
        </span>
      )}
      {s.attendance && s.attendance !== 'present' && (
        <span className={cn('absolute top-2 right-2 rounded-full px-2 py-0.5 text-xs font-semibold', s.attendance === 'late' ? 'bg-amber-100 text-amber-900' : 'bg-navy/10 text-navy/70')}>
          {t(`classLive.attendance.${s.attendance}`)}
        </span>
      )}
      <Avatar s={s} />
      <p className="line-clamp-1 w-full text-base font-bold">{shortName(s.full_name)}</p>
      <p className="text-4xl leading-none font-extrabold text-bronze tabular-nums">{s.today}</p>
      <p className="text-xs text-navy/50">{t('classLive.card.today')}</p>
      <div className="mt-1 grid w-full grid-cols-2 gap-1 text-xs">
        <span className="rounded-lg bg-navy/5 py-1">
          <span className="block font-bold text-navy tabular-nums">{s.total}</span>
          {t('classLive.card.total')}
        </span>
        <span className="rounded-lg bg-gold/20 py-1">
          <span className="block font-bold text-navy tabular-nums">{s.available}</span>
          {t('classLive.card.available')}
        </span>
      </div>
    </button>
  )
}

function TagChips({ tag, onTag }: { tag: PointTag | null; onTag: (t: PointTag | null) => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap gap-1.5">
      {POINT_TAGS.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => onTag(tag === k ? null : k)}
          className={cn(
            'min-h-10 rounded-full px-3 text-sm font-semibold whitespace-nowrap',
            tag === k ? 'bg-navy text-white' : 'bg-white text-navy ring-1 ring-navy/15',
          )}
        >
          {t(`classLive.tagShort.${k}`)}
        </button>
      ))}
    </div>
  )
}

const DEFAULT_STEPS = [1, 5, 10, 20, 30, 40, 50]

/** Các mức điểm (cài đặt class_live.point_steps) và nút hoàn tác lần chấm gần nhất. */
function ScoreButtons({
  steps,
  remaining,
  minusMax,
  onScore,
  undo,
  onUndo,
  disabled,
}: {
  steps: number[]
  /** Điểm còn được cộng trong buổi: nút vượt quá thì mờ đi */
  remaining: number
  /** Điểm buổi hiện có: trừ quá số này thì mờ đi (điểm buổi không xuống dưới 0) */
  minusMax: number
  /** d > 0: cộng; d < 0: trừ điểm (phạt) */
  onScore: (d: number) => void
  undo: number | null
  onUndo: () => void
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const [minus, setMinus] = useState(false)
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button type="button" onClick={() => setMinus(false)} className={cn(segClass(!minus), 'min-h-9')}>
          <Plus className="h-4 w-4" /> {t('classLive.sign.plus')}
        </button>
        <button
          type="button"
          onClick={() => setMinus(true)}
          className={cn(segClass(false), 'min-h-9', minus && 'bg-red-700 text-white ring-red-700')}
        >
          <Minus className="h-4 w-4" /> {t('classLive.sign.minus')}
        </button>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {steps.map((d) => (
          <button
            key={d}
            type="button"
            disabled={disabled || (minus ? d > minusMax : d > remaining)}
            onClick={() => onScore(minus ? -d : d)}
            className={cn(
              'h-16 rounded-2xl text-2xl font-extrabold shadow active:scale-95 disabled:opacity-40',
              minus ? 'bg-white text-red-700 ring-2 ring-red-300' : 'bg-linear-to-b from-gold to-bronze text-navy',
            )}
          >
            {minus ? '−' : '+'}
            {d}
          </button>
        ))}
        <button
          type="button"
          disabled={undo === null}
          onClick={onUndo}
          aria-label={t('classLive.fix')}
          className={cn(
            'flex h-16 flex-col items-center justify-center rounded-2xl bg-white font-bold text-red-700 ring-1 ring-red-200 active:scale-95 disabled:opacity-40',
            steps.length % 4 === 2 ? 'col-span-2' : steps.length % 4 === 0 ? 'col-span-4' : '',
          )}
        >
          <span className="text-lg">{undo === null ? t('classLive.undo') : `−${undo}`}</span>
          <span className="text-[11px] font-semibold">{undo === null ? t('classLive.undoNone') : t('classLive.undo')}</span>
        </button>
      </div>
    </div>
  )
}

/**
 * Chấm nhanh cả lớp trên một màn (lớp ít học viên): mỗi bạn một hàng có sẵn nút cộng và nút trừ điểm theo
 * các mức trong cài đặt. Bấm là gửi ngay. Chạm tên để mở thẻ của bạn đó (điểm danh, nhận xét, hồ sơ).
 */
function QuickBoard({
  students,
  steps,
  tag,
  onTag,
  remaining,
  onScore,
  onOpen,
}: {
  students: LiveStudent[]
  steps: number[]
  tag: PointTag | null
  onTag: (t: PointTag | null) => void
  remaining: (s: LiveStudent) => number
  onScore: (sid: string, d: number) => void
  onOpen: (sid: string) => void
}) {
  const { t } = useTranslation()
  const cols = { gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <p className="text-xs font-semibold text-navy/60">{t('classLive.quick.reason')}</p>
        <TagChips tag={tag} onTag={onTag} />
      </div>
      <ul className="space-y-3">
        {students.map((s) => {
          const left = remaining(s)
          return (
            <li key={s.id} data-sid={s.id} className={cn('space-y-2 rounded-2xl bg-white p-2.5 shadow-sm', s.attendance === 'absent' && 'opacity-55')}>
              <button type="button" onClick={() => onOpen(s.id)} className="flex w-full items-center gap-3 text-left">
                <Avatar s={s} size="h-11 w-11 text-base" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{shortName(s.full_name)}</span>
                  <span className="block text-xs text-navy/55">
                    {t('classLive.quick.line', { total: s.total, available: s.available })}
                    {s.attendance && s.attendance !== 'present' ? ` · ${t(`classLive.attendance.${s.attendance}`)}` : ''}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-3xl leading-none font-extrabold text-bronze tabular-nums">{s.today}</span>
                  <span className="text-[11px] text-navy/50">{t('classLive.card.today')}</span>
                </span>
              </button>
              <div className="grid gap-1" style={cols}>
                {steps.map((d) => (
                  <button
                    key={d}
                    type="button"
                    disabled={d > left}
                    onClick={() => onScore(s.id, d)}
                    className="h-11 rounded-lg bg-linear-to-b from-gold to-bronze text-sm font-extrabold text-navy active:scale-95 disabled:opacity-35"
                  >
                    +{d}
                  </button>
                ))}
              </div>
              <div className="grid gap-1" style={cols}>
                {steps.map((d) => (
                  <button
                    key={d}
                    type="button"
                    disabled={d > s.today}
                    onClick={() => onScore(s.id, -d)}
                    className="h-10 rounded-lg bg-white text-sm font-bold text-red-700 ring-1 ring-red-200 active:scale-95 disabled:opacity-35"
                  >
                    −{d}
                  </button>
                ))}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function TeamBar({
  count,
  total,
  tag,
  onTag,
  onAll,
  steps,
  remaining,
  minusMax,
  onScore,
  undo,
  onUndo,
}: {
  count: number
  total: number
  tag: PointTag | null
  onTag: (t: PointTag | null) => void
  onAll: () => void
  steps: number[]
  remaining: number
  minusMax: number
  onScore: (d: number) => void
  undo: number | null
  onUndo: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 space-y-2 border-t border-navy/10 bg-white px-3 pt-3 shadow-[0_-8px_24px_rgba(0,0,0,.08)]" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}>
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold">{t('classLive.team.picked', { count })}</p>
        <button type="button" onClick={onAll} className="min-h-10 rounded-full px-3 text-sm font-semibold text-bronze">
          {count === total ? t('classLive.team.none') : t('classLive.team.all')}
        </button>
      </div>
      <TagChips tag={tag} onTag={onTag} />
      <ScoreButtons steps={steps} remaining={remaining} minusMax={minusMax} onScore={onScore} disabled={count === 0} undo={undo} onUndo={onUndo} />
    </div>
  )
}

type MarkPatch = Omit<Extract<LiveOp, { op: 'mark' }>, 'op' | 'id' | 'class_id' | 'date' | 'student_id'>

function StudentSheet({
  s,
  classId,
  tag,
  onTag,
  steps,
  remaining,
  minusMax,
  cap,
  attendancePoints,
  onScore,
  undo,
  onUndo,
  onMark,
  onClose,
  onChanged,
}: {
  s: LiveStudent
  classId: string
  tag: PointTag | null
  onTag: (t: PointTag | null) => void
  steps: number[]
  remaining: number
  minusMax: number
  cap: number | null
  attendancePoints: number
  onScore: (d: number) => void
  undo: number | null
  onUndo: () => void
  onMark: (patch: MarkPatch) => void
  onClose: () => void
  onChanged: () => Promise<unknown>
}) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<'comment' | 'gifts' | 'profile' | 'history'>('comment')
  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end bg-navy/40" onClick={onClose}>
      <div
        className="flex max-h-[92dvh] flex-col rounded-t-3xl bg-cream shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={s.full_name}
      >
        <div className="flex items-center gap-3 px-4 pt-4 pb-2" data-sid={s.id}>
          <Avatar s={s} size="h-14 w-14 text-lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-bold">{s.full_name}</p>
            <p className="text-sm text-navy/70">
              {t('classLive.sheet.line', { today: s.today, total: s.total, available: s.available })}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label={t('common.close')} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-navy/5">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex gap-2 px-4 pb-2">
          {(['comment', 'gifts', 'profile', 'history'] as const).map((k) => (
            <button key={k} type="button" onClick={() => setTab(k)} className={segClass(tab === k)}>
              {t(`classLive.sheet.tab.${k}`)}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">
          {tab === 'comment' && <CommentPanel s={s} onMark={onMark} attendancePoints={attendancePoints} />}
          {tab === 'profile' && <ProfilePanel s={s} classId={classId} onChanged={onChanged} />}
          {tab === 'history' && <HistoryPanel s={s} classId={classId} />}
          {tab === 'gifts' && <GiftsPanel classId={classId} studentId={s.id} onChanged={onChanged} />}
        </div>
        {/* Vùng chấm điểm ở dưới cùng: ngón cái với tới khi cầm máy một tay */}
        <div className="space-y-2 border-t border-navy/10 bg-white px-4 pt-3" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}>
          <TagChips tag={tag} onTag={onTag} />
          {cap !== null && remaining === 0 && (
            <p className="text-center text-sm font-semibold text-emerald-700">{t('classLive.cap.full', { cap })}</p>
          )}
          <ScoreButtons steps={steps} remaining={remaining} minusMax={minusMax} onScore={onScore} undo={undo} onUndo={onUndo} />
        </div>
      </div>
    </div>
  )
}

type SpeechRec = {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start: () => void
  stop: () => void
}
function speechCtor(): (new () => SpeechRec) | undefined {
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

function CommentPanel({ s, onMark, attendancePoints }: { s: LiveStudent; onMark: (patch: MarkPatch) => void; attendancePoints: number }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [note, setNote] = useState(s.note ?? '')
  const [listening, setListening] = useState(false)
  const rec = useRef<SpeechRec | null>(null)
  const Speech = speechCtor()
  const dirty = note.trim() !== (s.note ?? '').trim()

  useEffect(() => () => rec.current?.stop(), [])

  const toggleMic = () => {
    if (!Speech) return
    if (listening) {
      rec.current?.stop()
      return
    }
    const r = new Speech()
    r.lang = 'vi-VN'
    r.interimResults = false
    r.continuous = false
    r.onresult = (e) => {
      const text = Array.from(e.results).map((x) => x[0].transcript).join(' ').trim()
      if (text) setNote((prev) => (prev ? `${prev.trim()} ${text}` : text))
    }
    r.onend = () => setListening(false)
    r.onerror = () => {
      setListening(false)
      toast(t('classLive.comment.micFailed'), 'error')
    }
    rec.current = r
    setListening(true)
    r.start()
  }

  const toggleTag = (k: CommentTag) =>
    onMark({ comment_tags: s.comment_tags.includes(k) ? s.comment_tags.filter((x) => x !== k) : [...s.comment_tags, k] })

  return (
    <div className="space-y-4 pt-1">
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-navy/70">
          {t('classLive.attendance.title')}
          {attendancePoints > 0 && <span className="ml-2 font-normal text-emerald-700">{t('classLive.cap.attendance', { points: attendancePoints })}</span>}
        </h3>
        <div className="flex gap-2">
          {(['present', 'late', 'absent'] as Attendance[]).map((a) => (
            <button key={a} type="button" onClick={() => onMark({ attendance: s.attendance === a ? null : a })} className={segClass(s.attendance === a)}>
              {t(`classLive.attendance.${a}`)}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between rounded-xl bg-white px-3 py-2 ring-1 ring-navy/10">
          <span className="text-sm">{t('classLive.attendance.leave')}</span>
          <div className="flex items-center gap-3">
            <button type="button" aria-label="−" onClick={() => s.leave_count > 0 && onMark({ leave_count: s.leave_count - 1 })} className="flex h-10 w-10 items-center justify-center rounded-full bg-navy/5">
              <Minus className="h-4 w-4" />
            </button>
            <span className="w-6 text-center text-lg font-bold tabular-nums">{s.leave_count}</span>
            <button type="button" aria-label="+" onClick={() => onMark({ leave_count: s.leave_count + 1 })} className="flex h-10 w-10 items-center justify-center rounded-full bg-navy/5">
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-navy/70">{t('classLive.comment.title')}</h3>
        <div className="grid grid-cols-2 gap-2">
          {COMMENT_TAGS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => toggleTag(k)}
              className={cn(
                'flex min-h-12 items-center justify-center gap-1 rounded-xl px-2 text-sm font-semibold',
                s.comment_tags.includes(k) ? 'bg-emerald-600 text-white' : 'bg-white text-navy ring-1 ring-navy/15',
              )}
            >
              {s.comment_tags.includes(k) && <Check className="h-4 w-4" />}
              {t(`classLive.comment.tag.${k}`)}
            </button>
          ))}
        </div>
        <div className="relative">
          <Textarea
            value={note}
            maxLength={1000}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('classLive.comment.notePlaceholder')}
            className="min-h-20 pr-14 select-text"
          />
          {Speech && (
            <button
              type="button"
              onClick={toggleMic}
              aria-label={t('classLive.comment.mic')}
              className={cn('absolute top-2 right-2 flex h-10 w-10 items-center justify-center rounded-full', listening ? 'animate-pulse bg-red-600 text-white' : 'bg-navy/5 text-navy')}
            >
              {listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </button>
          )}
        </div>
        {dirty && (
          <Button size="full" onClick={() => onMark({ note: note.trim() || null })}>
            {t('classLive.comment.saveNote')}
          </Button>
        )}
      </section>
    </div>
  )
}

function ProfilePanel({ s, classId, onChanged }: { s: LiveStudent; classId: string; onChanged: () => Promise<unknown> }) {
  const { t, i18n } = useTranslation()
  const toast = useToast()
  const [opening, setOpening] = useState(String(s.opening))
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const claimUrl = s.claim_code ? `${window.location.origin}/c/${s.claim_code}` : null
  const qr = useQuery({
    queryKey: ['live-claim-qr', claimUrl],
    enabled: Boolean(claimUrl),
    staleTime: Infinity,
    queryFn: () => QRCode.toDataURL(claimUrl!, { margin: 1, width: 360 }),
  })

  const saveOpening = async () => {
    const n = Number(opening.replace(/\D/g, '') || '0')
    setBusy(true)
    try {
      await callRpc('class_live_set_opening', { p_class_id: classId, p_student_id: s.id, p_points: n })
      await onChanged()
      toast(t('classLive.opening.saved'))
    } catch (e) {
      toast(navigator.onLine ? t(errorKey(e)) : t('classLive.needOnline'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4 pt-1">
      <section className="space-y-2 rounded-2xl bg-white p-3 ring-1 ring-navy/10">
        <h3 className="font-semibold">{t('classLive.opening.title')}</h3>
        <p className="text-sm text-navy/65">{t('classLive.opening.hint')}</p>
        <div className="flex gap-2">
          <Input inputMode="numeric" value={opening} onChange={(e) => setOpening(e.target.value.replace(/\D/g, ''))} className="text-xl font-bold select-text" />
          <Button onClick={saveOpening} disabled={busy || Number(opening || 0) === s.opening}>
            {t('common.save')}
          </Button>
        </div>
      </section>

      <section className="space-y-1 rounded-2xl bg-white p-3 ring-1 ring-navy/10">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm text-navy/60">{t('classLive.profile.code')}</p>
            <p className="text-lg font-bold tracking-wide select-text">{s.student_code}</p>
            {s.date_of_birth && <p className="text-sm text-navy/60">{t('fields.dateOfBirth')}: {formatDate(s.date_of_birth, i18n.language)}</p>}
          </div>
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" /> {t('classLive.profile.edit')}
          </Button>
        </div>
      </section>

      <section className="space-y-2 rounded-2xl bg-white p-3 text-center ring-1 ring-navy/10">
        <h3 className="font-semibold">{t('classLive.profile.linkTitle')}</h3>
        {s.claimed ? (
          <p className="text-sm text-emerald-700">{t('classLive.profile.linked')}</p>
        ) : s.claim_code ? (
          <>
            <p className="text-sm text-navy/65">{t('classLive.profile.linkHint')}</p>
            {qr.data && <img src={qr.data} alt="" className="mx-auto h-48 w-48" />}
            <p className="text-2xl font-bold tracking-widest select-text">{s.claim_code}</p>
          </>
        ) : (
          <p className="text-sm text-navy/65">—</p>
        )}
      </section>

      <AddStudentDialog open={editing} classId={classId} student={s} onClose={() => setEditing(false)} onCreated={onChanged} />
    </div>
  )
}

interface HistoryRow {
  session_date: string
  session_no: number | null
  topic: string | null
  points: number
  by_reason: Record<string, number>
  attendance: Attendance | null
  leave_count: number
  comment_tags: CommentTag[]
  note: string | null
}

function HistoryPanel({ s, classId }: { s: LiveStudent; classId: string }) {
  const { t, i18n } = useTranslation()
  const hist = useQuery({
    queryKey: ['live-history', classId, s.id],
    queryFn: () =>
      callRpc<{ opening: number; total: number; available: number; sessions: HistoryRow[] }>('class_live_history', {
        p_class_id: classId,
        p_student_id: s.id,
      }),
  })
  if (hist.isPending) return <p className="py-4 text-navy/60">{t('common.loading')}</p>
  if (hist.isError) return <p className="py-4 text-red-700">{navigator.onLine ? t('errors.loadFailed') : t('classLive.needOnline')}</p>
  return (
    <div className="space-y-3 pt-1">
      <p className="text-sm text-navy/70">{t('classLive.history.summary', { opening: hist.data.opening, total: hist.data.total, available: hist.data.available })}</p>
      {hist.data.sessions.length === 0 && <p className="text-navy/60">{t('classLive.history.empty')}</p>}
      {hist.data.sessions.map((h) => (
        <div key={h.session_date} className="space-y-1 rounded-2xl bg-white p-3 ring-1 ring-navy/10">
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-semibold">
              {h.session_no ? `${t('classLive.session.no', { no: h.session_no })} · ` : ''}
              {formatDate(h.session_date, i18n.language)}
            </p>
            <p className="text-lg font-extrabold text-bronze">+{h.points}</p>
          </div>
          {h.topic && <p className="text-sm">{h.topic}</p>}
          {Object.keys(h.by_reason).length > 0 && (
            <p className="text-xs text-navy/60">
              {Object.entries(h.by_reason)
                .map(([k, v]) => `${k || t('classLive.history.noReason')} ${v > 0 ? '+' : ''}${v}`)
                .join(' · ')}
            </p>
          )}
          <p className="text-xs text-navy/60">
            {[
              h.attendance && t(`classLive.attendance.${h.attendance}`),
              h.leave_count > 0 && t('classLive.history.leave', { count: h.leave_count }),
              ...h.comment_tags.map((c) => t(`classLive.comment.tag.${c}`)),
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {h.note && <p className="text-sm text-navy/80 italic">“{h.note}”</p>}
        </div>
      ))}
    </div>
  )
}

function fileToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(new Error('invalid_photo'))
    r.readAsDataURL(blob)
  })
}

/** Tạo nhanh (hoặc sửa) hồ sơ: họ tên bắt buộc; ngày sinh, ảnh không bắt buộc. Mã Golf Passport tự sinh. */
function AddStudentDialog({
  open,
  classId,
  student,
  onClose,
  onCreated,
}: {
  open: boolean
  classId: string
  student?: LiveStudent
  onClose: () => void
  onCreated: () => Promise<unknown>
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const [name, setName] = useState('')
  const [dob, setDob] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setName(student?.full_name ?? '')
    setDob(student?.date_of_birth ?? '')
    setPhoto(student?.avatar_url ?? null)
    setError(null)
    setDone(null)
  }, [open, student])

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return
    try {
      setPhoto(await fileToDataUrl(await compressImage(file, 60_000, 360)))
    } catch {
      setError(t('classLive.errors.invalid_photo'))
    }
  }

  const submit = async (again: boolean) => {
    setError(null)
    if (name.trim().length < 2) return setError(t('classLive.errors.name_required'))
    setBusy(true)
    try {
      if (student) {
        await callRpc('class_live_update_student', {
          p_class_id: classId,
          p_student_id: student.id,
          p_full_name: name,
          p_date_of_birth: dob || null,
          // Ảnh không đổi → không gửi lại; bỏ ảnh → ''
          p_avatar: photo === student.avatar_url ? null : (photo ?? ''),
        })
        await onCreated()
        toast(t('classLive.add.updated'))
        onClose()
      } else {
        const res = await callRpc<{ student_code: string }>('class_live_create_student', {
          p_class_id: classId,
          p_full_name: name,
          p_date_of_birth: dob || null,
          p_avatar: photo,
          p_id: newId(),
        })
        await onCreated()
        toast(t('classLive.add.created', { name: name.trim(), code: res.student_code }))
        if (again) {
          setDone(t('classLive.add.created', { name: name.trim(), code: res.student_code }))
          setName('')
          setDob('')
          setPhoto(null)
        } else onClose()
      }
    } catch (e) {
      setError(navigator.onLine ? t(errorKey(e)) : t('classLive.needOnline'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={student ? t('classLive.add.editTitle') : t('classLive.add.title')}>
      <div className="space-y-4">
        {done && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{done}</p>}
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-navy/5 ring-1 ring-navy/15"
            aria-label={t('classLive.add.photo')}
          >
            {photo ? <img src={photo} alt="" className="h-full w-full object-cover" /> : <Camera className="h-7 w-7 text-navy/50" />}
          </button>
          <div className="text-sm text-navy/65">
            <p>{t('classLive.add.photoHint')}</p>
            {photo && (
              <button type="button" className="mt-1 font-semibold text-red-700" onClick={() => setPhoto(null)}>
                {t('classLive.add.removePhoto')}
              </button>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void pickPhoto(e.target.files?.[0])} />
        </div>
        <Field label={t('classLive.add.name')}>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" autoFocus className="select-text" />
        </Field>
        <Field label={t('classLive.add.dob')}>
          <Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
        </Field>
        {!student && <p className="text-sm text-navy/65">{t('classLive.add.codeHint')}</p>}
        <FormError message={error} />
        <div className="grid gap-2">
          <Button size="full" disabled={busy} onClick={() => void submit(false)}>
            {student ? t('common.save') : t('classLive.add.save')}
          </Button>
          {!student && (
            <Button variant="outline" size="full" disabled={busy} onClick={() => void submit(true)}>
              {t('classLive.add.saveAndNext')}
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  )
}

function SessionDialog({
  open,
  no,
  topic,
  lastTopic,
  topics,
  onClose,
  onSave,
}: {
  open: boolean
  no: number
  topic: string
  lastTopic: string | null
  /** Giáo án: phần tử thứ N là chủ đề Buổi N (cài đặt class_live.topics) */
  topics: string[]
  onClose: () => void
  onSave: (no: number | null, topic: string | null) => void
}) {
  const { t } = useTranslation()
  const [n, setN] = useState(String(no))
  const [text, setText] = useState(topic)
  useEffect(() => {
    if (open) {
      setN(String(no))
      // Chưa có chủ đề → điền sẵn theo giáo án của buổi này
      setText(topic || topics[no - 1] || '')
    }
  }, [open, no, topic, topics])
  return (
    <Dialog open={open} onClose={onClose} title={t('classLive.session.title')}>
      <div className="space-y-4">
        <Field label={t('classLive.session.number')}>
          <Input inputMode="numeric" value={n} onChange={(e) => setN(e.target.value.replace(/\D/g, '').slice(0, 3))} />
        </Field>
        <Field label={t('classLive.session.topic')} hint={t('classLive.session.topicHint')}>
          <Input value={text} maxLength={200} onChange={(e) => setText(e.target.value)} className="select-text" />
        </Field>
        {lastTopic && !text && (
          <button type="button" onClick={() => setText(lastTopic)} className="text-sm font-semibold text-bronze">
            {t('classLive.session.reuse', { topic: lastTopic })}
          </button>
        )}
        <Button size="full" onClick={() => onSave(n ? Number(n) : null, text.trim() || null)}>
          {t('common.save')}
        </Button>
        {topics.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-navy/70">{t('classLive.session.pickFromPlan')}</h3>
            <ul className="space-y-1.5">
              {topics.map((tp, i) => {
                // Đánh dấu theo số buổi (Buổi 8 và Buổi 10 trùng tên chủ đề)
                const on = Number(n) === i + 1
                return (
                  <li key={i}>
                    {/* Một chạm: chọn số buổi + chủ đề và lưu luôn */}
                    <button
                      type="button"
                      onClick={() => onSave(i + 1, tp)}
                      className={cn(
                        'flex min-h-12 w-full items-center gap-2 rounded-xl px-3 py-2 text-left',
                        on ? 'bg-navy text-white' : 'bg-white ring-1 ring-navy/10',
                      )}
                    >
                      <span className="w-5 shrink-0">{on && <Check className="h-4 w-4" />}</span>
                      <span>
                        <span className="font-semibold">{t('classLive.session.no', { no: i + 1 })}</span> · {tp}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )}
      </div>
    </Dialog>
  )
}
