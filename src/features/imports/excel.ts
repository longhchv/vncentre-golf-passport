// Đọc/ghi file Excel cho màn hình nhập dữ liệu (phụ lục A). SheetJS được tải khi cần
// (import động) để không làm nặng các trang khác.

import type { Cell, RawHistoryRow, RawStudentRow } from './normalize'
import { HISTORY_COLUMNS, STUDENT_LIST_COLUMNS } from './normalize'

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

// ---------------------------------------------------------------------------
// Lịch sử khoá học — mau-lich-su-khoa-hoc.xlsx (phụ lục A2)
// ---------------------------------------------------------------------------


export const HISTORY_HEADERS = [
  'Họ và tên học sinh',
  'Ngày sinh (dd/mm/yyyy)',
  'Trường',
  'Lớp',
  'Năm học (yyyy-yyyy)',
  'Khoá học',
  'Level đạt',
]

const HISTORY_GUIDE: string[][] = [
  ['Cột', 'Tiêu đề', 'Bắt buộc', 'Định dạng', 'Ví dụ', 'Column (English)'],
  ['A', 'Họ và tên học sinh', 'Có', 'Chữ', 'Nguyễn Minh An', "Student's full name"],
  ['B', 'Ngày sinh', 'Nên có', 'dd/mm/yyyy', '13/07/2019', 'Date of birth'],
  ['C', 'Trường', 'Có', 'Chữ; trống thì lấy trường đã chọn trên màn hình', 'TH Tô Vĩnh Diện', 'School'],
  ['D', 'Lớp', 'Nên có', 'Chữ', '1A3', 'School class'],
  ['E', 'Năm học', 'Có', 'yyyy-yyyy', '2024-2025', 'Academic year'],
  ['F', 'Khoá học', 'Có', 'Chữ', 'Golf GDTC học kỳ 2 (18 tiết)', 'Course name'],
  ['G', 'Level đạt', 'Không', 'Số 1–20, hoặc để trống', '1', 'Level achieved (1–20, optional)'],
  [],
  ['Quy tắc / Rules'],
  ['• App dò học viên có sẵn theo tên + ngày sinh + trường. Không tìm thấy thì hỏi: tạo học viên mới, hoặc bỏ dòng.'],
  ['• Cột G có giá trị → tạo bản ghi level chờ duyệt. Admin/HLV trưởng có thể chọn "Duyệt luôn khi nhập".'],
  ['• Quy tắc dữ liệu cũ: học sinh đã học ít nhất 1 học kỳ thì điền 1 ở cột G.'],
  ['• Nhà trường nhập thì mọi dòng ở trạng thái chờ duyệt.'],
]

export async function downloadHistoryTemplate() {
  const XLSX = await loadXlsx()
  const ws = XLSX.utils.aoa_to_sheet([HISTORY_HEADERS])
  ws['!cols'] = [{ wch: 28 }, { wch: 22 }, { wch: 22 }, { wch: 8 }, { wch: 20 }, { wch: 34 }, { wch: 10 }]
  for (let r = 1; r <= 2000; r++) {
    for (const col of ['B', 'E']) ws[`${col}${r + 1}`] = { t: 's', v: '', z: '@' }
  }
  ws['!ref'] = 'A1:G2001'
  const guide = XLSX.utils.aoa_to_sheet(HISTORY_GUIDE)
  guide['!cols'] = [{ wch: 6 }, { wch: 22 }, { wch: 10 }, { wch: 44 }, { wch: 28 }, { wch: 34 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Lịch sử khoá học')
  XLSX.utils.book_append_sheet(wb, guide, 'Hướng dẫn')
  saveWorkbook(XLSX, wb, 'mau-lich-su-khoa-hoc.xlsx')
}

export async function readHistoryFile(file: File): Promise<{ rows: { rowNumber: number; raw: RawHistoryRow }[]; headerLooksRight: boolean }> {
  const XLSX = await loadXlsx()
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false })
  const aoa = XLSX.utils.sheet_to_json<Cell[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null, blankrows: false })
  const header = (aoa[0] ?? []).map((c) => String(c ?? '').toLowerCase())
  const headerLooksRight = (header[0]?.includes('tên') || header[0]?.includes('name')) && (header[4]?.includes('năm') || header[4]?.includes('year'))
  const rows: { rowNumber: number; raw: RawHistoryRow }[] = []
  aoa.slice(1).forEach((cells, i) => {
    if (!cells || cells.every((c) => c === null || String(c).trim() === '')) return
    rows.push({ rowNumber: i + 2, raw: Object.fromEntries(HISTORY_COLUMNS.map((k, col) => [k, cells[col] ?? null])) as unknown as RawHistoryRow })
  })
  return { rows, headerLooksRight: Boolean(headerLooksRight) }
}

export async function downloadRowsAsXlsx(headers: string[], rows: (string | number | null)[][], sheet: string, fileName: string) {
  const XLSX = await loadXlsx()
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheet)
  saveWorkbook(XLSX, wb, fileName)
}
