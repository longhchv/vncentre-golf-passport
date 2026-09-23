import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Checkbox, Field, FormError, Input, Select, Textarea } from '@/components/ui/form'

export type FieldType =
  | 'text' | 'number' | 'checkbox' | 'select' | 'textarea' | 'date' | 'color' | 'json' | 'email'
  /** Chọn nhiều giá trị trong `options`, lưu thành mảng */
  | 'multicheck'

export interface FieldSpec {
  name: string
  labelKey: string
  type?: FieldType
  required?: boolean
  hintKey?: string
  options?: { value: string; label: string }[]
  /** Chỉ hiện khi tạo mới / khoá khi sửa */
  readOnlyOnEdit?: boolean
}

type Values = Record<string, unknown>

function toInput(value: unknown, type: FieldType): string | boolean {
  if (type === 'checkbox') return Boolean(value)
  if (type === 'json') return value === undefined ? '' : JSON.stringify(value, null, 2)
  if (type === 'multicheck') return JSON.stringify(Array.isArray(value) ? value : [])
  return value === null || value === undefined ? '' : String(value)
}

function fromInput(raw: string | boolean, type: FieldType): unknown {
  if (type === 'checkbox') return Boolean(raw)
  const s = String(raw)
  if (type === 'json') return s.trim() === '' ? null : JSON.parse(s)
  if (type === 'multicheck') return JSON.parse(s)
  if (s.trim() === '') return null
  if (type === 'number') return Number(s)
  return s.trim()
}

/** Biểu mẫu tạo/sửa một dòng theo danh sách trường khai báo. */
export function EntityForm({
  fields,
  initial,
  isEdit,
  busy,
  onSubmit,
}: {
  fields: FieldSpec[]
  initial: Values
  isEdit: boolean
  busy?: boolean
  onSubmit: (values: Values) => void
}) {
  const { t } = useTranslation()
  const [state, setState] = useState<Record<string, string | boolean>>(() =>
    Object.fromEntries(fields.map((f) => [f.name, toInput(initial[f.name], f.type ?? 'text')])),
  )
  const [error, setError] = useState<string | null>(null)

  function handle(e: FormEvent) {
    e.preventDefault()
    const values: Values = {}
    for (const f of fields) {
      if (isEdit && f.readOnlyOnEdit) continue
      const type = f.type ?? 'text'
      try {
        values[f.name] = fromInput(state[f.name], type)
      } catch {
        return setError(t('errors.invalidJson', { field: t(f.labelKey) }))
      }
      if (type === 'number' && values[f.name] !== null && Number.isNaN(values[f.name])) {
        return setError(t('errors.invalidNumber', { field: t(f.labelKey) }))
      }
    }
    setError(null)
    onSubmit(values)
  }

  const set = (name: string, v: string | boolean) => setState((s) => ({ ...s, [name]: v }))

  return (
    <form onSubmit={handle} className="space-y-4">
      {fields.map((f) => {
        const type = f.type ?? 'text'
        const disabled = isEdit && f.readOnlyOnEdit
        const value = state[f.name]
        if (type === 'checkbox') {
          return (
            <Checkbox
              key={f.name}
              label={t(f.labelKey)}
              checked={Boolean(value)}
              disabled={disabled}
              onChange={(e) => set(f.name, e.target.checked)}
            />
          )
        }
        if (type === 'multicheck') {
          const selected: string[] = JSON.parse(String(value))
          const toggle = (v: string, on: boolean) =>
            set(f.name, JSON.stringify(on ? [...selected, v] : selected.filter((x) => x !== v)))
          return (
            <fieldset key={f.name} className="space-y-1">
              <legend className="text-sm font-semibold text-navy/80">{t(f.labelKey)}</legend>
              {f.options?.map((o) => (
                <Checkbox
                  key={o.value}
                  label={o.label}
                  checked={selected.includes(o.value)}
                  disabled={disabled}
                  onChange={(e) => toggle(o.value, e.target.checked)}
                />
              ))}
            </fieldset>
          )
        }
        return (
          <Field key={f.name} label={t(f.labelKey) + (f.required ? ' *' : '')} hint={f.hintKey ? t(f.hintKey) : undefined}>
            {type === 'select' ? (
              <Select value={String(value)} required={f.required} disabled={disabled} onChange={(e) => set(f.name, e.target.value)}>
                {!f.required && <option value="">—</option>}
                {f.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            ) : type === 'textarea' || type === 'json' ? (
              <Textarea
                value={String(value)}
                required={f.required}
                disabled={disabled}
                rows={type === 'json' ? 10 : 3}
                className={type === 'json' ? 'font-mono text-sm' : undefined}
                onChange={(e) => set(f.name, e.target.value)}
              />
            ) : (
              <Input
                type={type === 'number' ? 'text' : type}
                inputMode={type === 'number' ? 'numeric' : undefined}
                value={String(value)}
                required={f.required}
                disabled={disabled}
                onChange={(e) => set(f.name, e.target.value)}
              />
            )}
          </Field>
        )
      })}
      <FormError message={error} />
      <Button type="submit" size="full" disabled={busy}>
        {busy ? t('common.loading') : t('common.save')}
      </Button>
    </form>
  )
}
