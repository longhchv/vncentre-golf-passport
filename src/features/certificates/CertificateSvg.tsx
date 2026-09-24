import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import QRCode from 'qrcode'
import '@fontsource/noto-serif/400.css'
import '@fontsource/noto-serif/700.css'
import '@fontsource/noto-serif/400-italic.css'
import '@fontsource/great-vibes/400.css'
import '@fontsource/montserrat/400.css'
import '@fontsource/montserrat/500.css'
import { supabase } from '@/lib/supabase'
import {
  buildCertificate, CERT_H, CERT_W, type CertElement, type CertFont, type CertificateData,
} from '../../../supabase/functions/_shared/certificateLayout'

const FONT: Record<CertFont, { family: string; weight: number; style: 'normal' | 'italic' }> = {
  serif: { family: 'Noto Serif', weight: 400, style: 'normal' },
  serifBold: { family: 'Noto Serif', weight: 700, style: 'normal' },
  serifItalic: { family: 'Noto Serif', weight: 400, style: 'italic' },
  script: { family: 'Great Vibes', weight: 400, style: 'normal' },
  sans: { family: 'Montserrat', weight: 400, style: 'normal' },
  sansMedium: { family: 'Montserrat', weight: 500, style: 'normal' },
}

/** Link có hạn cho nền / chữ ký trong kho riêng tư certificate-assets. */
function useAssetUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ['certificate-asset', path],
    enabled: Boolean(path),
    staleTime: 50 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase!.storage.from('certificate-assets').createSignedUrl(path!, 3600)
      if (error) throw error
      return data.signedUrl
    },
  })
}

/** Chờ font chứng nhận tải xong để đo chữ đúng (thu nhỏ chữ dài như bản PDF). */
function useCertFontsReady() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let alive = true
    const loads = Object.values(FONT).map((f) => document.fonts.load(`${f.style} ${f.weight} 40px "${f.family}"`, 'Aăâ Việt'))
    Promise.allSettled(loads).then(() => alive && setReady(true))
    return () => { alive = false }
  }, [])
  return ready
}

let measureCtx: CanvasRenderingContext2D | null = null
function fitSize(el: Extract<CertElement, { kind: 'text' }>) {
  if (!el.maxWidth) return el.size
  measureCtx ??= document.createElement('canvas').getContext('2d')
  if (!measureCtx) return el.size
  const f = FONT[el.font]
  measureCtx.font = `${f.style} ${f.weight} ${el.size}px "${f.family}"`
  const w = measureCtx.measureText(el.text).width + (el.letterSpacing ?? 0) * Math.max(0, [...el.text].length - 1)
  return w > el.maxWidth ? el.size * (el.maxWidth / w) : el.size
}

function QrRects({ value, x, y, size, color }: { value: string; x: number; y: number; size: number; color: string }) {
  const path = useMemo(() => {
    const qr = QRCode.create(value, { errorCorrectionLevel: 'M' })
    const n = qr.modules.size
    const cell = size / n
    let d = ''
    for (let r = 0; r < n; r++) {
      let c = 0
      while (c < n) {
        if (!qr.modules.get(r, c)) { c++; continue }
        const start = c
        while (c < n && qr.modules.get(r, c)) c++
        d += `M${x + start * cell} ${y + r * cell}h${(c - start) * cell}v${cell}h${-(c - start) * cell}z`
      }
    }
    return d
  }, [value, x, y, size])
  return <path d={path} fill={color} shapeRendering="crispEdges" />
}

/**
 * Chứng nhận dựng bằng SVG theo đúng bố cục của bản PDF (certificateLayout.ts) — để xem trên app
 * (phụ huynh, học viên) và xem trước khi phát hành. File PDF chính thức do máy chủ tạo.
 */
export function CertificateSvg({ data, className, assetUrls }: {
  data: CertificateData
  className?: string
  /** Dùng ảnh có sẵn thay cho kho riêng tư (xem thử khi chưa đăng nhập) */
  assetUrls?: { background?: string; signature?: string }
}) {
  const ready = useCertFontsReady()
  const bg = useAssetUrl(assetUrls?.background ? null : data.background_path || 'templates/default/background.jpg')
  const sig = useAssetUrl(assetUrls?.signature ? null : data.signature_path || 'signatures/default.png')
  const elements = useMemo(() => buildCertificate(data), [data])
  const src: Record<string, string | undefined> = {
    background: assetUrls?.background ?? bg.data, signature: assetUrls?.signature ?? sig.data, logoVnCentre: '/cert/logo-vncentre.png', logoRaVga: '/cert/ra-vga.png',
  }

  return (
    <svg viewBox={`0 0 ${CERT_W} ${CERT_H}`} className={className} role="img" aria-label={`Certificate – ${data.student_name}`}
      style={{ background: '#fff', width: '100%', height: 'auto', display: 'block' }}>
      {elements.map((el, i) => {
        if (el.kind === 'image') {
          return src[el.image] ? (
            <image key={i} href={src[el.image]} x={el.x} y={el.y} width={el.w} height={el.h} preserveAspectRatio="xMidYMid meet" />
          ) : null
        }
        if (el.kind === 'line') {
          return (
            <line key={i} x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2} stroke={el.color} strokeWidth={el.width}
              strokeLinecap="round" strokeDasharray={el.dotted ? '0.01 7.6' : undefined} />
          )
        }
        if (el.kind === 'qr') return <QrRects key={i} {...el} />
        if (!ready) return null
        const f = FONT[el.font]
        return (
          <text key={i} x={el.x} y={el.y} fontFamily={`"${f.family}", serif`} fontWeight={f.weight} fontStyle={f.style}
            fontSize={fitSize(el)} fill={el.color} letterSpacing={el.letterSpacing}
            textAnchor={el.align === 'center' ? 'middle' : el.align === 'right' ? 'end' : 'start'}>
            {el.text}
          </text>
        )
      })}
    </svg>
  )
}
