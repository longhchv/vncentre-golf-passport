import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { RefreshCw, Send } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCode } from '@/lib/codes'
import { errorMessage } from '@/lib/db'
import { Button } from '@/components/ui/button'
import { Badge, Card } from '@/components/ui/card'
import { useToast } from '@/components/ui/toast'
import type { Student } from '@/lib/types'
import { InviteDialog } from './InviteDialog'

/** Mã kích hoạt in trên chứng nhận giấy (F4): xem, tạo lại (mã cũ mất hiệu lực); gửi lời mời riêng (F3). */
export function ClaimCodeCard({ student }: { student: Student & { claim_code_used_at?: string | null } }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()
  const [inviteOpen, setInviteOpen] = useState(false)
  const regen = useMutation({
    mutationFn: async () => {
      const { error } = await supabase!.rpc('regenerate_claim_code', { p_student_id: student.id })
      if (error) throw error
    },
    onSuccess: () => {
      toast(t('claim.regenerated'))
      qc.invalidateQueries({ queryKey: ['student', student.id] })
    },
    onError: (e) => toast(errorMessage(e, t), 'error'),
  })
  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm text-navy/60">{t('claim.codeLabel')}</p>
          <p className="font-mono text-xl font-bold">{student.claim_code ? formatCode(student.claim_code) : '—'}</p>
        </div>
        {student.claim_code_used_at ? <Badge tone="good">{t('claim.usedBadge')}</Badge> : <Badge>{t('claim.unusedBadge')}</Badge>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => setInviteOpen(true)}>
          <Send className="h-4 w-4" /> {t('invite.sendButton')}
        </Button>
        <Button size="sm" variant="ghost" disabled={regen.isPending} onClick={() => window.confirm(t('claim.confirmRegenerate')) && regen.mutate()}>
          <RefreshCw className="h-4 w-4" /> {t('claim.regenerate')}
        </Button>
      </div>
      <InviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} studentIds={[student.id]} />
    </Card>
  )
}
