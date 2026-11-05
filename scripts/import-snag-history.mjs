// Nhập lịch sử SNAG Golf League Chặng 1–10 vào Golf Passport (spec 13 mục 5).
//
// Dữ liệu có tên và năm sinh các con: để NGOÀI repo, không commit. Script này không chứa dữ liệu,
// chỉ đọc thư mục truyền vào (ket-qua-chang-1-10.csv, clb-quy-doi.csv, ho-so-vdv.csv).
//
//   Chạy thử (không ghi gì, chỉ in báo cáo):
//     node scripts/import-snag-history.mjs C:\dev\du-lieu-snag-passport\du-lieu-snag-passport
//   Ghi thật:
//     node scripts/import-snag-history.mjs <thư mục> --apply
//
// Cần biến môi trường SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY (anh Long tự đặt trong cửa sổ dòng lệnh,
// lấy ở Supabase → Project Settings → API). Hàm league_import_history chỉ service_role gọi được.
// Chạy lại nhiều lần không tạo hồ sơ trùng: dòng cùng tên trong cùng chặng được cập nhật tại chỗ.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

// Tổng điểm phải khớp league.vncentre.net/bxh (spec 13 mục 5). Khoá = phần cuối họ tên.
export const EXPECTED = [
  ['Thiện Giác', 3200],
  ['Lê Minh Hoàng', 2950],
  ['Thiên Phúc', 2150],
  ['Mai Nguyễn Minh Hoàng', 1600],
  ['Trúc Mai', 1550],
]

function readCsv(file) {
  const lines = readFileSync(file, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim() !== '')
  const header = lines.shift().split(',').map((h) => h.trim())
  return lines.map((l) => {
    const cells = l.split(',')
    if (cells.length !== header.length) throw new Error(`${file}: dòng sai số cột: ${cells.length} ≠ ${header.length}`)
    return Object.fromEntries(header.map((h, i) => [h, cells[i].trim()]))
  })
}

const key = (s) => s.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase()

function isoDate(dmy) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(dmy)
  if (!m) throw new Error(`Ngày sai dạng dd/mm/yyyy: ${dmy}`)
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

/** Dựng dữ liệu gửi league_import_history từ 3 file CSV. */
export function buildStages(dir) {
  const results = readCsv(join(dir, 'ket-qua-chang-1-10.csv'))
  const clubRows = readCsv(join(dir, 'clb-quy-doi.csv'))
  const clubMap = new Map(clubRows.map((r) => [key(r.cach_viet), r.ten_chuan]))
  const profiles = new Map(readCsv(join(dir, 'ho-so-vdv.csv')).map((r) => [key(r.ho_ten), r]))
  const club = (c) => (c ? clubMap.get(key(c)) ?? c : '')
  // Mọi cách viết của cùng một CLB (để tìm trường trong danh mục, vốn lưu tên đầy đủ)
  const aliases = new Map()
  for (const r of clubRows) {
    const k = key(r.ten_chuan)
    if (!aliases.has(k)) aliases.set(k, new Set([r.ten_chuan]))
    aliases.get(k).add(r.cach_viet)
  }
  const schoolNames = (c) => (c ? [...(aliases.get(key(c)) ?? [c])] : [])

  const stages = new Map()
  for (const r of results) {
    const no = Number(String(r.chang).replace('#', ''))
    if (!Number.isInteger(no) || no < 1) throw new Error(`Số chặng sai: ${r.chang}`)
    const date = isoDate(r.ngay)
    if (!stages.has(no)) stages.set(no, { no, date, rows: [] })
    const st = stages.get(no)
    if (st.date !== date) throw new Error(`Chặng ${no} có hai ngày khác nhau`)
    const p = profiles.get(key(r.vdv))
    st.rows.push({
      name: r.vdv,
      raw_club: r.clb || null,
      club: club(r.clb) || (p ? club(p.clb) : '') || null,
      school_names: schoolNames(club(r.clb) || (p ? club(p.clb) : '')),
      group: r.bang || null,
      to_par: r.so_voi_par === '' ? null : Number(r.so_voi_par),
      title: r.danh_hieu || null,
      culture: r.giai_van_hoa || null,
      birth_year: p?.nam_sinh ? Number(p.nam_sinh) : null,
      gender: p?.gioi_tinh || null,
      points_participation: Number(r.diem_tham_du || 0),
      points_rank: Number(r.diem_thanh_tich || 0),
      points_bonus: Number(r.diem_thuong || 0),
      _total: Number(r.tong_diem_chang || 0),
    })
  }
  // Kiểm cộng điểm trong file trước khi gửi
  const bad = []
  for (const st of stages.values())
    for (const row of st.rows) {
      if (row.points_participation + row.points_rank + row.points_bonus !== row._total) bad.push(`Chặng ${st.no}: ${row.name}`)
      delete row._total
    }
  return { stages: [...stages.values()].sort((a, b) => a.no - b.no), badSums: bad, rowCount: results.length }
}

