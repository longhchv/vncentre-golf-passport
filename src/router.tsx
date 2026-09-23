import { createBrowserRouter } from 'react-router'
import { PublicLayout } from '@/layouts/PublicLayout'
import { WorkspaceLayout } from '@/layouts/WorkspaceLayout'
import { LandingPage } from '@/pages/LandingPage'
import { PlaceholderPage } from '@/pages/PlaceholderPage'
import { LegalPage } from '@/pages/LegalPage'
import { StatusPage } from '@/pages/StatusPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { ComingSoon } from '@/components/ComingSoon'

// Sơ đồ màn hình theo 02-dot-1-nen-tang.md mục 3. Các trang chức năng được làm dần từ Bước 2.
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
      { path: '/login', element: <PlaceholderPage titleKey="pages.login" /> },
      { path: '/signup', element: <PlaceholderPage titleKey="pages.signup" /> },
      { path: '/forgot-password', element: <PlaceholderPage titleKey="pages.forgotPassword" /> },
      { path: '/terms', element: <LegalPage titleKey="pages.terms" /> },
      { path: '/privacy', element: <LegalPage titleKey="pages.privacy" /> },
      { path: '/status', element: <StatusPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  { path: '/app/*', element: <WorkspaceLayout workspace="parent" />, children: [{ path: '*', element: <ComingSoon /> }] },
  { path: '/me/*', element: <WorkspaceLayout workspace="student" />, children: [{ path: '*', element: <ComingSoon /> }] },
  { path: '/coach/*', element: <WorkspaceLayout workspace="coach" />, children: [{ path: '*', element: <ComingSoon /> }] },
  { path: '/school/*', element: <WorkspaceLayout workspace="school" />, children: [{ path: '*', element: <ComingSoon /> }] },
  { path: '/admin/*', element: <WorkspaceLayout workspace="admin" />, children: [{ path: '*', element: <ComingSoon /> }] },
])
