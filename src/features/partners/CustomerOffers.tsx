import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import QRCode from 'qrcode'
import { ArrowLeft, Gift, MapPin, QrCode, Store } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { formatDate, formatDateTime, useLocalized } from '@/lib/i18nField'
import { Button } from '@/components/ui/button'
import { Badge, Card } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { FormError } from '@/components/ui/form'
import { Mascot } from '@/components/Mascot'
import { callRpc, partnerErrorKey, type OfferBase, type PartnerKind } from './shared'

// Phía khách của Golf Passport Partners (spec 18 mục 2, 6): QR động 60 giây, điểm tích luỹ, danh sách đối tác,
// link giới thiệu /r/<mã>. Tài khoản con không gọi partner_qr_issue — phụ huynh mở thay ở trang hồ sơ con.

interface QrToken {
  token: string
  expires_at: string
  seconds: number
}

interface RewardBalance {
  balance: number
  recent: { delta: number; reason: string; created_at: string; partner_name: string | null }[]
}

interface PublicOffer extends OfferBase {
  service_vi: string | null
  service_en: string | null
  conditions_vi: string | null
  conditions_en: string | null
  valid_to: string | null
}

interface PublicPartner {
  id: string
  name: string
  kind: PartnerKind
  address: string | null
  lat: number | null
  lng: number | null
  photo_url: string | null
  description_vi: string | null
  description_en: string | null
  offers: PublicOffer[]
}

function useRewardBalance(studentId: string, enabled = true) {
  return useQuery({
    queryKey: ['reward_balance', studentId],
    enabled: enabled && Boolean(studentId),
    queryFn: () => callRpc<RewardBalance>('reward_balance', { p_student_id: studentId }),
  })
}

/** Thẻ "Mã ưu đãi đối tác" trên trang sổ: mở hộp thoại QR động + điểm tích luỹ. */
export function PartnerQrCard({ studentId }: { studentId: string }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const balance = useRewardBalance(studentId)

  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <p className="font-semibold">{t('partners.qr.cardTitle')}</p>
        <p className="text-sm text-navy/60">
          {balance.data ? t('partners.qr.balance', { count: Number(balance.data.balance) }) : t('partners.qr.cardHint')}
          {' · '}
          <Link to="/app/partners" className="font-semibold text-bronze">
            {t('partners.qr.seeOffers')}
          </Link>
        </p>
      </div>
      <Button size="sm" onClick={() => setOpen(true)}>
        <QrCode className="h-4 w-4" /> {t('partners.qr.open')}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={t('partners.qr.cardTitle')}>
        {open && <PartnerQrBody studentId={studentId} />}
      </Dialog>
    </Card>
  )
}

