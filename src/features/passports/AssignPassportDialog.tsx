import { useCallback, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Camera, Keyboard } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { checkCode, formatCode } from '@/lib/codes'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, FormError, Input } from '@/components/ui/form'
import { useToast } from '@/components/ui/toast'
import { QrScanner } from './QrScanner'

/** Dịch lỗi từ hàm CSDL (passport_not_found, student_has_passport:active…) sang câu dễ hiểu. */
export function usePassportError() {
  const { t } = useTranslation()
  return (e: unknown) => {
    const msg = String((e as { message?: string })?.message ?? '')
    const [key, detail] = msg.split(':')
    const known = ['passport_not_found', 'passport_not_available', 'student_has_passport', 'student_not_found', 'reason_required', 'passport_not_voidable', 'batch_not_found']
    if (known.includes(key)) {
      return t(`passports.errors.${key}`, { status: detail ? t(`passportStatus.${detail}`) : '' })
    }
    return msg || t('errors.generic')
  }
}

/** Gán sổ cho một học viên: quét QR bằng camera hoặc gõ mã (F11 cách 1). */
export function AssignPassportDialog({
  student,
  onClose,
  onAssigned,
}: {
  student: { id: string; full_name: string } | null
  onClose: () => void
  onAssigned?: () => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()
  const passportError = usePassportError()
  const [mode, setMode] = useState<'scan' | 'type'>('scan')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [scanKey, setScanKey] = useState(0)

  const assign = useMutation({
    mutationFn: async (c: string) => {
      const { data, error: e } = await supabase!.rpc('assign_passport', { p_code: c, p_student_id: student!.id })
      if (e) throw e
      return data as { code: string; already: boolean }
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['passports'] })
      qc.invalidateQueries({ queryKey: ['student'] })
      qc.invalidateQueries({ queryKey: ['class'] })
      toast(t(r.already ? 'passports.alreadyAssigned' : 'passports.assigned', { code: formatCode(r.code), name: student?.full_name }))
      setCode('')
      setError(null)
      onAssigned?.()
      onClose()
    },
    onError: (e) => {
      setError(passportError(e))
      setScanKey((k) => k + 1) // bật lại camera để quét sổ khác
    },
  })

  const submit = (raw: string) => {
    const check = checkCode(raw, 'passport')
    if (!check.ok) {
      setError(check.reason === 'invalid_chars' ? t('codes.invalidChars') : t('codes.wrongLength'))
      return
    }
    setError(null)
    assign.mutate(check.code)
  }
  const onScan = useCallback((c: string) => submit(c), [student]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Dialog open={student !== null} onClose={onClose} title={`${t('passports.assign')} · ${student?.full_name ?? ''}`}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-navy/5 p-1">
          {(['scan', 'type'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`flex min-h-11 items-center justify-center gap-2 rounded-lg text-sm font-semibold ${mode === m ? 'bg-white shadow-sm' : 'text-navy/60'}`}
            >
              {m === 'scan' ? <Camera className="h-4 w-4" /> : <Keyboard className="h-4 w-4" />}
              {t(`passports.mode.${m}`)}
            </button>
          ))}
        </div>
        {mode === 'scan' && student && <QrScanner key={scanKey} onCode={onScan} />}
        {mode === 'type' && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              submit(code)
            }}
          >
            <Field label={t('passports.code')} hint={t('codes.hint')}>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoCapitalize="characters"
                autoComplete="off"
                placeholder="XXXX-XXXX"
                className="font-mono text-lg tracking-widest"
              />
            </Field>
            <Button type="submit" size="full" disabled={assign.isPending}>
              {t('passports.assign')}
            </Button>
          </form>
        )}
        <FormError message={error} />
        {assign.isPending && <p className="text-navy/60">{t('common.loading')}</p>}
      </div>
    </Dialog>
  )
}
