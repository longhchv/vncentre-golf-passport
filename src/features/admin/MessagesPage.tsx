import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { formatDateTime, formatVnd } from '@/lib/i18nField'
import { Badge, Card, TableWrap, td, th } from '@/components/ui/card'
import { Select } from '@/components/ui/form'
import { Button } from '@/components/ui/button'

interface OtpLog {
  id: string
  target: string
  channel: 'zalo' | 'sms' | 'email'
  purpose: string
  status: string
  provider: string | null
  fallback_from: string | null
  error: string | null
  cost_vnd: number
  debug_code: string | null
  created_at: string
  expires_at: string | null
}

interface MonthlyCost {
  month: string
  channel: string
  messages: number
  delivered: number
  cost_vnd: number
}

/**
 * Admin · Tin nhắn và chi phí (F16): tin OTP/mời đã gửi, kênh, trạng thái, tổng chi phí theo tháng.
 * Chế độ thử (Zalo/SMS chưa có tài khoản): hiện mã OTP để thử nghiệm trên staging.
 */
export function MessagesPage() {
  const { t, i18n } = useTranslation()
  const [channel, setChannel] = useState('')
  const [limit, setLimit] = useState(50)

  const logs = useQuery({
    queryKey: ['otp_logs', channel, limit],
    refetchInterval: 10_000,
    queryFn: async () => {
      let q = supabase!.from('otp_logs').select('*').order('created_at', { ascending: false }).limit(limit)
      if (channel) q = q.eq('channel', channel)
      const { data, error } = await q
      if (error) throw error
      return data as OtpLog[]
    },
  })

  const costs = useQuery({
    queryKey: ['message_costs_monthly'],
    queryFn: async () => {
      const { data, error } = await supabase!.from('message_costs_monthly').select('*').order('month', { ascending: false }).limit(24)
      if (error) throw error
      return data as MonthlyCost[]
    },
  })

  const thisMonth = new Date().toISOString().slice(0, 7)
  const monthTotal = (costs.data ?? []).filter((c) => c.month.startsWith(thisMonth)).reduce((s, c) => s + Number(c.cost_vnd ?? 0), 0)
  const hasMock = logs.data?.some((l) => l.debug_code)

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">{t('admin.nav.messages')}</h1>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-sm text-navy/60">{t('messages.thisMonth')}</p>
          <p className="text-3xl font-bold">{formatVnd(monthTotal, i18n.language)}</p>
        </Card>
        {(['zalo', 'sms', 'email'] as const).map((c) => {
          const row = costs.data?.find((x) => x.month.startsWith(thisMonth) && x.channel === c)
          return c === 'email' ? null : (
            <Card key={c} className="p-4">
              <p className="text-sm text-navy/60">{t(`messages.channel.${c}`)} · {t('messages.thisMonthShort')}</p>
              <p className="text-3xl font-bold">{row?.messages ?? 0}</p>
            </Card>
          )
        })}
      </div>

      {hasMock && <p className="rounded-xl bg-gold/20 p-3 text-sm text-brown">{t('messages.mockNotice')}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <Select value={channel} onChange={(e) => setChannel(e.target.value)} className="max-w-xs">
          <option value="">{t('common.all')}</option>
          {(['zalo', 'sms', 'email'] as const).map((c) => (
            <option key={c} value={c}>
              {t(`messages.channel.${c}`)}
            </option>
          ))}
        </Select>
      </div>

      <TableWrap>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={th}>{t('messages.time')}</th>
              <th className={th}>{t('messages.recipient')}</th>
              <th className={th}>{t('messages.channelLabel')}</th>
              <th className={th}>{t('messages.purposeLabel')}</th>
              <th className={th}>{t('fields.status')}</th>
              <th className={th}>{t('messages.cost')}</th>
              <th className={th}>{t('messages.testCode')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy/10">
            {logs.data?.map((l) => (
              <tr key={l.id}>
                <td className={`${td} whitespace-nowrap text-sm`}>{formatDateTime(l.created_at, i18n.language)}</td>
                <td className={`${td} text-sm break-all`}>{l.target}</td>
                <td className={td}>
                  {t(`messages.channel.${l.channel}`)}
                  {l.provider?.endsWith('_mock') && <Badge className="ml-1">{t('messages.mock')}</Badge>}
                  {l.fallback_from && <div className="text-xs text-navy/55">{t('messages.fallback')}</div>}
                </td>
                <td className={`${td} text-sm`}>{t(`messages.purpose.${l.purpose}`, { defaultValue: l.purpose })}</td>
                <td className={td}>
                  <Badge tone={l.status === 'failed' || l.status === 'locked' ? 'bad' : l.status === 'used' || l.status === 'verified' ? 'good' : 'neutral'}>
                    {t(`messages.status.${l.status}`, { defaultValue: l.status })}
                  </Badge>
                  {l.error && <div className="text-xs text-red-700">{l.error}</div>}
                </td>
                <td className={`${td} whitespace-nowrap text-sm`}>{formatVnd(l.cost_vnd, i18n.language)}</td>
                <td className={`${td} font-mono text-lg font-bold`}>
                  {l.debug_code?.startsWith('http') ? (
                    <a href={l.debug_code} target="_blank" rel="noreferrer" className="text-sm font-semibold text-bronze underline">{t('messages.openLink')}</a>
                  ) : l.debug_code && l.status === 'sent' && (!l.expires_at || Date.parse(l.expires_at) > Date.now()) ? l.debug_code : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      {logs.data && logs.data.length >= limit && (
        <Button variant="outline" size="full" onClick={() => setLimit((x) => x + 50)}>
          {t('common.loadMore')}
        </Button>
      )}
    </div>
  )
}
