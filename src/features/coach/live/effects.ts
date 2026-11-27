// Hiệu ứng khi HLV chấm điểm: tiếng "ting", pháo hoa nhỏ và số điểm bay lên từ thẻ của bạn được chấm.
// Chỉ dùng DOM và Web Audio, không thêm thư viện.

let audio: AudioContext | null = null

function ctx(): AudioContext | null {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    audio ??= new AC()
    if (audio.state === 'suspended') void audio.resume()
    return audio
  } catch {
    return null
  }
}

/** Cộng điểm: chuỗi nốt đi lên (càng nhiều điểm càng nhiều nốt). Trừ điểm (hoàn tác): một nốt trầm ngắn. */
/** Mức mạnh của hiệu ứng theo số điểm: 5–10 → 1, 20 → 2, 30 → 3, từ 40 → 4. */
function level(delta: number) {
  return Math.max(1, Math.min(4, Math.ceil(Math.abs(delta) / 10.5)))
}

export function playScore(delta: number) {
  const ac = ctx()
  if (!ac) return
  const notes = delta < 0 ? [330] : [660, 880, 1175, 1568].slice(0, level(delta) + 1)
  notes.forEach((freq, i) => {
    const t0 = ac.currentTime + i * 0.08
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    osc.type = delta < 0 ? 'sine' : 'triangle'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.0001, t0)
    gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22)
    osc.connect(gain).connect(ac.destination)
    osc.start(t0)
    osc.stop(t0 + 0.25)
  })
}

const COLORS = ['#c9a227', '#e8c766', '#1f3a5f', '#e4572e', '#29a36a', '#3b82f6']

function layer(): HTMLDivElement {
  let el = document.getElementById('live-fx') as HTMLDivElement | null
  if (!el) {
    el = document.createElement('div')
    el.id = 'live-fx'
    el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:60;overflow:hidden'
    document.body.appendChild(el)
  }
  return el
}

/** Số điểm bay lên và (khi cộng) pháo hoa nhỏ toả ra từ giữa phần tử. */
export function burstAt(target: Element | null, delta: number) {
  if (!target) return
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const r = target.getBoundingClientRect()
  const x = r.left + r.width / 2
  const y = r.top + r.height / 2
  const root = layer()

  const label = document.createElement('div')
  label.textContent = delta > 0 ? `+${delta}` : String(delta)
  label.style.cssText =
    `position:absolute;left:${x}px;top:${y}px;transform:translate(-50%,-50%);font-weight:800;font-size:44px;` +
    `color:${delta > 0 ? '#c9a227' : '#b91c1c'};text-shadow:0 2px 0 #fff,0 0 12px rgba(255,255,255,.9)`
  root.appendChild(label)
  label.animate(
    [
      { transform: 'translate(-50%,-50%) scale(.6)', opacity: 0 },
      { transform: 'translate(-50%,-90%) scale(1.25)', opacity: 1, offset: 0.25 },
      { transform: 'translate(-50%,-260%) scale(1)', opacity: 0 },
    ],
    { duration: 1100, easing: 'cubic-bezier(.2,.8,.3,1)' },
  ).onfinish = () => label.remove()

  if (delta <= 0 || reduce) return
  const count = 14 + level(delta) * 12
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div')
    const size = 6 + Math.random() * 6
    p.style.cssText =
      `position:absolute;left:${x}px;top:${y}px;width:${size}px;height:${size * (Math.random() < 0.5 ? 1 : 0.45)}px;` +
      `background:${COLORS[i % COLORS.length]};border-radius:${Math.random() < 0.4 ? '50%' : '2px'}`
    root.appendChild(p)
    const angle = Math.random() * Math.PI * 2
    const dist = 60 + Math.random() * (80 + level(delta) * 30)
    const dx = Math.cos(angle) * dist
    const dy = Math.sin(angle) * dist - 40
    p.animate(
      [
        { transform: 'translate(-50%,-50%) rotate(0deg)', opacity: 1 },
        { transform: `translate(${dx}px,${dy + 80}px) rotate(${Math.random() * 720}deg)`, opacity: 0 },
      ],
      { duration: 800 + Math.random() * 500, easing: 'cubic-bezier(.1,.7,.3,1)' },
    ).onfinish = () => p.remove()
  }
}

export function buzz(ms = 25) {
  try {
    navigator.vibrate?.(ms)
  } catch {
    // máy không hỗ trợ rung
  }
}
