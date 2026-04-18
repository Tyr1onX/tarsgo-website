param(
    [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$ErrorActionPreference = "Stop"
if (Get-Variable PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
    $PSNativeCommandUseErrorActionPreference = $false
}

function Read-DotEnv {
    param([string]$Path)

    $values = @{}
    if (-not (Test-Path $Path)) {
        return $values
    }

    foreach ($line in Get-Content $Path) {
        $trimmed = $line.Trim()
        if ($trimmed.Length -eq 0 -or $trimmed.StartsWith("#")) {
            continue
        }

        $parts = $line -split "=", 2
        if ($parts.Count -lt 2) {
            continue
        }

        $values[$parts[0].Trim()] = $parts[1].Trim()
    }

    return $values
}

function Get-DotEnvValue {
    param(
        [hashtable]$Values,
        [string]$Key,
        [string]$Default
    )

    if ($Values.ContainsKey($Key) -and $Values[$Key] -ne "") {
        return $Values[$Key]
    }

    return $Default
}

function Convert-ToMariaDbPath {
    param([string]$Path)

    return $Path.Replace("\", "/")
}

function Test-TcpPort {
    param([int]$Port)

    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $async = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
        if (-not $async.AsyncWaitHandle.WaitOne(800)) {
            return $false
        }

        $client.EndConnect($async)
        return $true
    }
    catch {
        return $false
    }
    finally {
        $client.Close()
    }
}

function Find-MariaDbBinDir {
    if ($env:MARIADB_BIN_DIR -and (Test-Path (Join-Path $env:MARIADB_BIN_DIR "mariadbd.exe"))) {
        return $env:MARIADB_BIN_DIR
    }

    $candidates = Get-ChildItem "C:\Program Files" -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -like "MariaDB*" } |
        Sort-Object Name -Descending

    foreach ($candidate in $candidates) {
        $binDir = Join-Path $candidate.FullName "bin"
        if (Test-Path (Join-Path $binDir "mariadbd.exe")) {
            return $binDir
        }
    }

    throw "MariaDB installation not found. Install MariaDB first, or set MARIADB_BIN_DIR to its bin directory."
}

function Test-AppDatabaseReady {
    param(
        [string]$ClientPath,
        [int]$Port,
        [string]$DatabaseName,
        [string]$DatabaseUser,
        [string]$DatabasePassword
    )

    if (-not (Test-TcpPort -Port $Port)) {
        return $false
    }

    try {
        & $ClientPath --protocol=tcp --skip-ssl -h 127.0.0.1 -P $Port -u $DatabaseUser "--password=$DatabasePassword" -D $DatabaseName -e "SELECT 1;" 1>$null 2>$null
        return $LASTEXITCODE -eq 0
    }
    catch {
        return $false
    }
}

function Test-RootConnection {
    param(
        [string]$ClientPath,
        [int]$Port,
        [string]$RootPassword
    )

    if (-not (Test-TcpPort -Port $Port)) {
        return $false
    }

    try {
        & $ClientPath --protocol=tcp --skip-ssl -h 127.0.0.1 -P $Port -u root "--password=$RootPassword" -e "SELECT 1;" 1>$null 2>$null
        return $LASTEXITCODE -eq 0
    }
    catch {
        return $false
    }
}

$backendEnvPath = Join-Path $RepoRoot "internal\backend\.env"
$envValues = Read-DotEnv -Path $backendEnvPath

$dbHost = Get-DotEnvValue -Values $envValues -Key "DB_HOST" -Default "127.0.0.1"
$dbPort = [int](Get-DotEnvValue -Values $envValues -Key "DB_PORT" -Default "3307")
$dbName = Get-DotEnvValue -Values $envValues -Key "DB_NAME" -Default "tarsgo"
$dbUser = Get-DotEnvValue -Values $envValues -Key "DB_USER" -Default "tarsgo"
$dbPassword = Get-DotEnvValue -Values $envValues -Key "DB_PASSWORD" -Default "tarsgo123456"

if ($dbHost -notin @("127.0.0.1", "localhost")) {
    throw "DB_HOST=$dbHost in internal/backend/.env is not local, so this script will not start a local database for it."
}

$binDir = Find-MariaDbBinDir
$serverPath = Join-Path $binDir "mariadbd.exe"
$installDbPath = Join-Path $binDir "mariadb-install-db.exe"
if (-not (Test-Path $installDbPath)) {
    $installDbPath = Join-Path $binDir "mysql_install_db.exe"
}

$clientPath = Join-Path $binDir "mariadb.exe"
if (-not (Test-Path $clientPath)) {
    $clientPath = Join-Path $binDir "mysql.exe"
}

$baseDir = Split-Path $binDir -Parent
$pluginDir = Join-Path $baseDir "lib\plugin"
$runtimeDir = Join-Path $RepoRoot ".runtime"
$dbRuntimeDir = Join-Path $runtimeDir "mariadb"
$dataDir = Join-Path $dbRuntimeDir "data"
$tmpDir = Join-Path $dbRuntimeDir "tmp"
$logDir = Join-Path $runtimeDir "logs"
$stderrLog = Join-Path $logDir "mariadb.err.log"
$defaultsFile = Join-Path $dbRuntimeDir "my.ini"
$rootPassword = "tarsgo-root-local"

foreach ($directory in @($runtimeDir, $dbRuntimeDir, $dataDir, $tmpDir, $logDir)) {
    New-Item -ItemType Directory -Force -Path $directory | Out-Null
}

if (Test-AppDatabaseReady -ClientPath $clientPath -Port $dbPort -DatabaseName $dbName -DatabaseUser $dbUser -DatabasePassword $dbPassword) {
    Write-Output "MariaDB is already ready at 127.0.0.1:$dbPort / $dbName"
    exit 0
}

if ((Test-TcpPort -Port $dbPort) -and -not (Test-RootConnection -ClientPath $clientPath -Port $dbPort -RootPassword $rootPassword)) {
    throw "Port $dbPort is already in use, but not by a database instance managed by this project."
}

if (-not (Test-Path (Join-Path $dataDir "mysql"))) {
    & $installDbPath -d $dataDir -p $rootPassword -P $dbPort -s
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to initialize the local MariaDB data directory."
    }
}

