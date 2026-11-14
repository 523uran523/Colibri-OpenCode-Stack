# Watchdog for the Colibri server on port 8000.
#
# The engine was observed to exit silently once (no traceback, no Windows
# Application-Event error, port freed, VRAM released). This loop restarts it
# ONLY while tools\watchdog.enabled exists, so manual `coli stop` / bat-file
# switching stays in control. Delete the flag file to disarm.
#
# Run detached:  powershell -NoProfile -ExecutionPolicy Bypass -File tools\server-watch.ps1

$proj = "C:\Users\523ur\OneDrive\Документы\calibri"
$flag = Join-Path $proj "tools\watchdog.enabled"
$log  = Join-Path $proj "logs\server-watch.log"

while ($true) {
  Start-Sleep -Seconds 60
  if (-not (Test-Path $flag)) { continue }
  $listen = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
  if ($listen) { continue }
  $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  "$ts port 8000 dead -> relaunching Start_Parable_Server.bat" | Out-File $log -Append -Encoding utf8
  Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "`"$proj\Start_Parable_Server.bat`"" `
    -WorkingDirectory $proj -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $proj "logs\parable-server.out.log") `
    -RedirectStandardError (Join-Path $proj "logs\parable-server.err.log") | Out-Null
  # cooldown: the bat itself stops any old server first, but let the new one bind
  Start-Sleep -Seconds 120
}
