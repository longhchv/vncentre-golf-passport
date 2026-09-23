// Tạo file thử nhập danh sách: samples/thu-nhap-CLB-To-Vinh-Dien.xlsx (TÊN GIẢ, không phải dữ liệu thật).
// Cố ý có đủ các trường hợp để kiểm tra màn hình xem trước (F10 bước 4).
import * as XLSX from 'xlsx'
import * as fs from 'node:fs'
import { mkdirSync } from 'node:fs'

XLSX.set_fs(fs)

const header = [
  'Họ và tên học sinh', 'Ngày sinh (dd/mm/yyyy)', 'Trường', 'Lớp (năm học hiện tại)',
  'Họ tên người liên hệ', 'Số điện thoại người liên hệ', 'Email người liên hệ',
]
const rows = [
  // Trùng học viên mẫu có sẵn "Nguyễn Minh An" 14/03/2018 → nghi trùng
  ['Nguyễn Minh An', '14/03/2018', 'TH Tô Vĩnh Diện', '3A2', 'Trần Thu Hà', '0912 345 678', 'ha.tran@example.com'],
  // Viết hoa toàn bộ → tự chuẩn hoá
  ['NGÔ BẢO CHÂU', '02/09/2017', '', '4A1', 'NGÔ VĂN HÙNG', '0987.654.321', ''],
  // Hai anh em cùng SĐT → một người giám hộ
  ['Lê Thảo Nguyên', '5/1/2018', '', '3A1', 'Phạm Thị Lan', '0903111222', 'lan.pham@example.com'],
  ['Lê Minh Khôi', '20/11/2019', '', '2A4', 'Phạm Thị Lan', '0903111222', ''],
  // Thiếu ngày sinh → cảnh báo
  ['Đỗ Gia Bảo', '', '', '3A3', 'Đỗ Văn Nam', '0911222333', ''],
  // SĐT sai → cảnh báo, bỏ SĐT
  ['Hoàng Anh Thư', '15/06/2018', '', '3A2', 'Hoàng Mai', '12345', ''],
  // Ngày sinh sai → lỗi, không nhập
  ['Vũ Đức Anh', '31/02/2018', '', '3A1', 'Vũ Hà', '0977888999', ''],
  // Thiếu tên → lỗi
  ['', '01/01/2018', '', '3A1', 'Ai Đó', '0966777888', ''],
]
const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
ws['!cols'] = [{ wch: 24 }, { wch: 14 }, { wch: 18 }, { wch: 10 }, { wch: 20 }, { wch: 18 }, { wch: 24 }]
const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, ws, 'Danh sách')
mkdirSync('samples', { recursive: true })
XLSX.writeFile(wb, 'samples/thu-nhap-CLB-To-Vinh-Dien.xlsx')
console.log('samples/thu-nhap-CLB-To-Vinh-Dien.xlsx')
