import { createBrowserRouter } from 'react-router'
import { PublicLayout } from '@/layouts/PublicLayout'
import { WorkspaceLayout, type NavItem } from '@/layouts/WorkspaceLayout'
import { RequireWorkspace } from '@/auth/RequireWorkspace'
import type { Workspace } from '@/auth/AuthProvider'
import { LandingPage } from '@/pages/LandingPage'
import { PlaceholderPage } from '@/pages/PlaceholderPage'
import { LegalPage } from '@/pages/LegalPage'
import { StatusPage } from '@/pages/StatusPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { LoginPage } from '@/pages/auth/LoginPage'
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage'
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage'
import { ChooseWorkspacePage } from '@/pages/auth/ChooseWorkspacePage'
import { ComingSoon } from '@/components/ComingSoon'
import { AdminHomePage } from '@/features/admin/AdminHomePage'
import { SchoolsPage } from '@/features/admin/SchoolsPage'
import { AcademicYearsPage } from '@/features/admin/AcademicYearsPage'
import { ProgramsPage } from '@/features/admin/ProgramsPage'
import { ClassTypesPage } from '@/features/admin/ClassTypesPage'
import { SettingsPage } from '@/features/admin/SettingsPage'
import { AuditLogPage } from '@/features/admin/AuditLogPage'
import { ClassesPage } from '@/features/admin/ClassesPage'
import { ClassDetailPage } from '@/features/admin/ClassDetailPage'
import { StudentsPage } from '@/features/admin/StudentsPage'
import { UsersPage } from '@/features/admin/UsersPage'
import { CoachClassPage, CoachHomePage } from '@/features/coach/CoachPages'
import { ImportsPage } from '@/features/imports/ImportsPage'
import { PassportsPage } from '@/features/passports/PassportsPage'
import { BatchDetailPage } from '@/features/passports/BatchDetailPage'

// Menu admin theo 02 mục 3.6. Mục chưa làm hiện thẻ "Sắp ra mắt".
const ADMIN_NAV: (NavItem & { element?: React.ReactNode })[] = [
  { to: '/admin', labelKey: 'admin.nav.dashboard', end: true },
  { to: '/admin/schools', labelKey: 'admin.nav.schools', element: <SchoolsPage /> },
  { to: '/admin/years', labelKey: 'admin.nav.years', element: <AcademicYearsPage /> },
  { to: '/admin/programs', labelKey: 'admin.nav.programs', element: <ProgramsPage /> },
  { to: '/admin/class-types', labelKey: 'admin.nav.classTypes', element: <ClassTypesPage /> },
  { to: '/admin/classes', labelKey: 'admin.nav.classes', element: <ClassesPage /> },
  { to: '/admin/students', labelKey: 'admin.nav.students', element: <StudentsPage /> },
  { to: '/admin/imports', labelKey: 'admin.nav.imports', element: <ImportsPage /> },
  { to: '/admin/queue', labelKey: 'admin.nav.queue' },
  { to: '/admin/passports', labelKey: 'admin.nav.passports', element: <PassportsPage /> },
  { to: '/admin/certificates', labelKey: 'admin.nav.certificates' },
  { to: '/admin/users', labelKey: 'admin.nav.users', element: <UsersPage /> },
  { to: '/admin/orders', labelKey: 'admin.nav.orders' },
  { to: '/admin/messages', labelKey: 'admin.nav.messages' },
  { to: '/admin/settings', labelKey: 'admin.nav.settings', element: <SettingsPage /> },
  { to: '/admin/audit', labelKey: 'admin.nav.audit', element: <AuditLogPage /> },
]

// Menu HLV (02 mục 3.4). Hàng chờ duyệt và phát hành chứng nhận của HLV trưởng: Bước 9 và 12.
const COACH_NAV: NavItem[] = [{ to: '/coach', labelKey: 'coach.myClasses', end: true }]

function workspaceRoute(workspace: Workspace, path: string, nav?: NavItem[], children?: object[]) {
  return {
    path,
    element: (
      <RequireWorkspace workspace={workspace}>
        <WorkspaceLayout workspace={workspace} nav={nav} />
      </RequireWorkspace>
    ),
    children: children ?? [{ index: true, element: <ComingSoon /> }, { path: '*', element: <ComingSoon /> }],
  }
}

// Sơ đồ màn hình theo 02-dot-1-nen-tang.md mục 3.
export const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    children: [
      { path: '/', element: <LandingPage /> },
      { path: '/activate', element: <PlaceholderPage titleKey="pages.activate" bodyKey="pages.activateBody" /> },
      { path: '/p/:passportCode', element: <PlaceholderPage titleKey="pages.passportScan" /> },
      { path: '/c/:claimCode', element: <PlaceholderPage titleKey="pages.claimCode" /> },
      { path: '/i/:inviteToken', element: <PlaceholderPage titleKey="pages.invite" /> },
      { path: '/verify', element: <PlaceholderPage titleKey="pages.verify" /> },
      { path: '/verify/:verifyCode', element: <PlaceholderPage titleKey="pages.verify" /> },
      { path: '/login', element: <LoginPage /> },
      { path: '/signup', element: <PlaceholderPage titleKey="pages.signup" /> },
      { path: '/forgot-password', element: <ForgotPasswordPage /> },
      { path: '/reset-password', element: <ResetPasswordPage /> },
      { path: '/choose', element: <ChooseWorkspacePage /> },
      { path: '/terms', element: <LegalPage titleKey="pages.terms" /> },
      { path: '/privacy', element: <LegalPage titleKey="pages.privacy" /> },
      { path: '/status', element: <StatusPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  workspaceRoute('parent', '/app'),
  workspaceRoute('student', '/me'),
  workspaceRoute('coach', '/coach', COACH_NAV, [
    { index: true, element: <CoachHomePage /> },
    { path: 'classes/:classId', element: <CoachClassPage /> },
    { path: '*', element: <NotFoundPage /> },
  ]),
  workspaceRoute('school', '/school'),
  workspaceRoute('admin', '/admin', ADMIN_NAV, [
    { index: true, element: <AdminHomePage /> },
    ...ADMIN_NAV.filter((n) => n.to !== '/admin').map((n) => ({
      path: n.to.replace('/admin/', ''),
      element: n.element ?? <ComingSoon />,
    })),
    { path: 'classes/:classId', element: <ClassDetailPage /> },
    { path: 'passports/:batchId', element: <BatchDetailPage /> },
    { path: '*', element: <NotFoundPage /> },
  ]),
])
