Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$backendDir = Join-Path $repoRoot "internal\backend"
$frontendDir = Join-Path $repoRoot "internal\frontend"
$startDbScript = Join-Path $scriptDir "start-db.ps1"

function Wait-HttpReady {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Url,
        [int]$MaxAttempts = 30,
        [int]$DelaySeconds = 2
    )

    for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
                return
            }
        }
        catch {
        }

        Start-Sleep -Seconds $DelaySeconds
    }

    throw "Timed out waiting for $Url"
}

function Test-PortListening {
    param(
        [Parameter(Mandatory = $true)]
        [int]$Port
    )

    return $null -ne (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1)
}

function Start-DetachedPowerShell {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Title,
        [Parameter(Mandatory = $true)]
        [string]$WorkingDirectory,
        [Parameter(Mandatory = $true)]
        [string]$Command
    )

    $wrappedCommand = @"
`$Host.UI.RawUI.WindowTitle = '$Title'
Set-Location '$WorkingDirectory'
$Command
"@

    Start-Process -FilePath "powershell.exe" -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-Command", $wrappedCommand | Out-Null
}

if (-not (Test-Path $startDbScript)) {
    throw "Database start script not found: $startDbScript"
}

Write-Host "Starting MySQL..."
& $startDbScript

if (-not (Test-PortListening -Port 8080)) {
    Write-Host "Starting backend on http://127.0.0.1:8080 ..."
    Start-DetachedPowerShell `
        -Title "TarsGo Backend" `
        -WorkingDirectory $backendDir `
        -Command '$env:GOPROXY = "https://goproxy.cn,direct"; go run ./cmd/server'
}
else {
    Write-Host "Backend already listens on port 8080."
}

Wait-HttpReady -Url "http://127.0.0.1:8080/healthz"

if (-not (Test-PortListening -Port 5173)) {
    Write-Host "Starting frontend on http://127.0.0.1:5173 ..."
    Start-DetachedPowerShell `
        -Title "TarsGo Frontend" `
        -WorkingDirectory $frontendDir `
        -Command 'npm.cmd run dev -- --host 127.0.0.1 --port 5173'
}
else {
    Write-Host "Frontend already listens on port 5173."
}

Wait-HttpReady -Url "http://127.0.0.1:5173"

Write-Host ""
Write-Host "TarsGo is ready:"
Write-Host "  Frontend: http://127.0.0.1:5173"
Write-Host "  Backend : http://127.0.0.1:8080"
Write-Host ""
Write-Host "Close the 'TarsGo Backend' and 'TarsGo Frontend' windows to stop the app."
