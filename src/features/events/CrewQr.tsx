import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Download, Images, QrCode } from 'lucide-react'
import QRCode from 'qrcode'
import { formatCode } from '@/lib/codes'
import { usePublicBaseUrl } from '@/lib/settings'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { passportUrl } from '@/features/passports/exports'

// Ảnh QR để in thẻ đeo: 1024 px, viền 2 ô, đen trên trắng, mức sửa lỗi M (in nhỏ vẫn quét được)
const QR_OPTIONS = { width: 1024, margin: 2, errorCorrectionLevel: 'M' as const, color: { dark: '#000000', light: '#ffffff' } }

/** Tên file không dấu: QR-<ô>-<họ tên>-<mã thẻ>.png */
export function crewQrFileName(fullName: string, slotCode: string | null, code: string) {
  const name = fullName.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return ['QR', slotCode, name, code].filter(Boolean).join('-') + '.png'
}

export async function downloadCrewQr(url: string, fileName: string) {
  const dataUrl = await QRCode.toDataURL(url, QR_OPTIONS)
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/** Thẻ "Mã QR thẻ BTC" trong checklist của từng người: hiện QR, link, nút tải PNG để in thẻ đeo. */
export function CrewQrCard({ code, fullName, slotCode, badgeLabel }: { code: string; fullName: string; slotCode: string | null; badgeLabel: string | null }) {
  const { t } = useTranslation()
  const url = passportUrl(usePublicBaseUrl(), code)
  const img = useQuery({ queryKey: ['crew-qr', url], staleTime: Infinity, queryFn: () => QRCode.toDataURL(url, QR_OPTIONS) })
  return (
    <Card className="space-y-3 p-4 text-center">
      <p className="flex items-center justify-center gap-2 font-semibold"><QrCode className="h-5 w-5" /> {t('crewQr.title', { label: badgeLabel ?? '' })}</p>
      {img.data && <img src={img.data} alt={url} className="mx-auto h-56 w-56 rounded-lg ring-1 ring-navy/10" />}
      <p className="break-all text-xs text-navy/55">{url}</p>
      <p className="text-sm text-navy/65">{fullName} · {formatCode(code)}{slotCode ? ` · ${slotCode}` : ''}</p>
      <Button size="full" variant="outline" onClick={() => downloadCrewQr(url, crewQrFileName(fullName, slotCode, code))}>
        <Download className="h-5 w-5" /> {t('crewQr.download')}
      </Button>
      <p className="text-xs text-navy/50">{t('crewQr.hint')}</p>
    </Card>
  )
}

/**
 * Link mở Bộ kit truyền thông (/kit/) cho người này: chỉ mang mã thẻ trong phần # (không gửi lên máy chủ).
 * Bộ kit tự hỏi hệ thống tên, vai, vị trí; Điều phối chung (vai A) thấy đủ các mục, người khác cố định theo vai được giao.
 */
export function crewKitUrl(code: string) {
  return `/kit/#${new URLSearchParams({ ma: code }).toString()}`
}

export function CrewKitButton({ code }: { code: string }) {
  const { t } = useTranslation()
  return (
    <Card className="space-y-2 p-4 text-center">
      <Button asChild size="full">
        <a href={crewKitUrl(code)} target="_blank" rel="noreferrer"><Images className="h-5 w-5" /> {t('crewQr.kit')}</a>
      </Button>
      <p className="text-xs text-navy/55">{t('crewQr.kitHint')}</p>
    </Card>
  )
}