$config = @"
[mysqld]
datadir=$(Convert-ToMariaDbPath $dataDir)
port=$dbPort
bind-address=127.0.0.1
basedir=$(Convert-ToMariaDbPath $baseDir)
plugin-dir=$(Convert-ToMariaDbPath $pluginDir)
tmpdir=$(Convert-ToMariaDbPath $tmpDir)
character-set-server=utf8mb4
collation-server=utf8mb4_unicode_ci
log-error=$(Convert-ToMariaDbPath $stderrLog)
pid-file=$(Convert-ToMariaDbPath (Join-Path $dbRuntimeDir "mariadb.pid"))

[client]
port=$dbPort
plugin-dir=$(Convert-ToMariaDbPath $pluginDir)
"@

Set-Content -Path $defaultsFile -Value $config -Encoding ASCII

if (-not (Test-RootConnection -ClientPath $clientPath -Port $dbPort -RootPassword $rootPassword)) {
    if (Test-Path $stderrLog) {
        Remove-Item -LiteralPath $stderrLog -Force
    }

    $process = Start-Process -FilePath $serverPath `
        -ArgumentList @("--defaults-file=$defaultsFile", "--standalone") `
        -WorkingDirectory $dbRuntimeDir `
        -WindowStyle Hidden `
        -PassThru

    $ready = $false
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        Start-Sleep -Milliseconds 500

        if ($process.HasExited) {
            break
        }

        if (Test-RootConnection -ClientPath $clientPath -Port $dbPort -RootPassword $rootPassword) {
            $ready = $true
            break
        }
    }

    if (-not $ready) {
        if (Test-Path $stderrLog) {
            Get-Content $stderrLog -Tail 80
        }

        throw "MariaDB failed to start."
    }
}

$dbNameSql = $dbName.Replace('`', '``')
$dbUserSql = $dbUser.Replace("'", "''")
$dbPasswordSql = $dbPassword.Replace("'", "''")
$setupSql = @(
    "CREATE DATABASE IF NOT EXISTS ``$dbNameSql`` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
    "CREATE USER IF NOT EXISTS '$dbUserSql'@'localhost' IDENTIFIED BY '$dbPasswordSql'",
    "ALTER USER '$dbUserSql'@'localhost' IDENTIFIED BY '$dbPasswordSql'",
    "CREATE USER IF NOT EXISTS '$dbUserSql'@'127.0.0.1' IDENTIFIED BY '$dbPasswordSql'",
    "ALTER USER '$dbUserSql'@'127.0.0.1' IDENTIFIED BY '$dbPasswordSql'",
    "CREATE USER IF NOT EXISTS '$dbUserSql'@'%' IDENTIFIED BY '$dbPasswordSql'",
    "ALTER USER '$dbUserSql'@'%' IDENTIFIED BY '$dbPasswordSql'",
    "GRANT ALL PRIVILEGES ON ``$dbNameSql``.* TO '$dbUserSql'@'localhost'",
    "GRANT ALL PRIVILEGES ON ``$dbNameSql``.* TO '$dbUserSql'@'127.0.0.1'",
    "GRANT ALL PRIVILEGES ON ``$dbNameSql``.* TO '$dbUserSql'@'%'",
    "FLUSH PRIVILEGES"
) -join "; "

& $clientPath --protocol=tcp --skip-ssl -h 127.0.0.1 -P $dbPort -u root "--password=$rootPassword" -e "$setupSql;"
if ($LASTEXITCODE -ne 0) {
    throw "Failed to create the project database and user."
}

if (-not (Test-AppDatabaseReady -ClientPath $clientPath -Port $dbPort -DatabaseName $dbName -DatabaseUser $dbUser -DatabasePassword $dbPassword)) {
    throw "Database started, but the project account still cannot connect."
}

Write-Output "MariaDB started at 127.0.0.1:$dbPort"
Write-Output "Database: $dbName"
Write-Output "User: $dbUser"
Write-Output "Logs: $stderrLog"
