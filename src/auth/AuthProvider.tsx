import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { setLanguage, type Language } from '@/i18n'
import type { Profile, Role, UserRole } from '@/lib/types'

export type Workspace = 'parent' | 'student' | 'coach' | 'school' | 'admin'

export const WORKSPACE_PATH: Record<Workspace, string> = {
  parent: '/app',
  student: '/me',
  coach: '/coach',
  school: '/school',
  admin: '/admin',
}

const COACH_ROLES: Role[] = ['head_coach', 'coach', 'assistant', 'pe_teacher']

interface AuthState {
  session: Session | null
  loading: boolean
  profile: Profile | null
  roles: UserRole[]
  workspaces: Workspace[]
  guardianId: string | null
  refreshAccount: () => Promise<void>
  hasRole: (role: Role) => boolean
  signOut: () => Promise<void>
  changeLanguage: (lang: Language) => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

async function loadAccount(userId: string) {
  const [profileRes, rolesRes, guardianRes] = await Promise.all([
    supabase!.from('profiles').select('*').eq('user_id', userId).maybeSingle(),
    supabase!.from('user_roles').select('id, user_id, role, school_id, class_id').eq('user_id', userId),
    // Phụ huynh: có dòng người giám hộ gắn với tài khoản (tạo khi đăng ký hoặc thêm SĐT)
    supabase!.from('guardians').select('id').eq('user_id', userId).maybeSingle(),
  ])
  if (profileRes.error) throw profileRes.error
  if (rolesRes.error) throw rolesRes.error
  return {
    profile: profileRes.data as Profile | null,
    roles: (rolesRes.data ?? []) as UserRole[],
    guardianId: (guardianRes.data?.id as string | undefined) ?? null,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionLoading, setSessionLoading] = useState(Boolean(supabase))
  const queryClient = useQueryClient()
  const appliedLangFor = useRef<string | null>(null)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setSessionLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      if (!s) queryClient.clear()
    })
    return () => data.subscription.unsubscribe()
  }, [queryClient])

  const userId = session?.user.id
  const account = useQuery({
    queryKey: ['account', userId],
    queryFn: () => loadAccount(userId!),
    enabled: Boolean(userId),
  })

  const profile = account.data?.profile ?? null
  const roles = useMemo(() => account.data?.roles ?? [], [account.data])
  const guardianId = account.data?.guardianId ?? null

  // Ngôn ngữ nhớ theo tài khoản (02 mục 6): áp dụng một lần mỗi lần đăng nhập
  useEffect(() => {
    if (profile && appliedLangFor.current !== profile.user_id) {
      appliedLangFor.current = profile.user_id
      setLanguage(profile.preferred_language)
    }
    if (!session) appliedLangFor.current = null
  }, [profile, session])

  const hasRole = useCallback((role: Role) => roles.some((r) => r.role === role), [roles])

  const workspaces = useMemo<Workspace[]>(() => {
    const list: Workspace[] = []
    if (roles.some((r) => r.role === 'admin')) list.push('admin')
    if (roles.some((r) => COACH_ROLES.includes(r.role))) list.push('coach')
    if (roles.some((r) => r.role === 'school_manager')) list.push('school')
    if (guardianId) list.push('parent')
    // Học viên (tên + PIN): Bước 11
    return list
  }, [roles, guardianId])

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut()
  }, [])

  const changeLanguage = useCallback(
    async (lang: Language) => {
      await setLanguage(lang)
      if (supabase && profile && profile.preferred_language !== lang) {
        await supabase.from('profiles').update({ preferred_language: lang }).eq('user_id', profile.user_id)
        queryClient.invalidateQueries({ queryKey: ['account', profile.user_id] })
      }
    },
    [profile, queryClient],
  )

  const value: AuthState = {
    session,
    loading: sessionLoading || (Boolean(userId) && account.isPending),
    profile,
    roles,
    workspaces,
    guardianId,
    refreshAccount: async () => {
      await supabase?.auth.refreshSession()
      await queryClient.invalidateQueries({ queryKey: ['account'] })
    },
    hasRole,
    signOut,
    changeLanguage,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth phải nằm trong AuthProvider')
  return ctx
}
