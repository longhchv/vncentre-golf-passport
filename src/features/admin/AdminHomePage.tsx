import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatVnd } from '@/lib/i18nField'
import { Card, TableWrap, td, th } from '@/components/ui/card'

interface Row { id: string; name: string; students: number; activated: number }
interface Dashboard {
  students: number
  activated: number
  guardian_accounts: number
  contacts_phone: number
  contacts_email: number
  by_school: Row[]
  by_class: Row[]
  queue: Record<string, number>
  orders_need_passport: number
  orders_pending: number
  invoices_requested: number
  message_cost_month: number
  messages_month: number
  certificates: number
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)

function Stat({ label, value, sub, to }: { label: string; value: string | number; sub?: string; to?: string }) {
  const body = (
    <Card className={`h-full p-4 ${to ? 'hover:border-bronze' : ''}`}>
      <p className="text-sm text-navy/60">{label}</p>
      <p className="text-3xl font-bold">{value}</p>
      {sub && <p className="text-sm text-navy/60">{sub}</p>}
    </Card>
  )
  return to ? <Link to={to} className="block">{body}</Link> : body
}

function ActivationTable({ title, rows }: { title: string; rows: Row[] }) {
  const { t } = useTranslation()
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-bold">{title}</h2>
      <TableWrap>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={th}>{t('dashboard.name')}</th>
              <th className={`${th} text-right`}>{t('dashboard.students')}</th>
              <th className={`${th} text-right`}>{t('dashboard.activated')}</th>
              <th className={th}>{t('dashboard.rate')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy/10">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className={td}>{r.name}</td>
                <td className={`${td} text-right`}>{r.students}</td>
                <td className={`${td} text-right`}>{r.activated}</td>
                <td className={`${td} min-w-32`}>
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 rounded-full bg-navy/10" aria-hidden>
                      <div className="h-2 rounded-full bg-bronze" style={{ width: `${pct(r.activated, r.students)}%` }} />
                    </div>
                    <span className="w-10 text-right text-sm">{pct(r.activated, r.students)}%</span>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td className={`${td} text-navy/50`} colSpan={4}>{t('common.empty')}</td></tr>}
          </tbody>
        </table>
      </TableWrap>
    </section>
  )
}

/** Bảng điều khiển admin (F16): học viên, tỉ lệ kích hoạt theo trường/lớp, liên hệ thu được, hàng chờ, đơn cần cấp sổ, chi phí tin nhắn. */
export function AdminHomePage() {
  const { t, i18n } = useTranslation()
  const q = useQuery({
    queryKey: ['admin_dashboard'],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('admin_dashboard')
      if (error) throw error
      return data as Dashboard
    },
  })
  const d = q.data
  const queueTotal = d ? Object.values(d.queue).reduce((a, b) => a + b, 0) : 0

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('admin.nav.dashboard')}</h1>
      {!d ? (
        <p className="text-navy/60">{q.isError ? t('errors.loadFailed') : t('common.loading')}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label={t('dashboard.students')} value={d.students} to="/admin/students" />
            <Stat label={t('dashboard.activationRate')} value={`${pct(d.activated, d.students)}%`} sub={t('dashboard.activatedOf', { a: d.activated, b: d.students })} />
            <Stat label={t('dashboard.contacts')} value={d.contacts_phone} sub={t('dashboard.contactsSub', { phone: d.contacts_phone, email: d.contacts_email })} />
            <Stat label={t('dashboard.parentAccounts')} value={d.guardian_accounts} />
            <Stat label={t('admin.nav.queue')} value={queueTotal} to="/admin/queue" />
            <Stat label={t('orders.view.needs_passport')} value={d.orders_need_passport}
              sub={t('dashboard.ordersSub', { pending: d.orders_pending, invoices: d.invoices_requested })} to="/admin/orders" />
            <Stat label={t('dashboard.messageCost')} value={formatVnd(d.message_cost_month, i18n.language)}
              sub={t('dashboard.messagesSub', { count: d.messages_month })} to="/admin/messages" />
            <Stat label={t('dashboard.certificates')} value={d.certificates} to="/admin/certificates" />
          </div>

          {queueTotal > 0 && (
            <Card className="space-y-2 p-4">
              <p className="font-semibold">{t('dashboard.queueDetail')}</p>
              <ul className="grid gap-1 sm:grid-cols-2">
                {Object.entries(d.queue).filter(([, n]) => n > 0).map(([k, n]) => (
                  <li key={k}>
                    <Link to="/admin/queue" className="flex items-center justify-between rounded-lg px-2 py-1 hover:bg-navy/5">
                      <span>{t(`review.section.${k}`)}</span>
                      <span className="flex items-center gap-1 font-semibold">{n} <ChevronRight className="h-4 w-4 text-bronze" /></span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <ActivationTable title={t('dashboard.bySchool')} rows={d.by_school} />
          <ActivationTable title={t('dashboard.byClass')} rows={d.by_class} />
        </>
      )}
    </div>
  )
}