/** Đối chiếu tổng điểm 5 VĐV ở spec 13 mục 5. */
export function checkExpected(standings) {
  return EXPECTED.map(([suffix, want]) => {
    const hits = standings.filter((s) => key(s.name).endsWith(key(suffix)))
    const got = hits.length === 1 ? hits[0].total : null
    return { suffix, want, got, ok: got === want, note: hits.length === 1 ? '' : `${hits.length} người khớp tên` }
  })
}

export function printReport(rep, built) {
  const sum = (k) => rep.stages.reduce((a, s) => a + Number(s[k] || 0), 0)
  console.log(rep.dry_run ? '— CHẠY THỬ (không ghi gì) —' : '— ĐÃ GHI —')
  console.log(`Dòng trong file: ${built.rowCount} · đã lưu: ${sum('saved')} · chặng: ${rep.stages.map((s) => s.no).join(', ')}`)
  console.log(`Ghép theo tên (hồ sơ có sẵn hoặc đã ghép ở chặng trước): ${sum('matched_by_name')} · tạo hồ sơ mới: ${sum('created')} · nghi trùng, tạo mới + vào hàng chờ: ${sum('review')}`)
  console.log(`Hàng chờ nhập lịch sử đang mở: ${rep.queue_pending}`)
  if (built.badSums.length) console.log('Dòng cộng điểm sai trong file:', built.badSums)
  const mism = rep.stages.flatMap((s) => s.mismatches || [])
  console.log(mism.length ? `Dòng lệch thang điểm (${mism.length}):` : 'Dòng lệch thang điểm: 0')
  for (const m of mism) console.log(`  Chặng ${m.stage} · ${m.name} · file ${m.file.join('/')} · thang ${m.rules.join('/')}`)
  const warn = rep.stages.flatMap((s) => s.warnings || [])
  if (warn.length) console.log('Cảnh báo:', warn)
  console.log('Đối chiếu league.vncentre.net/bxh:')
  for (const c of checkExpected(rep.standings))
    console.log(`  ${c.ok ? 'KHỚP' : 'LỆCH'} ${c.suffix}: cần ${c.want}, được ${c.got ?? '—'} ${c.note}`)
  return checkExpected(rep.standings).every((c) => c.ok) && !mism.length && !built.badSums.length
}

async function main() {
  const dir = process.argv[2]
  const apply = process.argv.includes('--apply')
  if (!dir) {
    console.error('Cách dùng: node scripts/import-snag-history.mjs <thư mục dữ liệu> [--apply]')
    process.exit(1)
  }
  const url = process.env.SUPABASE_URL
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !service) {
    console.error('Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }
  const built = buildStages(dir)
  const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/league_import_history`, {
    method: 'POST',
    headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_stages: built.stages, p_dry_run: !apply }),
  })
  const text = await res.text()
  if (!res.ok) {
    console.error(`Lỗi ${res.status}: ${text}`)
    process.exit(1)
  }
  const ok = printReport(JSON.parse(text), built)
  if (!apply) console.log(ok ? 'Chạy thử khớp. Thêm --apply để ghi thật.' : 'Có chỗ lệch, kiểm lại trước khi --apply.')
  process.exit(ok ? 0 : 2)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main()
