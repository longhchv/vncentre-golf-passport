// Đọc/ghi file Excel cho màn hình nhập dữ liệu (phụ lục A). SheetJS được tải khi cần
// (import động) để không làm nặng các trang khác.

import type { Cell, RawStudentRow } from './normalize'
import { STUDENT_LIST_COLUMNS } from './normalize'

const loadXlsx = () => import('xlsx')

/** Tiêu đề cột A–G đúng như phụ lục A1. */
export const STUDENT_LIST_HEADERS = [
  'Họ và tên học sinh',
  'Ngày sinh (dd/mm/yyyy)',
  'Trường',
  'Lớp (năm học hiện tại)',
  'Họ tên người liên hệ',
  'Số điện thoại người liên hệ',
  'Email người liên hệ',
]

const GUIDE_ROWS: string[][] = [
  ['Cột', 'Tiêu đề', 'Bắt buộc', 'Định dạng', 'Ví dụ', 'Column (English)'],
  ['A', 'Họ và tên học sinh', 'Có', 'Chữ', 'Nguyễn Minh An', "Student's full name (required)"],
  ['B', 'Ngày sinh', 'Nên có', 'dd/mm/yyyy', '13/07/2019', 'Date of birth (recommended)'],
  ['C', 'Trường', 'Có', 'Chữ; nếu trống thì lấy trường đã chọn trên màn hình', 'TH Tô Vĩnh Diện', 'School (blank = the school chosen on screen)'],
  ['D', 'Lớp (năm học hiện tại)', 'Nên có', 'Chữ', '2A3', 'School class this year'],
  ['E', 'Họ tên người liên hệ', 'Nên có', 'Chữ', 'Trần Thu Hà', 'Contact person (parent) name'],
  ['F', 'Số điện thoại người liên hệ', 'Nên có', 'Số VN 09xxxxxxxx hoặc số quốc tế có +', '0912345678', 'Contact phone: VN 09… or international with +'],
  ['G', 'Email người liên hệ', 'Không', 'Email', 'ha.tran@gmail.com', 'Contact email (optional)'],
  [],
  ['Quy tắc khi nhập / Rules'],
  ['• Dòng 1 là tiêu đề cột, dữ liệu bắt đầu từ dòng 2. Không nhập lại trường, năm học, chương trình, lớp trong file (chọn trên màn hình).'],
  ['• Thiếu họ tên: dòng lỗi, không nhập. Ngày sinh sai định dạng: dòng lỗi.'],
  ['• Thiếu ngày sinh hoặc số điện thoại: cảnh báo, vẫn nhập được. Thiếu ngày sinh thì dò trùng kém chính xác; thiếu SĐT thì không gửi được lời mời kích hoạt.'],
  ['• Anh chị em: nhập nhiều dòng cùng số điện thoại, app tạo một người giám hộ nối với nhiều học viên.'],
  ['• Tên viết hoa toàn bộ (NGÔ TÚ ANH) được tự chuẩn hoá thành Ngô Tú Anh.'],
  ['• Row 1 is the header; data starts at row 2. Missing name or invalid date of birth = error row. Missing date of birth or phone = warning.'],
]

function saveWorkbook(XLSX: typeof import('xlsx'), wb: import('xlsx').WorkBook, fileName: string) {
  XLSX.writeFile(wb, fileName, { compression: true })
}

/** Tải file mẫu mau-danh-sach-hoc-sinh.xlsx (sheet dữ liệu + sheet "Hướng dẫn"). */
export async function downloadStudentListTemplate() {
  const XLSX = await loadXlsx()
  const ws = XLSX.utils.aoa_to_sheet([STUDENT_LIST_HEADERS])
  ws['!cols'] = [{ wch: 28 }, { wch: 22 }, { wch: 24 }, { wch: 20 }, { wch: 24 }, { wch: 26 }, { wch: 28 }]
  // Ngày sinh và SĐT để dạng chữ, tránh Excel đổi định dạng hoặc làm mất số 0 đầu
  for (let r = 1; r <= 2000; r++) {
    for (const col of ['B', 'F']) ws[`${col}${r + 1}`] = { t: 's', v: '', z: '@' }
  }
  ws['!ref'] = 'A1:G2001'
  const guide = XLSX.utils.aoa_to_sheet(GUIDE_ROWS)
  guide['!cols'] = [{ wch: 6 }, { wch: 28 }, { wch: 10 }, { wch: 44 }, { wch: 18 }, { wch: 44 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Danh sách')
  XLSX.utils.book_append_sheet(wb, guide, 'Hướng dẫn')
  saveWorkbook(XLSX, wb, 'mau-danh-sach-hoc-sinh.xlsx')
}

export interface ReadResult {
  rows: { rowNumber: number; raw: RawStudentRow }[]
  headerLooksRight: boolean
  sheetName: string
}

/** Đọc sheet đầu tiên; bỏ dòng tiêu đề và dòng trống hoàn toàn. */
export async function readStudentListFile(file: File): Promise<ReadResult> {
  const XLSX = await loadXlsx()
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false })
  const sheetName = wb.SheetNames[0]
  const aoa = XLSX.utils.sheet_to_json<Cell[]>(wb.Sheets[sheetName], { header: 1, raw: true, defval: null, blankrows: false })
  const header = (aoa[0] ?? []).map((c) => String(c ?? '').toLowerCase())
  const headerLooksRight = header[0]?.includes('tên') || header[0]?.includes('name') || false

  const rows: ReadResult['rows'] = []
  aoa.slice(1).forEach((cells, i) => {
    if (!cells || cells.every((c) => c === null || String(c).trim() === '')) return
    const raw = Object.fromEntries(STUDENT_LIST_COLUMNS.map((key, col) => [key, cells[col] ?? null])) as unknown as RawStudentRow
    rows.push({ rowNumber: i + 2, raw })
  })
  return { rows, headerLooksRight, sheetName }
}

/** File báo lỗi: các dòng lỗi/bỏ qua kèm cột lý do, giữ nguyên dữ liệu gốc để sửa rồi nhập lại. */
export async function downloadErrorReport(
  rows: { rowNumber: number; raw: Record<string, unknown>; status: string; reason: string }[],
  fileName: string,
) {
  const XLSX = await loadXlsx()
  const aoa = [
    ['Dòng trong file gốc', ...STUDENT_LIST_HEADERS, 'Trạng thái', 'Lý do'],
    ...rows.map((r) => [r.rowNumber, ...STUDENT_LIST_COLUMNS.map((k) => (r.raw[k] ?? '') as string | number), r.status, r.reason]),
  ]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [{ wch: 10 }, { wch: 28 }, { wch: 16 }, { wch: 20 }, { wch: 12 }, { wch: 22 }, { wch: 18 }, { wch: 24 }, { wch: 14 }, { wch: 60 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Bao loi')
  saveWorkbook(XLSX, wb, fileName)
}
