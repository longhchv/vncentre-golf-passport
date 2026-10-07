// Điều khoản sử dụng và Chính sách bảo mật — BẢN TẠM (D46), soạn theo đúng những gì app đang thu thập và làm.
// Chờ luật sư rà soát trước khi chạy chính thức (D3). Khi thay nội dung: đổi LEGAL_VERSION và app_settings 'legal.versions'
// cùng giá trị → phụ huynh được hỏi đồng ý lại (F18).

export const LEGAL_VERSION = 'tam-2026-10-08'

type Doc = { title: string; intro: string; sections: { h: string; p: string[] }[] }

export const LEGAL: Record<'terms' | 'privacy', Record<'vi' | 'en', Doc>> = {
  terms: {
    vi: {
      title: 'Điều khoản sử dụng',
      intro: 'VN Centre Golf Passport ("app") do Trung tâm Quảng bá và Phát triển Golf Việt Nam (VN Centre) vận hành, dùng để lưu hồ sơ golf của học viên, sổ Golf Passport, thẻ trải nghiệm sự kiện, chứng nhận và điểm tích luỹ.',
      sections: [
        { h: '1. Tài khoản', p: [
          'Phụ huynh hoặc người giám hộ tạo tài khoản cho mình và quản lý hồ sơ của con. Người lớn tham gia sự kiện có thể tự ghi tên và tạo tài khoản cho chính mình.',
          'Bạn chịu trách nhiệm giữ bí mật mật khẩu, mã PIN và mã xác thực. Không chia sẻ mã xác thực cho bất kỳ ai, kể cả người tự xưng là nhân viên VN Centre.',
          'Thông tin bạn khai (họ tên, số điện thoại, email, quan hệ với học viên) phải đúng sự thật.' ] },
        { h: '2. Sổ, thẻ sự kiện và mã', p: [
          'Mỗi sổ, thẻ sự kiện, mã kích hoạt chỉ dùng cho đúng một người. Nghiêm cấm dò mã, dùng mã của người khác hoặc mạo danh người giám hộ.',
          'VN Centre có thể khoá hoặc huỷ sổ, thẻ, tài khoản khi phát hiện sử dụng sai.' ] },
        { h: '3. Chứng nhận', p: [
          'Chứng nhận do VN Centre phát hành, có mã QR để bất kỳ ai cũng kiểm tra được tại trang xác thực.',
          'VN Centre có thể thu hồi chứng nhận phát nhầm; trang xác thực sẽ báo "đã thu hồi".' ] },
        { h: '4. Điểm tích luỹ và quà', p: [
          'Điểm tích luỹ từ sự kiện dùng để đổi quà theo quy định của Ban tổ chức tại từng đợt đổi quà. Điểm không quy đổi thành tiền và không chuyển nhượng.',
          'VN Centre có thể điều chỉnh cách tính và đổi điểm; điểm đã tích luỹ được giữ nguyên.' ] },
        { h: '5. Thay đổi điều khoản', p: [
          'Khi điều khoản thay đổi, app sẽ hỏi bạn đồng ý lại ở lần đăng nhập kế tiếp. Lịch sử các lần đồng ý được lưu lại.' ] },
        { h: '6. Luật áp dụng', p: [ 'Điều khoản này tuân theo pháp luật Việt Nam.' ] },
      ],
    },
    en: {
      title: 'Terms of Use',
      intro: 'VN Centre Golf Passport ("the app") is operated by the Vietnam Golf Promotion and Development Centre (VN Centre) to keep students\' golf records, Golf Passports, event experience cards, certificates and points.',
      sections: [
        { h: '1. Accounts', p: [
          'Parents or guardians create their own account and manage their child\'s record. Adults taking part in an event may register and create an account for themselves.',
          'You are responsible for keeping your password, PIN and verification codes secret. Never share a verification code with anyone, including people claiming to be VN Centre staff.',
          'Information you provide (name, phone, email, relationship to the student) must be accurate.' ] },
        { h: '2. Passports, event cards and codes', p: [
          'Each passport, event card and activation code is for one person only. Guessing codes, using someone else\'s code or impersonating a guardian is prohibited.',
          'VN Centre may lock or cancel passports, cards or accounts that are misused.' ] },
        { h: '3. Certificates', p: [
          'Certificates are issued by VN Centre and carry a QR code that anyone can check on the verification page.',
          'VN Centre may revoke a certificate issued in error; the verification page will then show "revoked".' ] },
        { h: '4. Points and gifts', p: [
          'Event points can be redeemed for gifts under the organisers\' rules at each redemption session. Points have no cash value and cannot be transferred.',
          'VN Centre may change how points are earned and redeemed; points already earned are kept.' ] },
        { h: '5. Changes', p: [ 'When these terms change, the app asks you to accept them again at your next sign-in. A history of acceptances is kept.' ] },
        { h: '6. Governing law', p: [ 'These terms are governed by the laws of Vietnam.' ] },
      ],
    },
  },
  privacy: {
    vi: {
      title: 'Chính sách bảo mật',
      intro: 'Chính sách này cho biết VN Centre thu thập những dữ liệu cá nhân nào trong app, dùng để làm gì và bạn có những quyền gì, theo quy định pháp luật Việt Nam về bảo vệ dữ liệu cá nhân.',
      sections: [
        { h: '1. Dữ liệu thu thập', p: [
          'Phụ huynh, người giám hộ, người chơi người lớn: họ tên, số điện thoại, email (khi tạo tài khoản), quan hệ với học viên, các lần đồng ý.',
          'Học viên, người chơi: họ tên; với học viên của các lớp: ngày sinh, giới tính, trường, lớp, level, lịch sử khoá học, ảnh (nếu phụ huynh tải lên); với người trải nghiệm sự kiện: tuổi, nơi ở (nếu khai), điểm 4 trạm, điểm tích luỹ, ảnh thẻ điểm (nếu gửi để tự xác nhận).',
          'Nhật ký kỹ thuật: thời điểm thao tác, địa chỉ IP (dùng để chống dò mã).' ] },
        { h: '2. Mục đích', p: [
          'Lưu và hiển thị hồ sơ golf, cấp sổ, chứng nhận, ghi nhận hoàn thành và điểm tích luỹ.',
          'Gửi mã xác thực và thông báo liên quan đến hồ sơ.',
          'Chỉ khi bạn đồng ý "VN Centre được liên hệ": tư vấn, gửi thông tin các lớp golf. Bạn rút lại đồng ý này bất cứ lúc nào trong mục Tài khoản.' ] },
        { h: '3. Ai xem được', p: [
          'Phụ huynh, người giám hộ được liên kết xem hồ sơ của con. Huấn luyện viên, nhân viên sự kiện, nhà trường chỉ xem phần cần cho công việc và không xem được số điện thoại, email của phụ huynh hay người chơi.',
          'Trang xác thực chứng nhận công khai chỉ hiện tên, loại chứng nhận, chương trình và ngày cấp.',
          'VN Centre không bán dữ liệu cá nhân. Dữ liệu được lưu và xử lý qua các nhà cung cấp dịch vụ: Supabase (máy chủ dữ liệu tại Singapore), Cloudflare (trang web), Brevo (gửi email) và, khi được bật, Zalo, nhà cung cấp SMS, payOS (thanh toán).' ] },
        { h: '4. Trẻ em', p: [
          'Dữ liệu của trẻ do phụ huynh, người giám hộ cung cấp hoặc do nhà trường, VN Centre ghi nhận trong khoá học. Tài khoản riêng của học viên (từ 8 tuổi) do phụ huynh tạo và chỉ xem được, không sửa được.' ] },
        { h: '5. Lưu trữ và bảo vệ', p: [
          'Dữ liệu được lưu trong thời gian bạn còn sử dụng dịch vụ hoặc tới khi có yêu cầu xoá, trừ thông tin pháp luật buộc phải giữ (ví dụ hoá đơn đã xuất).',
          'Kết nối được mã hoá (HTTPS); quyền xem dữ liệu được phân theo từng người; ảnh và tệp PDF lưu ở kho riêng tư, chỉ tải qua link có hạn; dữ liệu được sao lưu định kỳ.' ] },
        { h: '6. Quyền của bạn', p: [
          'Xem, sửa thông tin; rút lại các đồng ý tuỳ chọn; yêu cầu xoá dữ liệu của con (nút "Yêu cầu xoá dữ liệu" trong hồ sơ) hoặc của chính bạn qua các kênh liên hệ chính thức của VN Centre.' ] },
      ],
    },
    en: {
      title: 'Privacy Policy',
      intro: 'This policy explains what personal data VN Centre collects in the app, why, and your rights, under the laws of Vietnam on personal data protection.',
      sections: [
        { h: '1. Data we collect', p: [
          'Parents, guardians and adult players: name, phone number, email (when creating an account), relationship to the student, consent history.',
          'Students and players: name; for class students: date of birth, gender, school, class, level, course history, photo (if uploaded by a parent); for event participants: age and place of residence (if given), scores at the 4 stations, points, score-card photo (if sent for self-confirmation).',
          'Technical logs: time of actions and IP address (used to prevent code guessing).' ] },
        { h: '2. Purposes', p: [
          'Keeping and showing golf records; issuing passports, certificates; recording completion and points.',
          'Sending verification codes and notifications about the record.',
          'Only if you agree that "VN Centre may contact me": advice and information about golf classes. You can withdraw this consent at any time under Account.' ] },
        { h: '3. Who can see it', p: [
          'Linked parents and guardians see their child\'s record. Coaches, event staff and schools only see what their work requires and never see parents\' or players\' phone numbers or emails.',
          'The public certificate verification page only shows the name, certificate type, programme and issue date.',
          'VN Centre does not sell personal data. Data is stored and processed by service providers: Supabase (data servers in Singapore), Cloudflare (website), Brevo (email) and, when enabled, Zalo, an SMS provider and payOS (payments).' ] },
        { h: '4. Children', p: [
          'Children\'s data is provided by parents or guardians, or recorded by schools and VN Centre during courses. A student\'s own account (age 8+) is created by a parent and is view-only.' ] },
        { h: '5. Retention and security', p: [
          'Data is kept while you use the service or until deletion is requested, except information the law requires us to keep (e.g. issued invoices).',
          'Connections are encrypted (HTTPS); access is restricted per person; photos and PDFs are kept in private storage and downloaded via time-limited links; data is backed up regularly.' ] },
        { h: '6. Your rights', p: [
          'View and correct information; withdraw optional consents; request deletion of your child\'s data (the "Request data deletion" button in the profile) or your own through VN Centre\'s official contact channels.' ] },
      ],
    },
  },
}
