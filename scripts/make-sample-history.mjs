// Tạo file thử lịch sử khoá học: samples/thu-lich-su-To-Vinh-Dien.xlsx (TÊN GIẢ).
// Dùng cho các em đã nhập bằng samples/thu-nhap-CLB-To-Vinh-Dien.xlsx ở Bước 4 (kịch bản nghiệm thu 6: 2 năm dữ liệu cũ).
import * as XLSX from 'xlsx'
import * as fs from 'node:fs'

XLSX.set_fs(fs)

const header = ['Họ và tên học sinh', 'Ngày sinh (dd/mm/yyyy)', 'Trường', 'Lớp', 'Năm học (yyyy-yyyy)', 'Khoá học', 'Level đạt']
const kids = [
  ['Nguyễn Minh An', '14/03/2018'],
  ['Ngô Bảo Châu', '02/09/2017'],
  ['Lê Thảo Nguyên', '05/01/2018'],
  ['Hoàng Anh Thư', '15/06/2018'],
]
const rows = []
for (const [name, dob] of kids) {
  rows.push([name, dob, 'TH Tô Vĩnh Diện', '1A2', '2024-2025', 'Golf GDTC học kỳ 2 (18 tiết)', 1])
  rows.push([name, dob, 'TH Tô Vĩnh Diện', '2A2', '2025-2026', 'Golf GDTC cả năm (25 tiết)', 1])
}
// Em chưa có trong hệ thống → app hỏi tạo mới hay bỏ qua
rows.push(['Trần Gia Hân', '11/11/2017', 'TH Tô Vĩnh Diện', '2A1', '2025-2026', 'Golf GDTC cả năm (25 tiết)', 1])
// Dòng lỗi: năm học sai định dạng
rows.push(['Lê Minh Khôi', '20/11/2019', 'TH Tô Vĩnh Diện', '1A4', '2025', 'Golf GDTC', 1])

const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
ws['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 18 }, { wch: 6 }, { wch: 14 }, { wch: 30 }, { wch: 9 }]
const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, ws, 'Lịch sử khoá học')
fs.mkdirSync('samples', { recursive: true })
XLSX.writeFile(wb, 'samples/thu-lich-su-To-Vinh-Dien.xlsx')
console.log('samples/thu-lich-su-To-Vinh-Dien.xlsx')
