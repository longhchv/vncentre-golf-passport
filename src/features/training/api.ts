import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/auth/AuthProvider'
import { supabase } from '@/lib/supabase'
import { useSetting } from '@/lib/settings'
import type { Benchmark, HoleRow, IntakeMap } from './stats'
import type { Cursor, PlanBlock, Program } from './planner'

const db = () => supabase!

export interface Goal {
  id: string
  student_id: string
  hcp_start: number | null
  hcp_start_source: 'self_declared' | 'intake_test' | 'whs' | 'none'
  hcp_target: number
  months: number
  start_date: string
  program_id: string
  schedule_mode: 'fixed_12_weeks' | 'flexible'
  days_of_week: number[]
  session_minutes: number
  weak_area: 'fir' | 'gir' | 'scr' | 'chip' | 'putt' | null
  reminders_on: boolean
  cursor_week: number
  cursor_day: number
  cursor_block: number
  cursor_fraction: number
  status: string
  program: { id: string; code: string; name_vi: string; name_en: string; weeks: number; days_per_week: number }
}

export interface Me {
  id: string
  full_name: string
  student_code: string
  date_of_birth: string | null
  verification_status: string
}

export interface RoundRow {
  id: string
  played_on: string
  course_name: string | null
  holes_played: 9 | 18
  total_strokes: number | null
  holes: HoleRow[]
}

export interface ClubRow {
  id: string
  club_code: string
  carry_yards: number | null
  total_yards: number | null
  measured_on: string
}

export const cursorOf = (g: Goal): Cursor => ({ week: g.cursor_week, day: g.cursor_day, block: g.cursor_block, fraction: Number(g.cursor_fraction) })

export function useTrainingEnabled() {
  const { session } = useAuth()
  return useQuery({
    queryKey: ['training_enabled', session?.user.id],
    enabled: Boolean(session),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await db().rpc('training_enabled')
      if (error) throw error
      return Boolean(data)
    },
  })
}

export function useTrainingSettings() {
  const minAge = useSetting<number>('training.min_age', 18)
  const options = useSetting<number[]>('training.session_minute_options', [10, 15, 20, 30, 45, 60, 90, 120, 150, 180, 210])
  const maxSession = useSetting<number>('training.max_session_minutes', 210)
  const blockMinutes = useSetting<number>('training.block_minutes', 5)
  const maxDrop = useSetting<number>('training.max_hcp_drop_per_month', 1.5)
  const intake = useSetting<IntakeMap>('training.intake_map', { putt: [38, 38, 30, 25, 20, 15], chip: [38, 38, 30, 25, 20, 18], long: [38, 38, 30, 20, 16, 12] })
  return {
    minAge: Number(minAge.value),
    options: options.value,
    maxSession: Number(maxSession.value),
    blockMinutes: Number(blockMinutes.value),
    maxDrop: Number(maxDrop.value),
    intake: intake.value,
  }
}

/** Hồ sơ golfer của chính người đăng nhập (quan hệ self). null = chưa có. */
export function useMe() {
  const { session } = useAuth()
  return useQuery({
    queryKey: ['training_me', session?.user.id],
    enabled: Boolean(session),
    queryFn: async (): Promise<Me | null> => {
      const { data: id, error } = await db().rpc('training_self_student')
      if (error) throw error
      if (!id) return null
      const res = await db().from('students').select('id, full_name, student_code, date_of_birth, verification_status').eq('id', id).single()
      if (res.error) throw res.error
      return res.data as Me
    },
  })
}

export function useGoal(studentId: string | undefined) {
  return useQuery({
    queryKey: ['training_goal', studentId],
    enabled: Boolean(studentId),
    queryFn: async (): Promise<Goal | null> => {
      const { data, error } = await db()
        .from('training_goals')
        .select('*, program:training_programs(id, code, name_vi, name_en, weeks, days_per_week)')
        .eq('student_id', studentId!)
        .eq('status', 'active')
        .maybeSingle()
      if (error) throw error
      return data as Goal | null
    },
  })
}

/** Giáo án đầy đủ của một chương trình (≤ 16 buổi, ≤ 80 phần). */
export function useProgram(programId: string | undefined, meta?: { weeks: number; days_per_week: number }) {
  return useQuery({
    queryKey: ['training_program', programId],
    enabled: Boolean(programId && meta),
    staleTime: 30 * 60_000,
    queryFn: async (): Promise<Program> => {
      const { data, error } = await db()
        .from('training_program_sessions')
        .select('id, week_no, day_no, blocks:training_program_blocks(id, sort_order, area, title_vi, title_en, est_minutes, lines)')
        .eq('program_id', programId!)
        .order('week_no')
        .order('day_no')
      if (error) throw error
      return {
        weeks: meta!.weeks,
        days_per_week: meta!.days_per_week,
        sessions: (data as { id: string; week_no: number; day_no: number; blocks: PlanBlock[] }[]).map((s) => ({
          ...s,
          blocks: [...s.blocks].sort((a, b) => a.sort_order - b.sort_order),
        })),
      }
    },
  })
}

