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

$hostPort = Get-EnvValueFromFile -Path $backendEnvFile -Name "DB_PORT"
if (-not $hostPort) {
    $hostPort = Get-EnvValueFromFile -Path $backendEnvExampleFile -Name "DB_PORT"
}
if (-not $hostPort) {
    $hostPort = "4306"
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

Write-Host "Starting MySQL with $composeFile"
docker compose -f $composeFile up -d

$maxAttempts = 30
for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
    $result = Test-NetConnection -ComputerName 127.0.0.1 -Port ([int]$hostPort) -WarningAction SilentlyContinue
    if ($result.TcpTestSucceeded) {
        Write-Host "MySQL is reachable on 127.0.0.1:$hostPort"
        exit 0
    }

    Start-Sleep -Seconds 2
}

throw "MySQL did not become reachable on 127.0.0.1:$hostPort in time."
