import { lazy, Suspense } from 'react'
import { useAuth } from '@/auth/AuthProvider'

// Spec 18: sau khi đăng ký / đăng nhập qua link /r/<mã>, gắn mã giới thiệu một lần.
// Chỉ tải module khách (CustomerOffers) khi máy đang giữ mã, để không làm nặng gói chính.
const Claimer = lazy(() =>
  import('./CustomerOffers').then((m) => ({
    default: function ReferralClaimer() {
      m.useReferralClaim()
      return null
    },
  })),
)

export function ReferralClaimMount() {
  const { session } = useAuth() // theo dõi phiên để chạy lại khi vừa đăng nhập
  let has = false
  try {
    has = Boolean(localStorage.getItem('vnc_ref_code'))
  } catch {
    has = false
  }
  if (!session || !has) return null
  return (
    <Suspense fallback={null}>
      <Claimer />
    </Suspense>
  )
}