export function usePrograms() {
  return useQuery({
    queryKey: ['training_programs'],
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const { data, error } = await db().from('training_programs').select('id, code, name_vi, name_en, weeks, days_per_week').eq('is_active', true).order('sort_order')
      if (error) throw error
      return data as Goal['program'][]
    },
  })
}

export function usePracticeDays(goalId: string | undefined) {
  return useQuery({
    queryKey: ['training_days', goalId],
    enabled: Boolean(goalId),
    queryFn: async () => {
      const { data, error } = await db().from('training_session_logs').select('practiced_on, done_minutes').eq('goal_id', goalId!)
      if (error) throw error
      const rows = data as { practiced_on: string; done_minutes: number }[]
      return { days: new Set(rows.map((r) => r.practiced_on)), sessions: rows.length, minutes: rows.reduce((a, r) => a + Number(r.done_minutes), 0) }
    },
  })
}

export function useBenchmarks() {
  return useQuery({
    queryKey: ['training_stat_benchmarks'],
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const { data, error } = await db().from('training_stat_benchmarks').select('stat, mode, hcp, value')
      if (error) throw error
      return (data as Benchmark[]).map((r) => ({ ...r, hcp: Number(r.hcp), value: Number(r.value) }))
    },
  })
}

export function useRounds(studentId: string | undefined) {
  return useQuery({
    queryKey: ['training_rounds', studentId],
    enabled: Boolean(studentId),
    queryFn: async () => {
      const { data, error } = await db()
        .from('round_stats')
        .select('id, played_on, course_name, holes_played, total_strokes, holes:round_stat_holes(hole_no, par, strokes, fairway, gir, putts)')
        .eq('student_id', studentId!)
        .is('deleted_at', null)
        .order('played_on', { ascending: false })
        .limit(20)
      if (error) throw error
      return (data as RoundRow[]).map((r) => ({ ...r, holes: [...r.holes].sort((a, b) => a.hole_no - b.hole_no) }))
    },
  })
}

export function useClubs(studentId: string | undefined) {
  return useQuery({
    queryKey: ['training_clubs', studentId],
    enabled: Boolean(studentId),
    queryFn: async () => {
      const { data, error } = await db()
        .from('club_distances')
        .select('id, club_code, carry_yards, total_yards, measured_on')
        .eq('student_id', studentId!)
        .is('deleted_at', null)
        .order('measured_on', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as ClubRow[]
    },
  })
}

export function useInvalidateTraining() {
  const qc = useQueryClient()
  return () => {
    for (const k of ['training_me', 'training_goal', 'training_days', 'training_rounds', 'training_clubs']) qc.invalidateQueries({ queryKey: [k] })
  }
}

export function useRpc<A extends Record<string, unknown>, R = unknown>(fn: string) {
  const invalidate = useInvalidateTraining()
  return useMutation({
    mutationFn: async (args: A) => {
      const { data, error } = await db().rpc(fn, args)
      if (error) throw error
      return data as R
    },
    onSuccess: invalidate,
  })
}

export function useUpdateGoal() {
  const invalidate = useInvalidateTraining()
  return useMutation({
    mutationFn: async ({ id, ...values }: { id: string } & Partial<Pick<Goal, 'schedule_mode' | 'days_of_week' | 'session_minutes' | 'reminders_on' | 'weak_area'>>) => {
      const { error } = await db().from('training_goals').update(values).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export async function saveIntake(row: Record<string, unknown>) {
  const { error } = await db().from('training_intake_tests').insert(row)
  if (error) throw error
}

export async function saveRound(round: Record<string, unknown>, holes: Omit<HoleRow, never>[]) {
  const { data, error } = await db().from('round_stats').insert(round).select('id').single()
  if (error) throw error
  const id = (data as { id: string }).id
  const res = await db().from('round_stat_holes').insert(holes.map((h) => ({ ...h, round_id: id })))
  if (res.error) {
    await db().from('round_stats').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    throw res.error
  }
  return id
}

export async function deleteRound(id: string) {
  const { error } = await db().from('round_stats').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

export async function addClub(row: Record<string, unknown>) {
  const { error } = await db().from('club_distances').insert(row)
  if (error) throw error
}
