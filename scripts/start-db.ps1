Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$composeFile = Join-Path $repoRoot "database\docker-compose.yml"
$backendEnvFile = Join-Path $repoRoot "internal\backend\.env"
$backendEnvExampleFile = Join-Path $repoRoot "internal\backend\.env.example"

function Get-EnvValueFromFile {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [Parameter(Mandatory = $true)]
        [string]$Name
    )

    if (-not (Test-Path $Path)) {
        return $null
    }

    foreach ($line in Get-Content -Path $Path) {
        if ($line -match '^\s*#') {
            continue
        }

        $parts = $line -split '=', 2
        if ($parts.Count -ne 2) {
            continue
        }

        if ($parts[0].Trim() -ne $Name) {
            continue
        }

        return $parts[1].Trim().Trim('"')
    }

    return $null
}

if (-not (Test-Path $composeFile)) {
    throw "Compose file not found: $composeFile"
}
if (-not (Get-Command "docker" -ErrorAction SilentlyContinue)) {
    throw "Cannot start the local database: Docker Compose v2 is required."
}

$hostPort = Get-EnvValueFromFile -Path $backendEnvFile -Name "DB_PORT"
if (-not $hostPort) {
    $hostPort = Get-EnvValueFromFile -Path $backendEnvExampleFile -Name "DB_PORT"
}
if (-not $hostPort) {
    $hostPort = "3307"
}

$env:MYSQL_HOST_PORT = $hostPort
$dbName = Get-EnvValueFromFile -Path $backendEnvFile -Name "DB_NAME"
if (-not $dbName) { $dbName = Get-EnvValueFromFile -Path $backendEnvExampleFile -Name "DB_NAME" }
$dbUser = Get-EnvValueFromFile -Path $backendEnvFile -Name "DB_USER"
if (-not $dbUser) { $dbUser = Get-EnvValueFromFile -Path $backendEnvExampleFile -Name "DB_USER" }
$dbPassword = Get-EnvValueFromFile -Path $backendEnvFile -Name "DB_PASSWORD"
if (-not $dbPassword) { $dbPassword = Get-EnvValueFromFile -Path $backendEnvExampleFile -Name "DB_PASSWORD" }
if ($dbName) { $env:MARIADB_DATABASE = $dbName }
if ($dbUser) { $env:MARIADB_USER = $dbUser }
if ($dbPassword) { $env:MARIADB_PASSWORD = $dbPassword }

Write-Host "Starting MariaDB with $composeFile"
$readyTimeout = if ([string]::IsNullOrWhiteSpace($env:DB_READY_TIMEOUT)) { "120" } else { $env:DB_READY_TIMEOUT }
if ($readyTimeout -notmatch '^[1-9]\d*$') {
    throw "DB_READY_TIMEOUT must be a positive number of seconds."
}
& docker compose -f $composeFile up -d --wait --wait-timeout $readyTimeout
if ($LASTEXITCODE -ne 0) {
    throw "MariaDB did not become healthy within $($readyTimeout)s. Check Docker Desktop and the container logs."
}

Write-Host "MariaDB is healthy and ready on 127.0.0.1:$hostPort."