function PartnerQrBody({ studentId }: { studentId: string }) {
  const { t, i18n } = useTranslation()
  const [qr, setQr] = useState<{ token: string; img: string; until: number } | null>(null)
  const [left, setLeft] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const issuing = useRef(false)
  const balance = useRewardBalance(studentId)
  const refetchBalance = balance.refetch

  const issue = useCallback(async () => {
    if (issuing.current) return
    issuing.current = true
    try {
      const r = await callRpc<QrToken>('partner_qr_issue', { p_student_id: studentId })
      const img = await QRCode.toDataURL(r.token, { width: 320, margin: 1, errorCorrectionLevel: 'M' })
      // Đếm theo đồng hồ máy khách từ lúc nhận mã (tránh lệch giờ máy chủ)
      setQr({ token: r.token, img, until: Date.now() + (r.seconds || 60) * 1000 })
      setError(null)
    } catch (e) {
      setQr(null)
      setError(t(partnerErrorKey(e)))
    } finally {
      issuing.current = false
    }
  }, [studentId, t])

  useEffect(() => {
    void issue()
    void refetchBalance()
  }, [issue, refetchBalance])

  // Đếm ngược; hết giờ thì tự lấy mã mới (chỉ khi hộp thoại còn mở — component này chỉ sống khi mở)
  useEffect(() => {
    if (!qr) return
    const tick = () => {
      const s = Math.max(0, Math.ceil((qr.until - Date.now()) / 1000))
      setLeft(s)
      if (s === 0) {
        void issue()
        void refetchBalance()
      }
    }
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [qr, issue, refetchBalance])

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-4 text-center">
      <p className="text-sm text-navy/70">{t('partners.qr.instructions')}</p>
      <FormError message={error} />
      <div className="relative w-full max-w-[320px] rounded-2xl bg-white p-3 ring-1 ring-navy/10">
        {qr ? (
          <img src={qr.img} alt={t('partners.qr.alt')} className={`aspect-square w-full ${left === 0 ? 'opacity-30' : ''}`} />
        ) : (
          <div className="flex aspect-square w-full items-center justify-center text-navy/50">{error ? '' : t('common.loading')}</div>
        )}
      </div>
      {qr && (
        <>
          <p className="font-mono text-sm tracking-wider text-navy/60 select-all">{qr.token}</p>
          <div className="w-full max-w-[320px] space-y-1">
            <div className="h-2 overflow-hidden rounded-full bg-navy/10">
              <div className="h-full rounded-full bg-linear-to-r from-bronze to-gold transition-all" style={{ width: `${(left / 60) * 100}%` }} />
            </div>
            <p className="text-sm text-navy/70">{left > 0 ? t('partners.qr.countdown', { count: left }) : t('partners.qr.refreshing')}</p>
          </div>
        </>
      )}
      {error && (
        <Button variant="outline" onClick={() => void issue()}>
          {t('partners.qr.retry')}
        </Button>
      )}

      <Card className="w-full space-y-2 p-4 text-left">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-semibold">{t('partners.qr.pointsTitle')}</span>
          <span className="text-2xl font-bold text-bronze">{balance.data ? Number(balance.data.balance) : '–'}</span>
        </div>
        {balance.data && balance.data.recent.length > 0 && (
          <ul className="space-y-1 text-sm">
            {balance.data.recent.slice(0, 5).map((r, i) => (
              <li key={i} className="flex justify-between gap-2">
                <span className="min-w-0 truncate text-navy/70">
                  {formatDateTime(r.created_at, i18n.language)} · {r.partner_name ?? t(`partners.ledgerReason.${r.reason}`)}
                </span>
                <span className={r.delta < 0 ? 'text-red-700' : 'font-semibold text-emerald-700'}>
                  {r.delta > 0 ? '+' : ''}
                  {r.delta}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Link to="/app/partners" className="text-sm font-semibold text-bronze">
        {t('partners.qr.seeOffers')}
      </Link>
    </div>
  )
}

function mapUrl(p: PublicPartner) {
  const q = p.lat != null && p.lng != null ? `${p.lat},${p.lng}` : p.address
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null
}

/** /app/partners · đối tác đang có ưu đãi cho người có Golf Passport. */
export function PartnerOffersPage() {
  const { t, i18n } = useTranslation()
  const localized = useLocalized()
  const q = useQuery({ queryKey: ['partner_public_list'], queryFn: () => callRpc<PublicPartner[]>('partner_public_list') })

  const chip = (o: PublicOffer) =>
    o.kind === 'percent' ? t('partners.offer.percent', { percent: o.percent }) : localized(o, 'bonus') || localized(o, 'name')

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link to="/app" className="inline-flex items-center gap-1 text-sm font-semibold text-bronze">
        <ArrowLeft className="h-4 w-4" /> {t('parent.nav.home')}
      </Link>
      <div>
        <h1 className="text-2xl font-bold">{t('partners.offers.title')}</h1>
        <p className="text-navy/65">{t('partners.offers.subtitle')}</p>
      </div>
      {q.isPending ? (
        <p className="text-navy/60">{t('common.loading')}</p>
      ) : q.isError ? (
        <p className="text-red-700">{t('errors.loadFailed')}</p>
      ) : q.data.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-6 text-center">
          <Mascot />
          <p className="font-semibold">{t('partners.offers.empty')}</p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {q.data.map((p) => {
            const map = mapUrl(p)
            const desc = localized(p, 'description')
            return (
              <li key={p.id}>
                <Card className="overflow-hidden">
                  {p.photo_url && <img src={p.photo_url} alt="" className="h-36 w-full object-cover" loading="lazy" />}
                  <div className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-lg font-bold">{p.name}</p>
                        <p className="flex items-center gap-1 text-sm text-navy/60">
                          <Store className="h-4 w-4 shrink-0" /> {t(`partners.kind.${p.kind}`)}
                        </p>
                      </div>
                    </div>
                    {desc && <p className="text-sm text-navy/75">{desc}</p>}
                    {(p.address || map) && (
                      <p className="flex items-start gap-1.5 text-sm text-navy/70">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-bronze" />
                        <span className="min-w-0">
                          {p.address}
                          {map && (
                            <>
                              {p.address ? ' · ' : ''}
                              <a href={map} target="_blank" rel="noreferrer" className="font-semibold text-bronze">
                                {t('partners.offers.map')}
                              </a>
                            </>
                          )}
                        </span>
                      </p>
                    )}
                    {p.offers.length > 0 && (
                      <ul className="space-y-2">
                        {p.offers.map((o) => {
                          const service = localized(o, 'service')
                          const cond = localized(o, 'conditions')
                          return (
                            <li key={o.id} className="rounded-xl bg-gold/10 p-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge tone="warn">
                                  <Gift className="mr-1 h-3.5 w-3.5" /> {chip(o)}
                                </Badge>
                                <span className="font-semibold">{localized(o, 'name')}</span>
                              </div>
                              {(service || cond || o.valid_to) && (
                                <p className="mt-1 text-sm text-navy/65">
                                  {[service, cond, o.valid_to ? t('partners.offers.validTo', { date: formatDate(o.valid_to, i18n.language) }) : null]
                                    .filter(Boolean)
                                    .join(' · ')}
                                </p>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>
                </Card>
              </li>
            )
          })}
        </ul>
      )}
      <p className="text-sm text-navy/55">{t('partners.offers.howTo')}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------------------------
// Mã giới thiệu: /r/<mã> lưu mã vào máy, đăng ký / đăng nhập xong thì gắn một lần (referral_claim)
// ---------------------------------------------------------------------------------------------------------------------

const REF_KEY = 'vnc_ref_code'

interface ClaimResult {
  ok: boolean
  reason?: 'already_linked' | 'code_not_found' | 'own_code' | 'account_too_old'
}

function readRefCode() {
  try {
    return localStorage.getItem(REF_KEY)
  } catch {
    return null
  }
}
function writeRefCode(code: string | null) {
  try {
    if (code) localStorage.setItem(REF_KEY, code)
    else localStorage.removeItem(REF_KEY)
  } catch {
    /* trình duyệt chặn lưu */
  }
}

function normalizeRef(code: string) {
  return code.trim().toUpperCase()
}

// Một lần gọi cho mỗi (tài khoản, mã) trong phiên trang — trang /r và hook có thể cùng chạy
const inflight = new Map<string, Promise<ClaimResult>>()
function claimOnce(userId: string, code: string) {
  const key = `${userId}:${code}`
  let p = inflight.get(key)
  if (!p) {
    p = callRpc<ClaimResult>('referral_claim', { p_code: code })
    inflight.set(key, p)
    // Lỗi mạng: cho phép thử lại lần sau
    p.catch(() => inflight.delete(key))
  }
  return p
}

/** Lỗi do máy chủ trả lời (có mã) → coi như đã xử lý xong; lỗi mạng (không mã) → giữ mã để thử lại. */
function isServerAnswer(e: unknown) {
  return Boolean((e as { code?: string } | null)?.code)
}

/**
 * Gắn mã giới thiệu đã lưu khi có phiên đăng nhập (mount trong AuthProvider hoặc layout).
 * Gọi referral_claim một lần rồi xoá mã, trừ khi lỗi mạng. Tài khoản con (tên + PIN) bỏ qua.
 */
export function useReferralClaim() {
  const { session, loading, studentId } = useAuth()
  const userId = session?.user.id
  useEffect(() => {
    if (!userId || loading) return
    const code = readRefCode()
    if (!code) return
    if (studentId) {
      writeRefCode(null)
      return
    }
    claimOnce(userId, normalizeRef(code)).then(
      () => writeRefCode(null),
      (e) => {
        if (isServerAnswer(e)) writeRefCode(null)
      },
    )
  }, [userId, loading, studentId])
}

/** /r/:code · trang công khai mở từ link giới thiệu. */
export function ReferralLanding() {
  const { code: raw = '' } = useParams()
  const { t } = useTranslation()
  const { session, loading, studentId } = useAuth()
  const code = normalizeRef(raw)
  const userId = session?.user.id

  // Chưa đăng nhập: lưu mã để gắn sau khi đăng ký / đăng nhập
  useEffect(() => {
    if (code && !userId) writeRefCode(code)
  }, [code, userId])

  const claim = useMutation({
    mutationFn: () => claimOnce(userId!, code),
    onSettled: (_d, e) => {
      if (!e || isServerAnswer(e)) writeRefCode(null)
    },
  })
  const claimMutate = claim.mutate
  const started = useRef(false)
  useEffect(() => {
    if (!userId || loading || !code || studentId || started.current) return
    started.current = true
    claimMutate()
  }, [userId, loading, code, studentId, claimMutate])

  return (
    <div className="mx-auto max-w-md space-y-4 py-6">
      <Card className="flex flex-col items-center gap-3 p-6 text-center">
        <Mascot />
        <h1 className="text-2xl font-bold">{t('partners.referral.title')}</h1>
        <p className="text-navy/75">{t('partners.referral.body')}</p>
        {code && (
          <p className="text-sm text-navy/60">
            {t('partners.referral.codeLabel')} <span className="font-mono font-semibold text-navy">{code}</span>
          </p>
        )}

        {!userId ? (
          loading ? (
            <p className="text-navy/60">{t('common.loading')}</p>
          ) : (
            <div className="flex w-full flex-col gap-2">
              <Button asChild size="full">
                <Link to="/signup">{t('partners.referral.signup')}</Link>
              </Button>
              <Button asChild size="full" variant="outline">
                <Link to="/login">{t('partners.referral.login')}</Link>
              </Button>
              <p className="text-xs text-navy/55">{t('partners.referral.saveHint')}</p>
            </div>
          )
        ) : (
          <>
            {claim.isPending && <p className="text-navy/60">{t('common.loading')}</p>}
            {claim.isError && <FormError message={t(partnerErrorKey(claim.error))} />}
            {claim.data && (
              <p
                className={`rounded-xl px-4 py-3 text-sm font-medium ${
                  claim.data.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-gold/20 text-brown'
                }`}
              >
                {claim.data.ok ? t('partners.referral.claimed') : t(`partners.referral.reason.${claim.data.reason ?? 'other'}`)}
              </p>
            )}
            {studentId && <p className="text-sm text-navy/60">{t('partners.referral.childAccount')}</p>}
            <Button asChild size="full">
              <Link to="/app">{t('partners.referral.continue')}</Link>
            </Button>
          </>
        )}
      </Card>
    </div>
  )
}
