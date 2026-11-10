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
        return @(
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
