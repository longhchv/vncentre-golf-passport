import { describe, expect, it } from 'vitest'
import { canUnlink, oauthScopes } from './providers'

describe('cách đăng nhập', () => {
  it('chỉ cho gỡ khi đang có ít nhất hai cách', () => {
    expect(canUnlink([{ provider: 'email' }])).toBe(false)
    expect(canUnlink([{ provider: 'email' }, { provider: 'google' }])).toBe(true)
  })
  it('Microsoft xin quyền email để gộp tài khoản theo email', () => {
    expect(oauthScopes('azure')).toBe('email')
    expect(oauthScopes('google')).toBeUndefined()
  })
})
