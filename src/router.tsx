import { createBrowserRouter, type RouteObject } from 'react-router'
import { PublicLayout } from '@/layouts/PublicLayout'
import { WorkspaceLayout, type NavItem } from '@/layouts/WorkspaceLayout'
import { RequireWorkspace, FullPageSpinner } from '@/auth/RequireWorkspace'
import type { Workspace } from '@/auth/AuthProvider'
import { LandingPage } from '@/pages/LandingPage'
import { PlaceholderPage } from '@/pages/PlaceholderPage'
import { LegalPage } from '@/pages/LegalPage'
import { StatusPage } from '@/pages/StatusPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { LoginPage } from '@/pages/auth/LoginPage'
import { SignupPage } from '@/pages/auth/SignupPage'
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage'
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage'
import { ChooseWorkspacePage } from '@/pages/auth/ChooseWorkspacePage'
import { AccountPage } from '@/pages/account/AccountPage'
import { ComingSoon } from '@/components/ComingSoon'
import { PassportScanPage } from '@/features/activation/PassportScanPage'
import { ActivatePage } from '@/features/activation/ActivatePage'

// Trang của từng không gian tải khi cần (lazy) → trang phụ huynh nhẹ hơn trên 4G (02 mục 6).
type Loader = () => Promise<{ Component: React.ComponentType }>
const page = <M,>(load: () => Promise<M>, pick: (m: M) => React.ComponentType): Loader => async () => ({ Component: pick(await load()) })

// Menu admin theo 02 mục 3.6. Mục chưa làm hiện thẻ "Sắp ra mắt".
const ADMIN_NAV: (NavItem & { lazy?: Loader })[] = [
  { to: '/admin', labelKey: 'admin.nav.dashboard', end: true },
  { to: '/admin/schools', labelKey: 'admin.nav.schools', lazy: page(() => import('@/features/admin/SchoolsPage'), (m) => m.SchoolsPage) },
  { to: '/admin/years', labelKey: 'admin.nav.years', lazy: page(() => import('@/features/admin/AcademicYearsPage'), (m) => m.AcademicYearsPage) },
  { to: '/admin/programs', labelKey: 'admin.nav.programs', lazy: page(() => import('@/features/admin/ProgramsPage'), (m) => m.ProgramsPage) },
  { to: '/admin/class-types', labelKey: 'admin.nav.classTypes', lazy: page(() => import('@/features/admin/ClassTypesPage'), (m) => m.ClassTypesPage) },
  { to: '/admin/classes', labelKey: 'admin.nav.classes', lazy: page(() => import('@/features/admin/ClassesPage'), (m) => m.ClassesPage) },
  { to: '/admin/students', labelKey: 'admin.nav.students', lazy: page(() => import('@/features/admin/StudentsPage'), (m) => m.StudentsPage) },
  { to: '/admin/imports', labelKey: 'admin.nav.imports', lazy: page(() => import('@/features/imports/ImportsPage'), (m) => m.ImportsPage) },
  { to: '/admin/queue', labelKey: 'admin.nav.queue' },
  { to: '/admin/passports', labelKey: 'admin.nav.passports', lazy: page(() => import('@/features/passports/PassportsPage'), (m) => m.PassportsPage) },
  { to: '/admin/certificates', labelKey: 'admin.nav.certificates' },
  { to: '/admin/users', labelKey: 'admin.nav.users', lazy: page(() => import('@/features/admin/UsersPage'), (m) => m.UsersPage) },
  { to: '/admin/orders', labelKey: 'admin.nav.orders' },
  { to: '/admin/messages', labelKey: 'admin.nav.messages', lazy: page(() => import('@/features/admin/MessagesPage'), (m) => m.MessagesPage) },
  { to: '/admin/settings', labelKey: 'admin.nav.settings', lazy: page(() => import('@/features/admin/SettingsPage'), (m) => m.SettingsPage) },
  { to: '/admin/audit', labelKey: 'admin.nav.audit', lazy: page(() => import('@/features/admin/AuditLogPage'), (m) => m.AuditLogPage) },
]

// Menu HLV (02 mục 3.4). Hàng chờ duyệt và phát hành chứng nhận của HLV trưởng: Bước 9 và 12.
const COACH_NAV: NavItem[] = [
  { to: '/coach', labelKey: 'coach.myClasses', end: true },
  { to: '/coach/scan', labelKey: 'coach.scanPassport' },
]

