Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$backendDir = Join-Path $repoRoot "internal\backend"
$frontendDir = Join-Path $repoRoot "internal\frontend"
$backendEnvFile = Join-Path $backendDir ".env"
$backendEnvExampleFile = Join-Path $backendDir ".env.example"
$startDbScript = Join-Path $scriptDir "start-db.ps1"

function Test-BackendReady {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Url
    )

    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
        if ($response.StatusCode -ne 200) {
            return $false
        }

        $health = $response.Content | ConvertFrom-Json -ErrorAction Stop
        return $health.status -eq "ok" -and $health.database -eq "up"
    }
    catch {
        return $false
    }
}

function Wait-BackendReady {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Url,
        [int]$MaxAttempts = 30,
        [int]$DelaySeconds = 2
    )

    for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
        if (Test-BackendReady -Url $Url) {
            return
        }
        Start-Sleep -Seconds $DelaySeconds
    }

    throw "Timed out waiting for a healthy TarsGo backend at $Url."
}

function Test-FrontendReady {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Url
    )

    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
        $contentType = [string]$response.Headers["Content-Type"]
        return $response.StatusCode -eq 200 -and
            $contentType -match "^text/html(?:;|$)" -and
            $response.Content -match "(?is)<html(?:\s|>)"
    }
    catch {
        return $false
    }
}

function Wait-FrontendReady {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Url,
        [int]$MaxAttempts = 30,
        [int]$DelaySeconds = 2
    )

    for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {
        if (Test-FrontendReady -Url $Url) {
            return
        }
        Start-Sleep -Seconds $DelaySeconds
    }

    throw "Timed out waiting for the frontend HTML page at $Url."
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
if (-not (Get-Command "go" -ErrorAction SilentlyContinue)) {
    throw "Go is required to run the TarsGo backend."
}
if (-not (Get-Command "docker" -ErrorAction SilentlyContinue)) {
    throw "Docker Compose v2 is required to start the local database."
}

$nodeVersionOutput = & node --version
if ($LASTEXITCODE -ne 0) {
    throw "Node.js 22.23.4 is required."
}
try {
    $nodeVersion = [version]$nodeVersionOutput.TrimStart("v")
}
catch {
    throw "Unable to read the installed Node.js version: $nodeVersionOutput"
}
if ($nodeVersion.ToString() -ne "22.23.4") {
    throw "Node.js 22.23.4 is required; found $nodeVersionOutput."
}
if (-not (Get-Command "corepack.cmd" -ErrorAction SilentlyContinue)) {
    throw "Corepack is required to use the repository's pinned pnpm version. Install Node.js 22.23.4."
}

if (-not (Test-Path $backendEnvFile)) {
    if (-not (Test-Path $backendEnvExampleFile)) {
        throw "Backend environment file and example are both missing."
    }
    Copy-Item -Path $backendEnvExampleFile -Destination $backendEnvFile
    Write-Host "Created internal/backend/.env from .env.example; review credentials before continuing."
}

$backendPortLine = Get-Content -Path $backendEnvFile | Where-Object { $_ -match '^\s*APP_PORT=' } | Select-Object -Last 1
$backendPort = if ($backendPortLine) { ($backendPortLine -split "=", 2)[1].Trim().Trim('"') } else { "8080" }
if ($backendPort -notmatch '^\d+$' -or [int]$backendPort -lt 1 -or [int]$backendPort -gt 65535) {
    throw "APP_PORT in internal/backend/.env must be a valid TCP port."
}

$env:COREPACK_ENABLE_DOWNLOAD_PROMPT = "0"
Write-Host "Starting MariaDB..."
& $startDbScript

Push-Location $frontendDir
try {
    $pnpmVersion = & corepack.cmd pnpm --version
    if ($LASTEXITCODE -ne 0 -or $pnpmVersion.Trim() -ne "9.15.4") {
        throw "Unable to prepare the pinned pnpm 9.15.4 runtime."
    }
    & corepack.cmd pnpm install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) {
        throw "Frontend dependencies could not be installed from pnpm-lock.yaml."
    }
}
finally {
    Pop-Location
}

$backendUrl = "http://127.0.0.1:$backendPort/healthz"
if (Test-PortListening -Port ([int]$backendPort)) {
    if (-not (Test-BackendReady -Url $backendUrl)) {
        throw "Port $backendPort is occupied, but TarsGo /healthz does not report a healthy database-backed service."
    }
    Write-Host "TarsGo backend is already healthy on port $backendPort."
}
else {
    Write-Host "Starting backend on http://127.0.0.1:$backendPort ..."
    Start-DetachedPowerShell `
        -Title "TarsGo Backend" `
        -WorkingDirectory $backendDir `
        -Command '$env:GOPROXY = "https://goproxy.cn,direct"; go run ./cmd/server'
    Wait-BackendReady -Url $backendUrl
}

$frontendUrl = "http://127.0.0.1:5173"
if (Test-PortListening -Port 5173) {
    if (-not (Test-FrontendReady -Url $frontendUrl)) {
        throw "Port 5173 is occupied, but it does not serve the TarsGo frontend HTML page."
    }
    Write-Host "TarsGo frontend is already ready on port 5173."
}
else {
    Write-Host "Starting frontend on $frontendUrl ..."
    $frontendCommand = '$env:TARSGO_API_PROXY = "http://127.0.0.1:' + $backendPort + '"; corepack.cmd pnpm run dev -- --host 127.0.0.1 --port 5173 --strictPort'
    Start-DetachedPowerShell `
        -Title "TarsGo Frontend" `
        -WorkingDirectory $frontendDir `
        -Command $frontendCommand
    Wait-FrontendReady -Url $frontendUrl
}

Write-Host ""
Write-Host "TarsGo is ready:"
Write-Host "  Frontend: $frontendUrl"
Write-Host "  Backend : http://127.0.0.1:$backendPort"
Write-Host ""
Write-Host "Close the 'TarsGo Backend' and 'TarsGo Frontend' windows to stop the app."
