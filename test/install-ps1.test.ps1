param([string]$ArchivePath)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/../install.ps1"

function Assert-Equal($Actual, $Expected, [string]$Message) {
    if ($Actual -ne $Expected) { throw "$Message (expected '$Expected', got '$Actual')" }
}

$testRoot = Join-Path ([IO.Path]::GetTempPath()) ([Guid]::NewGuid().ToString())
$originalPath = $env:PATH
$originalUserPath = [Environment]::GetEnvironmentVariable('Path', 'User')
New-Item -ItemType Directory -Path $testRoot | Out-Null
try {
    $script:fixtureArchive = Join-Path $testRoot 'fixture.zip'
    if ($ArchivePath) {
        Copy-Item -LiteralPath $ArchivePath -Destination $script:fixtureArchive
    } else {
        $bundle = Join-Path $testRoot 'composio-windows-x64'
        New-Item -ItemType Directory -Path (Join-Path $bundle 'services') -Force | Out-Null
        foreach ($file in @('composio.exe', 'release-tag.txt', 'run-helpers-runtime.mjs', 'generation-runtime.mjs', 'services/run-helpers-runtime.mjs', 'services/generation-runtime.mjs')) {
            Set-Content -LiteralPath (Join-Path $bundle $file) -Value 'fixture'
        }
        Compress-Archive -LiteralPath $bundle -DestinationPath $script:fixtureArchive
    }
    $script:fixtureHash = (Get-FileHash -LiteralPath $script:fixtureArchive -Algorithm SHA256).Hash
    $script:fixtureRelease = [pscustomobject]@{
        tag_name = '@composio/cli@1.2.3'; draft = $false; prerelease = $false
        assets = @(
            [pscustomobject]@{ name = 'composio-windows-x64.zip'; browser_download_url = 'https://example.test/cli.zip' },
            [pscustomobject]@{ name = 'checksums.txt'; browser_download_url = 'https://example.test/checksums.txt' }
        )
    }
    function Invoke-RestMethod {
        param($Uri, $TimeoutSec)
        if ($Uri -match '/tags/') { return $script:fixtureRelease }
        Write-Output -NoEnumerate @(
            [pscustomobject]@{ tag_name = 'v9.9.9'; draft = $false; prerelease = $false; assets = @() },
            [pscustomobject]@{ tag_name = '@composio/cli@9.9.9-beta.1'; draft = $false; prerelease = $true; assets = $script:fixtureRelease.assets },
            $script:fixtureRelease
        )
    }
    function Invoke-WebRequest {
        param($Uri, $OutFile, $TimeoutSec, [switch]$UseBasicParsing)
        if ($Uri -like '*checksums.txt') {
            Set-Content -LiteralPath $OutFile -Value "$script:fixtureHash  composio-windows-x64.zip"
        } else {
            Copy-Item -LiteralPath $script:fixtureArchive -Destination $OutFile
        }
    }

    $installDir = Join-Path $testRoot 'install with spaces'
    Install-Composio -Version '1.2.3' -InstallDir $installDir -NoPath
    Assert-Equal $env:PATH $originalPath 'NoPath leaves process PATH untouched'
    Assert-Equal (Test-Path -LiteralPath (Join-Path $installDir 'composio.exe')) $true 'installs executable'
    Assert-Equal (Test-Path -LiteralPath (Join-Path $installDir 'services/generation-runtime.mjs')) $true 'installs live companions'
    Set-Content -LiteralPath (Join-Path $installDir 'user_data.json') -Value 'preserve credentials'

    Install-Composio -InstallDir $installDir
    Install-Composio -Version '@composio/cli@1.2.3' -InstallDir $installDir
    $separator = [IO.Path]::PathSeparator
    Assert-Equal @($env:PATH.Split($separator) | Where-Object { $_ -eq $installDir }).Count 1 'process PATH stays idempotent'
    if ($IsWindows -or $PSVersionTable.PSEdition -eq 'Desktop') {
        $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
        Assert-Equal @($userPath.Split(';') | Where-Object { $_ -eq $installDir }).Count 1 'User PATH stays idempotent'
    }
    Assert-Equal (Get-Content -LiteralPath (Join-Path $installDir 'user_data.json')) 'preserve credentials' 'reinstall preserves credentials'

    # Exercise default release discovery with real HTTP cmdlets and a JSON array.
    $portFile = Join-Path $testRoot 'http-port.txt'
    $server = Start-Job -ArgumentList $script:fixtureArchive, $script:fixtureHash, $portFile -ScriptBlock {
        param($Archive, $Hash, $PortFile)
        $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
        $listener.Start()
        $port = $listener.LocalEndpoint.Port
        [IO.File]::WriteAllText($PortFile, [string]$port)
        try {
            while ($true) {
                $pendingClient = $listener.AcceptTcpClientAsync()
                while (-not $pendingClient.Wait(100)) {}
                $client = $pendingClient.Result
                try {
                    $stream = $client.GetStream()
                    $reader = [IO.StreamReader]::new($stream)
                    $requestPath = $reader.ReadLine().Split(' ')[1]
                    while ($reader.ReadLine()) {}
                    if ($requestPath -eq '/cli.zip') {
                        $body = [IO.File]::ReadAllBytes($Archive)
                        $contentType = 'application/zip'
                    } elseif ($requestPath -eq '/checksums.txt') {
                        $body = [Text.Encoding]::UTF8.GetBytes("$Hash  composio-windows-x64.zip`n")
                        $contentType = 'text/plain'
                    } else {
                        $assets = @(
                            @{ name = 'composio-windows-x64.zip'; browser_download_url = "http://127.0.0.1:$port/cli.zip" },
                            @{ name = 'checksums.txt'; browser_download_url = "http://127.0.0.1:$port/checksums.txt" }
                        )
                        $releases = @(
                            @{ tag_name = '@composio/cli@9.9.9-beta.1'; draft = $false; prerelease = $true; assets = $assets },
                            @{ tag_name = '@composio/cli@1.2.3'; draft = $false; prerelease = $false; assets = $assets }
                        )
                        $body = [Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -InputObject $releases -Depth 5 -Compress))
                        $contentType = 'application/json'
                    }
                    $headers = [Text.Encoding]::ASCII.GetBytes("HTTP/1.1 200 OK`r`nContent-Type: $contentType`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n")
                    $stream.Write($headers, 0, $headers.Length)
                    $stream.Write($body, 0, $body.Length)
                    $stream.Flush()
                } finally { $client.Dispose() }
            }
        } finally { $listener.Stop() }
    }
    $originalApi = $env:COMPOSIO_GITHUB_API_BASE_URL
    $restMock = ${function:Invoke-RestMethod}
    $webMock = ${function:Invoke-WebRequest}
    Remove-Item Function:Invoke-RestMethod, Function:Invoke-WebRequest
    try {
        for ($attempt = 0; $attempt -lt 100 -and -not (Test-Path -LiteralPath $portFile); $attempt++) {
            if ($server.State -eq 'Failed') { throw "HTTP fixture failed: $(Receive-Job $server)" }
            Start-Sleep -Milliseconds 100
        }
        if (-not (Test-Path -LiteralPath $portFile)) { throw 'HTTP fixture did not start.' }
        $env:COMPOSIO_GITHUB_API_BASE_URL = "http://127.0.0.1:$(Get-Content -LiteralPath $portFile)"
        $httpInstallDir = Join-Path $testRoot 'http default install'
        Install-Composio -InstallDir $httpInstallDir -NoPath
        Assert-Equal (Test-Path -LiteralPath (Join-Path $httpInstallDir 'composio.exe')) $true 'default installation uses the real JSON release array'
        if ([Environment]::OSVersion.Platform -eq 'Win32NT' -and $env:PROCESSOR_ARCHITECTURE -eq 'AMD64') {
            $x86PowerShell = Join-Path $env:WINDIR 'SysWOW64/WindowsPowerShell/v1.0/powershell.exe'
            $x86InstallDir = Join-Path $testRoot 'x86 PowerShell install'
            & $x86PowerShell -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot/../install.ps1" -InstallDir $x86InstallDir -NoPath
            Assert-Equal $LASTEXITCODE 0 '32-bit PowerShell installs on x64 Windows'
            Assert-Equal (Test-Path -LiteralPath (Join-Path $x86InstallDir 'composio.exe')) $true '32-bit PowerShell installs the executable'
        }
    } finally {
        $env:COMPOSIO_GITHUB_API_BASE_URL = $originalApi
        ${function:Invoke-RestMethod} = $restMock
        ${function:Invoke-WebRequest} = $webMock
        Stop-Job $server
        Remove-Job $server
    }

    $binaryHash = (Get-FileHash -LiteralPath (Join-Path $installDir 'composio.exe')).Hash
    $script:fixtureHash = '0' * 64
    $rejected = $false
    try { Install-Composio -Version '1.2.3' -InstallDir $installDir -NoPath } catch {
        if ($_.Exception.Message -notlike '*Checksum mismatch*') { throw }
        $rejected = $true
    }
    Assert-Equal $rejected $true 'rejects corrupt download'
    Assert-Equal (Get-FileHash -LiteralPath (Join-Path $installDir 'composio.exe')).Hash $binaryHash 'checksum failure preserves installed binary'

    $archiveForUpdate = [IO.Compression.ZipFile]::Open($script:fixtureArchive, 'Update')
    try { $archiveForUpdate.GetEntry('composio-windows-x64/services/generation-runtime.mjs').Delete() } finally { $archiveForUpdate.Dispose() }
    $script:fixtureHash = (Get-FileHash -LiteralPath $script:fixtureArchive -Algorithm SHA256).Hash
    $rejected = $false
    try { Install-Composio -Version '1.2.3' -InstallDir $installDir -NoPath } catch {
        if ($_.Exception.Message -notlike '*Incomplete CLI bundle*') { throw }
        $rejected = $true
    }
    Assert-Equal $rejected $true 'rejects missing companion'
    Assert-Equal (Get-FileHash -LiteralPath (Join-Path $installDir 'composio.exe')).Hash $binaryHash 'incomplete bundle preserves installed binary'

    $script:fixtureRelease.assets = @()
    $rejected = $false
    try { Install-Composio -Version '1.2.3' -InstallDir $installDir -NoPath } catch {
        if ($_.Exception.Message -notlike '*Windows x64 archive*') { throw }
        $rejected = $true
    }
    Assert-Equal $rejected $true 'rejects release without Windows asset'
    Write-Host 'PowerShell installer fixtures passed.'
} finally {
    $env:PATH = $originalPath
    [Environment]::SetEnvironmentVariable('Path', $originalUserPath, 'User')
    Remove-Item -LiteralPath $testRoot -Recurse -Force
}
