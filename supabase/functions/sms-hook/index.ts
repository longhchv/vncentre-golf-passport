// Send SMS Hook của Supabase Auth: LUÔN TỪ CHỐI.
// Supabase yêu cầu có kênh SMS mới bật được đăng nhập "SĐT + mật khẩu". App không dùng OTP có sẵn
// của Supabase (mọi OTP đi qua auth-otp có giới hạn và ghi chi phí), nên hook này chặn mọi yêu cầu gửi SMS
// để không ai lợi dụng /auth/v1/otp gửi tin tốn tiền.
Deno.serve(() =>
  new Response(JSON.stringify({ error: { http_code: 403, message: 'SMS OTP is disabled; use the app sign-in flow.' } }), {
    status: 403,
    headers: { 'Content-Type': 'application/json' },
  }),
)
