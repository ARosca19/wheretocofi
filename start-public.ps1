param(
  [int]$Port = 8000,
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $projectRoot "backend"
$frontendDir = Join-Path $projectRoot "frontend"
$pythonPath = Join-Path $backendDir "venv\Scripts\python.exe"
$localUrl = "http://127.0.0.1:$Port"
$backendProcess = $null

if (-not (Test-Path -LiteralPath $pythonPath)) {
  throw "Python environment not found at $pythonPath"
}

$cloudflaredCommand = Get-Command cloudflared -ErrorAction SilentlyContinue
$cloudflaredPath = if ($cloudflaredCommand) { $cloudflaredCommand.Source } else { $null }

if (-not $cloudflaredPath) {
  $cloudflaredPath = @(
    "C:\Program Files\cloudflared\cloudflared.exe",
    "C:\Program Files (x86)\cloudflared\cloudflared.exe",
    (Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Links\cloudflared.exe")
  ) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
}

if (-not $cloudflaredPath) {
  throw "cloudflared is not installed. Run: winget install --id Cloudflare.cloudflared"
}

try {
  $serverAlreadyRunning = $false
  try {
    Invoke-WebRequest -Uri "$localUrl/openapi.json" -UseBasicParsing -TimeoutSec 2 | Out-Null
    $serverAlreadyRunning = $true
  } catch {
    $serverAlreadyRunning = $false
  }

  if ($serverAlreadyRunning) {
    Write-Host "Using the existing WhereToCofi server on $localUrl ..." -ForegroundColor Cyan
  } else {
    Write-Host "Starting WhereToCofi on $localUrl ..." -ForegroundColor Cyan
    $backendProcess = Start-Process `
      -FilePath $pythonPath `
      -ArgumentList @(
        "-m", "uvicorn", "main:app",
        "--host", "127.0.0.1",
        "--port", $Port,
        "--reload",
        "--reload-dir", $backendDir,
        "--reload-dir", $frontendDir
      ) `
      -WorkingDirectory $backendDir `
      -WindowStyle Hidden `
      -PassThru

    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
      Start-Sleep -Milliseconds 500
      try {
        Invoke-WebRequest -Uri "$localUrl/openapi.json" -UseBasicParsing -TimeoutSec 2 | Out-Null
        $ready = $true
        break
      } catch {
        if ($backendProcess.HasExited) {
          throw "The backend process stopped before becoming ready."
        }
      }
    }

    if (-not $ready) {
      throw "The backend did not start on $localUrl. Check whether port $Port is already in use."
    }
  }

  if (-not $NoBrowser) {
    Start-Process $localUrl
  }

  Write-Host "`nCreating a random public URL..." -ForegroundColor Cyan
  Write-Host "Keep this window open. Press Ctrl+C to stop sharing.`n" -ForegroundColor Yellow
  & $cloudflaredPath tunnel --url $localUrl --no-autoupdate
} finally {
  if ($backendProcess -and -not $backendProcess.HasExited) {
    Stop-Process -Id $backendProcess.Id -Force
  }
}
