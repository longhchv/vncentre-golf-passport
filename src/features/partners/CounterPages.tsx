import { useCallback, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, CheckCircle2, Keyboard, QrCode, RotateCcw } from 'lucide-react'
import { formatDateTime, formatVnd, useLocalized } from '@/lib/i18nField'
import { Button } from '@/components/ui/button'
import { Badge, Card } from '@/components/ui/card'
import { Field, FormError, Input, Select } from '@/components/ui/form'
import { Mascot } from '@/components/Mascot'
import { QrScanner } from '@/features/passports/QrScanner'
import { callRpc, digitsOnly, groupThousands, partnerErrorKey, type OfferBase } from './shared'

// Quầy đối tác /partner (spec 18 mục 3, 5). Quyền ở hàm SQL: partner_scan / partner_record_visit / partner_today_visits /
// partner_void_visit chỉ cho nhân viên quầy của đúng đối tác. Quầy chỉ thấy tên che bớt + hạng sổ, không SĐT, ngày sinh.

interface MyPartner {
  id: string
  name: string
  status: string
  role: 'cashier' | 'manager'
}

interface CounterOffer extends OfferBase {
  points_mode: 'per_amount' | 'fixed'
  fixed_points: number | null
}

interface ScanResult {
  name: string
  tier: { code: string; name_vi: string; name_en: string | null } | null
  expires_at: string
  used_today: number
  limit_reached: boolean
  offers: CounterOffer[]
}

interface RecordResult {
  id: string
  status: 'recorded' | 'flagged'
  points: number
}

interface TodayVisit {
  id: string
  created_at: string
  name: string
  offer_vi: string | null
  offer_en: string | null
  list_amount: number
  paid_amount: number
  invoice_no: string | null
  points: number
  status: 'recorded' | 'flagged' | 'void'
  mine: boolean
  can_void: boolean
}

const PARTNER_KEY = 'vnc_partner_counter'

function readSavedPartner() {
  try {
    return localStorage.getItem(PARTNER_KEY)
  } catch {
    return null
  }
}

/** Mã khách: GPP-XXXXXXXXXXXXXXXX (nếu QR là đường dẫn thì lấy phần GPP-… trong đó). */
function tokenFromText(text: string) {
  const s = text.trim()
  const m = s.match(/GPP-[A-Za-z0-9]+/i)
  return m ? 'GPP-' + m[0].slice(4).toUpperCase() : s.toUpperCase()
}

/** /partner · màn hình quầy: chọn đối tác → quét QR khách → nhập hoá đơn → lưu; bên dưới là lượt trong ngày. */
export function PartnerCounterHome() {
  const { t } = useTranslation()
  const partners = useQuery({ queryKey: ['partner_my_partners'], queryFn: () => callRpc<MyPartner[]>('partner_my_partners') })
  const [picked, setPicked] = useState<string | null>(readSavedPartner)

  const list = partners.data ?? []
  const partnerId = list.length === 1 ? list[0].id : list.find((p) => p.id === picked)?.id ?? null
  const partner = list.find((p) => p.id === partnerId) ?? null

  const choose = (id: string) => {
    setPicked(id)
    try {
      localStorage.setItem(PARTNER_KEY, id)
    } catch {
      /* trình duyệt chặn lưu: chỉ phải chọn lại */
    }
  }

  if (partners.isPending) return <p className="text-navy/60">{t('common.loading')}</p>
  if (partners.isError) return <p className="text-red-700">{t('errors.loadFailed')}</p>
  if (list.length === 0)
    return (
      <Card className="mx-auto flex max-w-lg flex-col items-center gap-3 p-6 text-center">
        <Mascot />
        <p className="font-semibold">{t('partners.counter.noPartner')}</p>
        <p className="text-sm text-navy/60">{t('partners.counter.noPartnerHint')}</p>
      </Card>
    )

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{t('partners.counter.title')}</h1>
        {list.length === 1 && partner && <p className="font-semibold text-bronze">{partner.name}</p>}
      </div>

      {list.length > 1 && (
        <Field label={t('partners.counter.pickPartner')}>
          <Select value={partnerId ?? ''} onChange={(e) => choose(e.target.value)}>
            <option value="" disabled>
              {t('partners.counter.pickPartnerPlaceholder')}
            </option>
            {list.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
      )}

      {partner && partner.status !== 'active' && (
        <p className="rounded-xl bg-gold/20 px-4 py-3 text-sm font-medium text-brown">{t('partners.errors.partner_inactive')}</p>
      )}

      {partnerId && (
        <>
          <CounterFlow key={partnerId} partnerId={partnerId} />
          <TodayVisits partnerId={partnerId} />
        </>
      )}
    </div>
  )
}

