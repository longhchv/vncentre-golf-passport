// Spec 16: chọn kênh gửi mã xác thực. Không dùng API riêng của Deno để test được bằng vitest (src/features/auth/otpRouting.test.ts).
//
// Công tắc app_settings `auth.otp_vn_channel`:
//   'email' (mặc định) → số Việt Nam đi đúng luồng số nước ngoài: bắt buộc email, mã gửi về email,
//                        email được xác minh, SĐT lưu nhưng CHƯA xác minh.
//   'zalo'             → như cũ: Zalo, lỗi thì SMS.

export type VnChannel = 'email' | 'zalo'
export const VN_RE = /^\+84\d{9,10}$/

/** Giá trị công tắc → kênh; thiếu hoặc lạ thì dùng mặc định 'email'. */
export function vnChannel(value: unknown): VnChannel {
  return value === 'zalo' ? 'zalo' : 'email'
}

/** Mã có đi qua email không (số nước ngoài, hoặc số VN khi công tắc = email). */
export function sendsViaEmail(phone: string, channel: VnChannel): boolean {
  return !VN_RE.test(phone) || channel === 'email'
}

export type Decision<T> = { ok: true; value: T } | { ok: false; error: string; status: number }
const fail = (error: string, status: number): Decision<never> => ({ ok: false, error, status })

/**
 * Đăng ký · gửi mã. `phoneTaken` / `emailTaken`: đã tra trước (email chỉ tra khi có).
 * Thứ tự kiểm: SĐT đã có chủ → thiếu email → email đã có chủ.
 */
export function decideSignupSend(input: {
  phone: string
  email: string
  channel: VnChannel
  phoneTaken: boolean
  emailTaken: boolean
}): Decision<{ target: string; channel: 'zalo' | 'email'; metaPhone?: string }> {
  if (!input.phone) return fail('phone_required', 400)
  if (input.phoneTaken) return fail('phone_exists', 409)
  if (!sendsViaEmail(input.phone, input.channel)) return { ok: true, value: { target: input.phone, channel: 'zalo' } }
  if (!input.email) return fail(VN_RE.test(input.phone) ? 'email_required' : 'email_required_for_foreign', 400)
  if (input.emailTaken) return fail('email_exists', 409)
  return { ok: true, value: { target: input.email, channel: 'email', metaPhone: input.phone } }
}

/** Quên mật khẩu bằng SĐT: chọn nơi gửi theo tài khoản đã có. */
export function decideResetByPhone(input: {
  phone: string
  channel: VnChannel
  phoneConfirmed: boolean
  verifiedEmail: string | null
}): Decision<{ target: string; channel: 'zalo' | 'email' }> {
  const vn = VN_RE.test(input.phone)
  // Công tắc = email: có email đã xác minh thì luôn gửi về email
  if (vn && input.channel === 'email' && input.verifiedEmail) return { ok: true, value: { target: input.verifiedEmail, channel: 'email' } }
  if (vn && input.phoneConfirmed) return { ok: true, value: { target: input.phone, channel: 'zalo' } }
  if (input.verifiedEmail) return { ok: true, value: { target: input.verifiedEmail, channel: 'email' } }
  return fail('no_verified_channel', 400)
}

/** Thêm SĐT (đã đăng nhập): chỉ khi công tắc = zalo. */
export function decideAddPhone(input: { phone: string; channel: VnChannel; ownedByOther: boolean }): Decision<{ target: string }> {
  if (input.channel === 'email') return fail('channel_unavailable', 400)
  if (!input.phone || !VN_RE.test(input.phone)) return fail('vn_phone_required', 400)
  if (input.ownedByOther) return fail('phone_exists', 409)
  return { ok: true, value: { target: input.phone } }
}

/**
 * Đăng ký · hoàn tất: tài khoản tạo ra và khoá dùng để nối người giám hộ có sẵn (nhập từ danh sách trường).
 * Chỉ nối theo thứ đã xác minh bằng mã: mã qua email → chỉ email; KHÔNG nối theo SĐT chưa xác minh.
 */
export function signupAccount(otp: { channel: string; target: string; metaPhone?: string | null }, emailInput: string) {
  const viaEmail = otp.channel === 'email'
  const phone = viaEmail ? String(otp.metaPhone ?? '') : otp.target
  const email = viaEmail ? otp.target : emailInput
  return {
    phone,
    email,
    phoneConfirm: !viaEmail,
    emailConfirm: viaEmail,
    attach: { verifiedPhone: viaEmail ? undefined : phone, verifiedEmail: viaEmail ? email : undefined },
    login: viaEmail ? { email } : { phone },
  }
}
