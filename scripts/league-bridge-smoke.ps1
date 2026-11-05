# Thử nhanh cổng league-bridge (spec 13, tiêu chí 7.1–7.2). Không chứa khoá: khoá nhập ẩn khi chạy, chỉ giữ trong bộ nhớ.
#
#   powershell -ExecutionPolicy Bypass -File scripts\league-bridge-smoke.ps1 -Code VNC-000123
#
# -Code: mã VNC của một bạn đã tham dự 10/10 (có SĐT phụ huynh).
# Lưu ý: bước "bạn mới" tạo thật một hồ sơ thử "Test SNAG Ban Moi <giờ>" trạng thái pending_review trên máy chủ được gọi.
param(
  [Parameter(Mandatory = $true)][string]$Code,
  [string]$Url = 'https://zrfipnqkjrhzrscaaeth.supabase.co/functions/v1/league-bridge'
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$secure = Read-Host 'LEAGUE_API_KEY' -AsSecureString
$key = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))

function Call($body, $k = $key, $ip = 'smoke-test') {
  $json = [System.Text.Encoding]::UTF8.GetBytes(($body | ConvertTo-Json -Depth 6 -Compress))
  try {
    $r = Invoke-WebRequest -Uri $Url -Method Post -UseBasicParsing -ContentType 'application/json; charset=utf-8' `
      -Headers @{ 'X-League-Key' = $k; 'X-Client-IP' = $ip } -Body $json
    return @{ status = [int]$r.StatusCode; body = ([System.Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray()) | ConvertFrom-Json) }
  } catch [System.Net.WebException] {
    $resp = $_.Exception.Response
    $text = (New-Object System.IO.StreamReader($resp.GetResponseStream(), [System.Text.Encoding]::UTF8)).ReadToEnd()
    return @{ status = [int]$resp.StatusCode; body = ($text | ConvertFrom-Json) }
  }
}
function Check($name, $ok, $detail) {
  if ($ok) { Write-Host "ĐẠT   $name" -ForegroundColor Green } else { Write-Host "CHƯA  $name  $detail" -ForegroundColor Red }
}
$stamp = Get-Date -Format 'HHmmss'

# 7.1 lookup
$r = Call @{ action = 'lookup'; code = $Code }
Check '7.1 lookup mã VNC trả đúng hồ sơ' ($r.status -eq 200 -and $r.body.found -and $r.body.student_code -eq $Code.ToUpper()) ($r | ConvertTo-Json -Depth 5)
if ($r.body.found) { Write-Host ("      {0} · sổ {1} · SĐT phụ huynh {2}" -f $r.body.name_masked, $r.body.passport_code, $r.body.guardian.phone) }
$child = $r.body
$r = Call @{ action = 'lookup'; code = $Code } 'khoa-sai'
Check '7.1 sai khoá → 401' ($r.status -eq 401) $r.status
$last = $null
for ($i = 1; $i -le 21; $i++) { $last = Call @{ action = 'lookup'; code = 'KHONGCO' } $key "smoke-rate-$stamp" }
Check '7.1 quá 20 lần/phút → chặn (429)' ($last.status -eq 429) $last.status

# 7.2 issue: bạn 10/10 (cùng tên + SĐT phụ huynh, như khi quét QR sổ điền sẵn) → matched
if ($child.found -and $child.guardian.phone) {
  $r = Call @{ action = 'issue'; league_ref = "smoke:$stamp/matched"; child = @{ name = $child.name }; guardian = @{ phone = $child.guardian.phone } }
  Check '7.2 bạn 10/10 → matched, dùng lại mã có sẵn' ($r.body.status -eq 'matched' -and $r.body.student_code -eq $child.student_code -and $r.body.passport_code -eq $child.passport_code) ($r | ConvertTo-Json -Depth 5)
} else { Write-Host 'BỎ QUA 7.2 matched: mã này không có SĐT phụ huynh' -ForegroundColor Yellow }

# 7.2 issue: bạn mới hoàn toàn → created, có mã VNC + mã sổ + QR; gọi lại cùng league_ref → cùng kết quả
$ref = "smoke:$stamp/new"
$r = Call @{ action = 'issue'; league_ref = $ref; child = @{ name = "Test SNAG Ban Moi $stamp"; dob = '2018-01-02'; gender = 'female' }; guardian = @{ name = 'Test PH'; phone = '0900000000' } }
Check '7.2 bạn mới → created' ($r.body.status -eq 'created' -and $r.body.student_code -match '^VNC-\d{6}$' -and $r.body.passport_code) ($r | ConvertTo-Json -Depth 5)
Write-Host ("      {0} · sổ {1} · QR {2}" -f $r.body.student_code, $r.body.passport_code, $r.body.qr_url)
$r2 = Call @{ action = 'issue'; league_ref = $ref; child = @{ name = 'Ai Khac' } }
Check '7.2 gọi lại cùng league_ref → cùng kết quả' ($r2.body.student_code -eq $r.body.student_code -and $r2.body.passport_code -eq $r.body.passport_code) ($r2 | ConvertTo-Json -Depth 5)
Write-Host "Mở thử QR: $($r.body.qr_url)"
$key = $null
