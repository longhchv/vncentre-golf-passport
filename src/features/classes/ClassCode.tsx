import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Copy, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useToast } from '@/components/ui/toast'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/db'

/** Mã lớp 6 ký tự HLV gửi trong nhóm Zalo lớp; đổi mã được (F14). */
export function ClassCode({ classId, code, canChange }: { classId: string; code: string; canChange: boolean }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()

  const regenerate = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase!.rpc('regenerate_class_code', { p_class_id: classId })
      if (error) throw error
      return data as string
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['class', classId] })
      qc.invalidateQueries({ queryKey: ['classes'] })
      qc.invalidateQueries({ queryKey: ['my-classes'] })
      toast(t('classes.codeChanged'))
    },
    onError: (e) => toast(errorMessage(e, t), 'error'),
  })

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      toast(t('common.copied'))
    } catch {
      toast(code)
    }
  }

  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div>
        <p className="text-sm text-navy/60">{t('classes.joinCode')}</p>
        <p className="font-mono text-3xl font-bold tracking-[0.2em]">{code}</p>
        <p className="text-sm text-navy/55">{t('classes.joinCodeHint')}</p>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={copy}>
          <Copy className="h-4 w-4" /> {t('common.copy')}
        </Button>
        {canChange && (
          <Button
            size="sm"
            variant="outline"
            disabled={regenerate.isPending}
            onClick={() => {
              if (window.confirm(t('classes.confirmChangeCode'))) regenerate.mutate()
            }}
          >
            <RefreshCw className="h-4 w-4" /> {t('classes.changeCode')}
          </Button>
        )}
      </div>
    </Card>
  )
}
