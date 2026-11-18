# Start the full Virtual Metallurgy Lab stack (Windows PowerShell).
# Usage:  powershell -File scripts\start-dev.ps1 [pycalphad|heat-treatment|micrograph|next|all]
param([string]$Target = "all")
$ErrorActionPreference = "Continue"
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo
$venvPy = Join-Path $repo ".venv\Scripts\python.exe"
if (-not (Test-Path $venvPy)) { $venvPy = Join-Path $repo ".venv\bin\python" }
New-Item -ItemType Directory -Force -Path "$repo\logs" | Out-Null

function Start-Svc([string]$name) {
  $env:PYTHONPATH = $null   # never leak global site-packages into the venv
  Start-Process -FilePath $venvPy `
    -ArgumentList @("-E", "-s", (Join-Path $repo "scripts\start_service.py"), $name) `
    -WorkingDirectory $repo `
    -RedirectStandardOutput "$repo\logs\$name.log" `
    -RedirectStandardError "$repo\logs\$name.err.log" `
    -WindowStyle Hidden
  Write-Host "started $name (log: logs\$name.log)"
}

switch ($Target) {
  "pycalphad"      { Start-Svc pycalphad }
  "heat-treatment" { Start-Svc heat-treatment }
  "micrograph"     { Start-Svc micrograph }
  "next"           { bun run dev }
  "all" {
    Start-Svc pycalphad
    Start-Svc heat-treatment
    Start-Svc micrograph
    Write-Host "services: pycalphad:8000 heat-treatment:8001 micrograph:8003 (logs\)"
    Write-Host "starting Next.js dev server on :3000 ..."
    bun run dev
  }
  default { Write-Host "usage: .\scripts\start-dev.ps1 [pycalphad|heat-treatment|micrograph|next|all]" }
}
