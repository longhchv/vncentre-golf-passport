import { describe, expect, it } from 'vitest'
import {
  decideAddPhone,
  decideResetByPhone,
  decideSignupSend,
  sendsViaEmail,
  signupAccount,
  vnChannel,
} from '../../../supabase/functions/_shared/otpRouting'

// Spec 16 mục 3.1, tiêu chí 2, 3, 6, 7, 8
const VN = '+84912345678'
const KR = '+821012345678'

describe('vnChannel', () => {
  it('mặc định email, chỉ "zalo" mới là zalo', () => {
    expect(vnChannel(undefined)).toBe('email')
    expect(vnChannel('email')).toBe('email')
    expect(vnChannel('sms')).toBe('email')
    expect(vnChannel('zalo')).toBe('zalo')
  })
  it('số nước ngoài luôn đi email; số VN theo công tắc', () => {
    expect(sendsViaEmail(KR, 'zalo')).toBe(true)
    expect(sendsViaEmail(VN, 'email')).toBe(true)
    expect(sendsViaEmail(VN, 'zalo')).toBe(false)
  })
})

describe('decideSignupSend', () => {
  const base = { phone: VN, email: 'ba@example.test', channel: 'email' as const, phoneTaken: false, emailTaken: false }

  it('số VN + công tắc email → mã về email, SĐT ghi kèm', () => {
    expect(decideSignupSend(base)).toEqual({ ok: true, value: { target: 'ba@example.test', channel: 'email', metaPhone: VN } })
  })
  it('thiếu email → email_required, không gửi', () => {
    expect(decideSignupSend({ ...base, email: '' })).toEqual({ ok: false, error: 'email_required', status: 400 })
  })
  it('SĐT đã có tài khoản → phone_exists (kiểm trước email)', () => {
    expect(decideSignupSend({ ...base, phoneTaken: true, emailTaken: true })).toEqual({ ok: false, error: 'phone_exists', status: 409 })
  })
  it('email đã có tài khoản → email_exists', () => {
    expect(decideSignupSend({ ...base, emailTaken: true })).toEqual({ ok: false, error: 'email_exists', status: 409 })
  })
  it('công tắc zalo → như cũ: gửi Zalo tới SĐT, không cần email', () => {
    expect(decideSignupSend({ ...base, channel: 'zalo', email: '' })).toEqual({ ok: true, value: { target: VN, channel: 'zalo' } })
  })
  it('số nước ngoài không đổi: thiếu email → email_required_for_foreign', () => {
    expect(decideSignupSend({ ...base, phone: KR, email: '', channel: 'zalo' })).toEqual({
      ok: false, error: 'email_required_for_foreign', status: 400,
    })
    expect(decideSignupSend({ ...base, phone: KR, channel: 'zalo' }).ok).toBe(true)
  })
})

describe('signupAccount', () => {
  it('mã qua email: email xác minh, SĐT chưa; chỉ nối người giám hộ theo email', () => {
    const a = signupAccount({ channel: 'email', target: 'ba@example.test', metaPhone: VN }, 'khac@example.test')
    expect(a).toMatchObject({ phone: VN, email: 'ba@example.test', phoneConfirm: false, emailConfirm: true, login: { email: 'ba@example.test' } })
    expect(a.attach).toEqual({ verifiedPhone: undefined, verifiedEmail: 'ba@example.test' })
  })
  it('mã qua Zalo/SMS: nối theo SĐT đã xác minh, không theo email tự khai', () => {
    const a = signupAccount({ channel: 'sms', target: VN }, 'ba@example.test')
    expect(a).toMatchObject({ phone: VN, phoneConfirm: true, emailConfirm: false, login: { phone: VN } })
    expect(a.attach).toEqual({ verifiedPhone: VN, verifiedEmail: undefined })
  })
})

describe('decideResetByPhone', () => {
  it('SĐT chưa xác minh → gửi về email đã xác minh', () => {
    expect(decideResetByPhone({ phone: VN, channel: 'email', phoneConfirmed: false, verifiedEmail: 'ba@example.test' }))
      .toEqual({ ok: true, value: { target: 'ba@example.test', channel: 'email' } })
  })
  it('công tắc zalo + SĐT đã xác minh → Zalo như cũ', () => {
    expect(decideResetByPhone({ phone: VN, channel: 'zalo', phoneConfirmed: true, verifiedEmail: 'ba@example.test' }))
      .toEqual({ ok: true, value: { target: VN, channel: 'zalo' } })
  })
  it('không có kênh đã xác minh → no_verified_channel', () => {
    expect(decideResetByPhone({ phone: VN, channel: 'email', phoneConfirmed: false, verifiedEmail: null }).ok).toBe(false)
  })
})

describe('decideAddPhone', () => {
  it('công tắc email → channel_unavailable', () => {
    expect(decideAddPhone({ phone: VN, channel: 'email', ownedByOther: false })).toEqual({ ok: false, error: 'channel_unavailable', status: 400 })
  })
  it('công tắc zalo → như cũ', () => {
    expect(decideAddPhone({ phone: VN, channel: 'zalo', ownedByOther: false }).ok).toBe(true)
    expect(decideAddPhone({ phone: VN, channel: 'zalo', ownedByOther: true })).toMatchObject({ error: 'phone_exists' })
  })
})