// Menu phụ huynh (02 mục 3.2) — các mục hồ sơ con có từ Bước 7–8.
const PARENT_NAV: NavItem[] = [
  { to: '/app', labelKey: 'parent.nav.home', end: true },
  { to: '/app/notifications', labelKey: 'parent.nav.notifications' },
  { to: '/account', labelKey: 'account.title' },
]

const comingSoon: RouteObject[] = [{ index: true, element: <ComingSoon /> }, { path: '*', element: <ComingSoon /> }]

function workspaceRoute(workspace: Workspace, path: string, nav?: NavItem[], children: RouteObject[] = comingSoon): RouteObject {
  return {
    path,
    element: (
      <RequireWorkspace workspace={workspace}>
        <WorkspaceLayout workspace={workspace} nav={nav} />
      </RequireWorkspace>
    ),
    hydrateFallbackElement: <FullPageSpinner />,
    children,
  }
}

// Sơ đồ màn hình theo 02-dot-1-nen-tang.md mục 3.
export const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    children: [
      { path: '/', element: <LandingPage /> },
      { path: '/activate', element: <ActivatePage /> },
      { path: '/p/:passportCode', element: <PassportScanPage /> },
      { path: '/c/:claimCode', element: <PlaceholderPage titleKey="pages.claimCode" /> },
      { path: '/i/:inviteToken', element: <PlaceholderPage titleKey="pages.invite" /> },
      { path: '/verify', element: <PlaceholderPage titleKey="pages.verify" /> },
      { path: '/verify/:verifyCode', element: <PlaceholderPage titleKey="pages.verify" /> },
      { path: '/login', element: <LoginPage /> },
      { path: '/signup', element: <SignupPage /> },
      { path: '/forgot-password', element: <ForgotPasswordPage /> },
      { path: '/reset-password', element: <ResetPasswordPage /> },
      { path: '/choose', element: <ChooseWorkspacePage /> },
      { path: '/account', element: <AccountPage /> },
      { path: '/terms', element: <LegalPage titleKey="pages.terms" /> },
      { path: '/privacy', element: <LegalPage titleKey="pages.privacy" /> },
      { path: '/status', element: <StatusPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  workspaceRoute('parent', '/app', PARENT_NAV, [
    { index: true, lazy: page(() => import('@/features/parent/ParentHomePage'), (m) => m.ParentHomePage) },
    { path: 'children/:studentId', lazy: page(() => import('@/features/profile/ProfilePages'), (m) => m.ParentChildPage) },
    { path: 'notifications', lazy: page(() => import('@/features/profile/ProfilePages'), (m) => m.NotificationsPage) },
    { path: '*', element: <ComingSoon /> },
  ]),
  workspaceRoute('student', '/me'),
  workspaceRoute('coach', '/coach', COACH_NAV, [
    { index: true, lazy: page(() => import('@/features/coach/CoachPages'), (m) => m.CoachHomePage) },
    { path: 'classes/:classId', lazy: page(() => import('@/features/coach/CoachPages'), (m) => m.CoachClassPage) },
    { path: 'students/:studentId', lazy: page(() => import('@/features/profile/ProfilePages'), (m) => m.CoachStudentPage) },
    { path: 'scan', lazy: page(() => import('@/features/profile/ProfilePages'), (m) => m.CoachScanPage) },
    { path: '*', element: <NotFoundPage /> },
  ]),
  workspaceRoute('school', '/school'),
  workspaceRoute('admin', '/admin', ADMIN_NAV, [
    { index: true, lazy: page(() => import('@/features/admin/AdminHomePage'), (m) => m.AdminHomePage) },
    ...ADMIN_NAV.filter((n) => n.to !== '/admin').map<RouteObject>((n) => ({
      path: n.to.replace('/admin/', ''),
      ...(n.lazy ? { lazy: n.lazy } : { element: <ComingSoon /> }),
    })),
    { path: 'classes/:classId', lazy: page(() => import('@/features/admin/ClassDetailPage'), (m) => m.ClassDetailPage) },
    { path: 'passports/:batchId', lazy: page(() => import('@/features/passports/BatchDetailPage'), (m) => m.BatchDetailPage) },
    { path: '*', element: <NotFoundPage /> },
  ]),
])
