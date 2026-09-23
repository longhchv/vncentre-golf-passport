// Edge Function: quản lý tài khoản nhân viên (F1 "Nhân viên", F16 "Người dùng và vai trò").
// Chỉ admin gọi được. Dùng service role cho các thao tác của Supabase Auth.
//
// Hành động:
//   create_staff  { email, full_name, role, school_id?, send_email? } → tạo tài khoản + vai trò, trả link mời
//   login_link    { user_id }                                        → tạo link đặt mật khẩu mới
//   set_status    { user_id, status: 'active' | 'suspended' }        → khoá / mở khoá tài khoản
//
// Khi chưa có dịch vụ email (secret STAFF_EMAIL_ENABLED khác "true"), app trả link để admin tự gửi qua Zalo.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, json } from '../_shared/cors.ts'

const STAFF_ROLES = ['admin', 'head_coach', 'coach', 'assistant', 'school_manager', 'pe_teacher', 'partner', 'event_staff']
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const emailEnabled = Deno.env.get('STAFF_EMAIL_ENABLED') === 'true'

  // Người gọi: kiểm tra là admin bằng chính quyền của họ
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: userData } = await caller.auth.getUser()
  if (!userData.user) return json({ error: 'unauthorized' }, 401)
  const { data: isAdmin } = await caller.rpc('is_admin')
  if (!isAdmin) return json({ error: 'forbidden' }, 403)
  const callerId = userData.user.id

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  // Link trong email/mời phải trỏ về đúng trang web đang dùng (đã khai trong danh sách URL của Auth)
  const origin = req.headers.get('origin') ?? Deno.env.get('SITE_URL') ?? ''
  const redirectTo = `${origin}/reset-password`

  async function auditLog(action: string, entityId: string, after: unknown) {
    await admin.from('audit_logs').insert({
      actor_user_id: callerId, action, entity_type: 'auth_users', entity_id: entityId, after,
    })
  }

  switch (body.action) {
    case 'create_staff': {
      const email = String(body.email ?? '').trim().toLowerCase()
      const fullName = String(body.full_name ?? '').trim()
      const role = String(body.role ?? '')
      const schoolId = body.school_id ? String(body.school_id) : null
      if (!EMAIL_RE.test(email)) return json({ error: 'invalid_email' }, 400)
      if (!fullName) return json({ error: 'missing_name' }, 400)
      if (!STAFF_ROLES.includes(role)) return json({ error: 'invalid_role' }, 400)
      if (role === 'school_manager' && !schoolId) return json({ error: 'missing_school' }, 400)

      // Đã có tài khoản với email này → chỉ thêm vai trò (ví dụ phụ huynh được giao làm HLV)
      const { data: existing } = await admin.from('profiles').select('user_id').ilike('email', email).maybeSingle()
      let userId = existing?.user_id as string | undefined
      let link: string | null = null
      let emailSent = false

      if (!userId) {
        if (emailEnabled && body.send_email !== false) {
          const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
            data: { full_name: fullName }, redirectTo,
          })
          if (error) return json({ error: 'auth_error', message: error.message }, 400)
          userId = data.user.id
          emailSent = true
        } else {
          const { data, error } = await admin.auth.admin.generateLink({
            type: 'invite', email, options: { data: { full_name: fullName }, redirectTo },
          })
          if (error) return json({ error: 'auth_error', message: error.message }, 400)
          userId = data.user.id
          link = data.properties.action_link
        }
        await admin.from('profiles').update({ full_name: fullName }).eq('user_id', userId)
        await auditLog('invite_staff', userId, { email, full_name: fullName, email_sent: emailSent })
      }

      const { error: roleErr } = await admin.from('user_roles').insert({
        user_id: userId, role, school_id: schoolId, granted_by: callerId,
      })
      // 23505: đã có đúng vai trò này → không coi là lỗi
      if (roleErr && roleErr.code !== '23505') return json({ error: 'role_error', message: roleErr.message }, 400)

      return json({ user_id: userId, existed: Boolean(existing), link, email_sent: emailSent })
    }

    case 'login_link': {
      const userId = String(body.user_id ?? '')
      const { data: u, error: getErr } = await admin.auth.admin.getUserById(userId)
      if (getErr || !u.user?.email) return json({ error: 'not_found' }, 404)
      const confirmed = Boolean(u.user.email_confirmed_at)
      const { data, error } = await admin.auth.admin.generateLink({
        type: confirmed ? 'recovery' : 'invite', email: u.user.email, options: { redirectTo },
      })
      if (error) return json({ error: 'auth_error', message: error.message }, 400)
      await auditLog('staff_login_link', userId, { type: confirmed ? 'recovery' : 'invite' })
      return json({ link: data.properties.action_link })
    }

    case 'set_status': {
      const userId = String(body.user_id ?? '')
      const status = body.status === 'suspended' ? 'suspended' : 'active'
      if (userId === callerId && status === 'suspended') return json({ error: 'cannot_suspend_self' }, 400)
      const { error } = await admin.auth.admin.updateUserById(userId, {
        ban_duration: status === 'suspended' ? '876000h' : 'none',
      })
      if (error) return json({ error: 'auth_error', message: error.message }, 400)
      // Ghi qua service role: trigger nhật ký ghi thay đổi; bổ sung dòng có tên người thao tác
      await admin.from('profiles').update({ status }).eq('user_id', userId)
      await auditLog(status === 'suspended' ? 'suspend_user' : 'unsuspend_user', userId, { status })
      return json({ ok: true })
    }

    default:
      return json({ error: 'unknown_action' }, 400)
  }
})
