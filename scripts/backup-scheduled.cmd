@echo off
rem Chạy bởi Windows Task Scheduler (GolfPassport-SaoLuu-*): sao lưu staging, chép sang Google Drive, ghi log.
rem Xem docs/van-hanh/sao-luu-khoi-phuc.md
cd /d C:\dev\vncentre-golf-passport
if not exist C:\dev\backups mkdir C:\dev\backups
echo ===== %DATE% %TIME% >> C:\dev\backups\backup.log
"C:\Program Files\nodejs\node.exe" scripts\backup.mjs --out C:/dev/backups --copy-to "G:/My Drive/vncentre-golf-passport/sao-luu" --keep 120 >> C:\dev\backups\backup.log 2>&1
echo exit %ERRORLEVEL% >> C:\dev\backups\backup.log
