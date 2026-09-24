import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Send } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatVnd } from '@/lib/i18nField'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { FormError } from '@/components/ui/form'

interface Estimate {
  recipients: number
  by_channel: { zalo: number; email: number }
  cost_vnd: number
  unit_price_zalo: number
  skipped: { already_active: number; no_contact: number }
}

const CHUNK = 50

async function call(body: Record<string, unknown>) {
  const { data, error } = await supabase!.functions.invoke('send-invitations', { body })
  if (error) {
    const ctx = (error as { context?: Response }).context
    const detail = ctx ? await ctx.json().catch(() => null) : null
    throw new Error(detail?.error ?? error.message)
  }
  return data
}

/**
 * Gửi lời mời kích hoạt (F3): chọn kênh (Zalo mặc định / email) → xem ước tính số tin, chi phí,
 * số em bỏ qua → xác nhận → gửi theo từng nhóm 50 em.
 */
export function InviteDialog({ studentIds, open, onClose }: { studentIds: string[]; open: boolean; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const [channel, setChannel] = useState<'zalo' | 'email'>('zalo')
  const [estimate, setEstimate] = useState<Estimate | null>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const [result, setResult] = useState<{ sent: number; failed: number; cost: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || !studentIds.length) return
    setEstimate(null)
    setResult(null)
    setError(null)
    ;(async () => {
      try {
        // Ước tính: cộng dồn theo từng nhóm
        const total: Estimate = { recipients: 0, by_channel: { zalo: 0, email: 0 }, cost_vnd: 0, unit_price_zalo: 0, skipped: { already_active: 0, no_contact: 0 } }
        for (let i = 0; i < studentIds.length; i += CHUNK) {
          const e = (await call({ student_ids: studentIds.slice(i, i + CHUNK), channel, dry_run: true })) as Estimate
          total.recipients += e.recipients
          total.by_channel.zalo += e.by_channel.zalo
          total.by_channel.email += e.by_channel.email
          total.cost_vnd += e.cost_vnd
          total.unit_price_zalo = e.unit_price_zalo
          total.skipped.already_active += e.skipped.already_active
          total.skipped.no_contact += e.skipped.no_contact
        }
        setEstimate(total)
      } catch (e) {
        setError(String((e as Error).message))
      }
    })()
  }, [open, studentIds, channel])

  async function send() {
    setBusy(true)
    setError(null)
    const sum = { sent: 0, failed: 0, cost: 0 }
    try {
      for (let i = 0; i < studentIds.length; i += CHUNK) {
        setProgress(t('invite.sending', { done: Math.min(i + CHUNK, studentIds.length), total: studentIds.length }))
        const r = (await call({ student_ids: studentIds.slice(i, i + CHUNK), channel, dry_run: false })) as { sent: number; failed: number; cost_vnd: number }
        sum.sent += r.sent
        sum.failed += r.failed
        sum.cost += r.cost_vnd
      }
      setResult(sum)
      qc.invalidateQueries({ queryKey: ['otp_logs'] })
    } catch (e) {
      setError(String((e as Error).message))
    } finally {
      setProgress(null)
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={t('invite.sendTitle', { count: studentIds.length })}>
      <div className="space-y-4">
        {result ? (
          <Card className="space-y-1 p-4">
            <p className="text-lg font-bold">{t('invite.sentResult', { sent: result.sent, failed: result.failed })}</p>
            <p className="text-navy/70">{t('invite.costResult', { cost: formatVnd(result.cost, i18n.language) })}</p>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              {(['zalo', 'email'] as const).map((c) => (
                <Button key={c} variant={channel === c ? 'primary' : 'outline'} onClick={() => setChannel(c)} disabled={busy}>
                  {t(`messages.channel.${c}`)}
                </Button>
              ))}
            </div>
            <p className="text-sm text-navy/60">{t(channel === 'zalo' ? 'invite.zaloHint' : 'invite.emailHint')}</p>
            {!estimate && !error && <p className="text-navy/60">{t('invite.estimating')}</p>}
            {estimate && (
              <Card className="space-y-2 p-4">
                <p className="font-bold">{t('invite.estimateTitle')}</p>
                <p>{t('invite.recipients', { count: estimate.recipients, zalo: estimate.by_channel.zalo, email: estimate.by_channel.email })}</p>
                <p className="text-xl font-bold">
                  {t('invite.estimatedCost', { cost: formatVnd(estimate.cost_vnd, i18n.language) })}
                </p>
                <p className="text-sm text-navy/60">{t('invite.unitPrice', { price: formatVnd(estimate.unit_price_zalo, i18n.language) })}</p>
                {(estimate.skipped.already_active > 0 || estimate.skipped.no_contact > 0) && (
                  <p className="text-sm text-brown">{t('invite.skipped', { active: estimate.skipped.already_active, noContact: estimate.skipped.no_contact })}</p>
                )}
              </Card>
            )}
            <FormError message={error ? t(`invite.errors.${error}`, { defaultValue: error }) : null} />
            {progress && <p className="text-sm text-navy/70">{progress}</p>}
            <Button size="full" disabled={busy || !estimate || estimate.recipients === 0} onClick={send}>
              <Send className="h-4 w-4" /> {busy ? t('common.loading') : t('invite.confirmSend', { count: estimate?.recipients ?? 0 })}
            </Button>
          </>
        )}
      </div>
    </Dialog>
  )
}