function CounterFlow({ partnerId }: { partnerId: string }) {
  const { t, i18n } = useTranslation()
  const localized = useLocalized()
  const qc = useQueryClient()

  const [token, setToken] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanKey, setScanKey] = useState(0)
  const [manual, setManual] = useState('')
  const [scan, setScan] = useState<ScanResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [offerId, setOfferId] = useState('')
  const [list, setList] = useState('')
  const [paid, setPaid] = useState('')
  const [paidTouched, setPaidTouched] = useState(false)
  const [invoice, setInvoice] = useState('')
  const [result, setResult] = useState<RecordResult | null>(null)

  const lookup = useMutation({
    mutationFn: (tok: string) => callRpc<ScanResult>('partner_scan', { p_partner_id: partnerId, p_token: tok }),
    onSuccess: (data, tok) => {
      setToken(tok)
      setScan(data)
      setError(null)
      setResult(null)
      // Chỉ một ưu đãi thì chọn sẵn
      setOfferId((cur) => (data.offers.some((o) => o.id === cur) ? cur : data.offers.length === 1 ? data.offers[0].id : ''))
    },
    onError: (e) => {
      setScan(null)
      setToken(null)
      setError(t(partnerErrorKey(e)))
    },
  })

  // Dùng nội dung QR gốc (rawText), không dùng mã đã chuẩn hoá cho sổ
  const lookupMutate = lookup.mutate
  const onCode = useCallback(
    (_code: string, raw: string) => {
      setScanning(false)
      lookupMutate(tokenFromText(raw))
    },
    [lookupMutate],
  )

  const offer = scan?.offers.find((o) => o.id === offerId) ?? null

  // Gợi ý số tiền khách trả = giá niêm yết trừ % giảm (quầy vẫn sửa được)
  useEffect(() => {
    if (paidTouched || !list) return
    const l = Number(list)
    const pct = offer?.kind === 'percent' && offer.percent ? offer.percent : 0
    setPaid(String(Math.round((l * (100 - pct)) / 100)))
  }, [list, offer, paidTouched])

  const save = useMutation({
    mutationFn: () =>
      callRpc<RecordResult>('partner_record_visit', {
        p: {
          partner_id: partnerId,
          token,
          offer_id: offerId || null,
          list_amount: list ? Number(list) : Number(paid),
          paid_amount: Number(paid),
          invoice_no: invoice.trim() || null,
        },
      }),
    onSuccess: (r) => {
      setResult(r)
      setError(null)
      qc.invalidateQueries({ queryKey: ['partner_today_visits', partnerId] })
    },
    onError: (e) => {
      const key = partnerErrorKey(e)
      setError(t(key))
      // Mã đã hết hạn / dùng rồi: phải quét mã mới, giữ nguyên số tiền đã nhập
      if (key.endsWith('qr_expired') || key.endsWith('qr_invalid') || key.endsWith('daily_limit')) {
        setScan(null)
        setToken(null)
      }
    },
  })

  const reset = () => {
    setToken(null)
    setScan(null)
    setResult(null)
    setError(null)
    setOfferId('')
    setList('')
    setPaid('')
    setPaidTouched(false)
    setInvoice('')
    setManual('')
  }

  const canSave =
    !!token && !!scan && !scan.limit_reached && paid !== '' && (scan.offers.length === 0 || !!offerId) && !save.isPending

  const offerLabel = (o: OfferBase) =>
    o.kind === 'percent' ? t('partners.offer.percent', { percent: o.percent }) : localized(o, 'bonus') || localized(o, 'name')

  // Kết quả sau khi lưu
  if (result) {
    const flagged = result.status === 'flagged'
    return (
      <Card className="space-y-3 p-5 text-center">
        {flagged ? (
          <AlertTriangle className="mx-auto h-10 w-10 text-bronze" />
        ) : (
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
        )}
        <p className="text-lg font-bold">{flagged ? t('partners.counter.flagged') : t('partners.counter.saved')}</p>
        {flagged ? (
          <p className="text-sm text-navy/70">{t('partners.counter.flaggedHint')}</p>
        ) : (
          <p className="text-navy/80">{t('partners.counter.pointsAdded', { count: result.points })}</p>
        )}
        <Button size="full" onClick={reset}>
          <QrCode className="h-5 w-5" /> {t('partners.counter.nextCustomer')}
        </Button>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <FormError message={error} />

      {!scan ? (
        <Card className="space-y-3 p-4">
          <p className="font-semibold">{t('partners.counter.scanTitle')}</p>
          {scanning ? (
            <>
              <QrScanner key={scanKey} onCode={onCode} hint={t('partners.counter.scanHint')} />
              <Button variant="outline" size="full" onClick={() => setScanning(false)}>
                {t('common.cancel')}
              </Button>
            </>
          ) : (
            <Button
              size="full"
              disabled={lookup.isPending}
              onClick={() => {
                setError(null)
                setScanKey((k) => k + 1)
                setScanning(true)
              }}
            >
              <QrCode className="h-5 w-5" /> {lookup.isPending ? t('common.loading') : t('partners.counter.scanButton')}
            </Button>
          )}
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault()
              const tok = tokenFromText(manual)
              if (tok) {
                setScanning(false)
                lookup.mutate(tok)
              }
            }}
          >
            <span className="flex items-center gap-1.5 text-sm font-semibold text-navy/70">
              <Keyboard className="h-4 w-4" /> {t('partners.counter.manualLabel')}
            </span>
            <div className="flex gap-2">
              <Input
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                placeholder="GPP-XXXXXXXXXXXXXXXX"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                className="font-mono"
              />
              <Button type="submit" variant="outline" disabled={!manual.trim() || lookup.isPending}>
                {t('partners.counter.check')}
              </Button>
            </div>
          </form>
        </Card>
      ) : (
        <Card className="space-y-4 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-navy/60">{t('partners.counter.customer')}</p>
              <p className="truncate text-xl font-bold">{scan.name}</p>
              {scan.tier ? (
                <Badge tone="warn" className="mt-1">
                  {localized(scan.tier, 'name')}
                </Badge>
              ) : (
                <p className="text-sm text-navy/55">{t('partners.counter.noTier')}</p>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={reset} aria-label={t('partners.counter.rescan')}>
              <RotateCcw className="h-4 w-4" /> {t('partners.counter.rescan')}
            </Button>
          </div>

          {scan.limit_reached && (
            <div className="flex gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <span>{t('partners.counter.limitReached', { count: scan.used_today })}</span>
            </div>
          )}

          {!scan.limit_reached && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault()
                if (canSave) save.mutate()
              }}
            >
              {scan.offers.length === 0 ? (
                <p className="text-sm text-navy/60">{t('partners.counter.noOffers')}</p>
              ) : (
                <fieldset className="space-y-2">
                  <legend className="mb-1.5 text-sm font-semibold text-navy/80">{t('partners.counter.chooseOffer')}</legend>
                  {scan.offers.map((o) => (
                    <label
                      key={o.id}
                      className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border-2 px-3 py-2 ${
                        offerId === o.id ? 'border-bronze bg-gold/10' : 'border-navy/15 bg-white'
                      }`}
                    >
                      <input
                        type="radio"
                        name="offer"
                        className="h-5 w-5 shrink-0 accent-bronze"
                        checked={offerId === o.id}
                        onChange={() => setOfferId(o.id)}
                      />
                      <span className="min-w-0">
                        <span className="block font-semibold">{localized(o, 'name')}</span>
                        <span className="block text-sm text-navy/65">
                          {offerLabel(o)}
                          {o.points_mode === 'fixed' && o.fixed_points != null
                            ? ' · ' + t('partners.counter.fixedPoints', { count: o.fixed_points })
                            : ''}
                        </span>
                      </span>
                    </label>
                  ))}
                </fieldset>
              )}

              <Field label={t('partners.counter.listAmount')} hint={t('partners.counter.listAmountHint')}>
                <MoneyInput value={list} onChange={setList} />
              </Field>
              <Field label={t('partners.counter.paidAmount')}>
                <MoneyInput
                  value={paid}
                  onChange={(v) => {
                    setPaidTouched(true)
                    setPaid(v)
                  }}
                  required
                />
              </Field>
              {paid !== '' && <p className="-mt-2 text-sm text-navy/60">{formatVnd(Number(paid), i18n.language)}</p>}
              <Field label={t('partners.counter.invoiceNo')}>
                <Input value={invoice} onChange={(e) => setInvoice(e.target.value)} autoComplete="off" />
              </Field>

              <Button type="submit" size="full" disabled={!canSave}>
                {save.isPending ? t('common.loading') : t('common.save')}
              </Button>
            </form>
          )}
        </Card>
      )}
    </div>
  )
}

/** Ô số tiền: bàn phím số, hiện dấu chấm hàng nghìn, giá trị là chuỗi chữ số. */
function MoneyInput({ value, onChange, required }: { value: string; onChange: (v: string) => void; required?: boolean }) {
  return (
    <div className="relative">
      <Input
        inputMode="numeric"
        autoComplete="off"
        value={groupThousands(value)}
        onChange={(e) => onChange(digitsOnly(e.target.value).slice(0, 12))}
        required={required}
        className="pr-10 text-right text-lg font-semibold tabular-nums"
      />
      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-navy/50">đ</span>
    </div>
  )
}

function TodayVisits({ partnerId }: { partnerId: string }) {
  const { t, i18n } = useTranslation()
  const localized = useLocalized()
  const qc = useQueryClient()
  const visits = useQuery({
    queryKey: ['partner_today_visits', partnerId],
    queryFn: () => callRpc<TodayVisit[]>('partner_today_visits', { p_partner_id: partnerId }),
    refetchInterval: 60_000,
  })
  const [voiding, setVoiding] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const voidVisit = useMutation({
    mutationFn: (id: string) => callRpc<null>('partner_void_visit', { p_visit_id: id, p_reason: reason.trim() }),
    onSuccess: () => {
      setVoiding(null)
      setReason('')
      setError(null)
      qc.invalidateQueries({ queryKey: ['partner_today_visits', partnerId] })
    },
    onError: (e) => setError(t(partnerErrorKey(e))),
  })

  const rows = visits.data ?? []
  const total = rows.filter((v) => v.status !== 'void').reduce((s, v) => s + Number(v.paid_amount), 0)

  return (
    <section className="space-y-2 pt-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold">{t('partners.today.title')}</h2>
        {rows.length > 0 && (
          <span className="text-sm text-navy/60">
            {t('partners.today.summary', { count: rows.filter((v) => v.status !== 'void').length, total: formatVnd(total, i18n.language) })}
          </span>
        )}
      </div>
      {visits.isPending ? (
        <p className="text-navy/60">{t('common.loading')}</p>
      ) : visits.isError ? (
        <p className="text-red-700">{t('errors.loadFailed')}</p>
      ) : rows.length === 0 ? (
        <p className="text-navy/60">{t('partners.today.empty')}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((v) => (
            <li key={v.id}>
              <Card className={`space-y-2 p-3 ${v.status === 'void' ? 'opacity-60' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{v.name}</p>
                    <p className="text-sm text-navy/60">
                      {[
                        formatDateTime(v.created_at, i18n.language),
                        localized({ offer_vi: v.offer_vi, offer_en: v.offer_en }, 'offer') || null,
                        v.invoice_no ? t('partners.today.invoice', { no: v.invoice_no }) : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <StatusBadge status={v.status} />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>
                    <span className={v.status === 'void' ? 'line-through' : 'font-semibold'}>{formatVnd(Number(v.paid_amount), i18n.language)}</span>
                    {Number(v.list_amount) !== Number(v.paid_amount) && (
                      <span className="ml-1.5 text-navy/50 line-through">{formatVnd(Number(v.list_amount), i18n.language)}</span>
                    )}
                    {v.status === 'recorded' && <span className="ml-2 text-bronze">+{t('partners.points', { count: v.points })}</span>}
                  </span>
                  {v.can_void && voiding !== v.id && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-700"
                      onClick={() => {
                        setVoiding(v.id)
                        setReason('')
                        setError(null)
                      }}
                    >
                      {t('partners.today.void')}
                    </Button>
                  )}
                </div>
                {voiding === v.id && (
                  <form
                    className="space-y-2 border-t border-navy/10 pt-2"
                    onSubmit={(e) => {
                      e.preventDefault()
                      if (reason.trim()) voidVisit.mutate(v.id)
                    }}
                  >
                    <Field label={t('partners.today.voidReason')}>
                      <Input value={reason} onChange={(e) => setReason(e.target.value)} autoFocus required />
                    </Field>
                    <FormError message={error} />
                    <div className="flex gap-2">
                      <Button type="submit" size="sm" disabled={!reason.trim() || voidVisit.isPending}>
                        {t('partners.today.voidConfirm')}
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => setVoiding(null)}>
                        {t('common.cancel')}
                      </Button>
                    </div>
                  </form>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-navy/50">{t('partners.today.voidHint')}</p>
    </section>
  )
}

function StatusBadge({ status }: { status: TodayVisit['status'] }) {
  const { t } = useTranslation()
  const tone = status === 'recorded' ? 'good' : status === 'flagged' ? 'warn' : 'bad'
  return (
    <Badge tone={tone} className="shrink-0">
      {t(`partners.visitStatus.${status}`)}
    </Badge>
  )
}
