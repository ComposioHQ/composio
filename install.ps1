# Install the complete Windows x64 CLI bundle from a verified GitHub release.
param(
    [string]$Version = $env:COMPOSIO_INSTALL_VERSION,
    [string]$InstallDir = $env:COMPOSIO_INSTALL_DIR,
    [switch]$NoPath
)

function Install-Composio {
    param(
        [string]$Version = $env:COMPOSIO_INSTALL_VERSION,
        [string]$InstallDir = $env:COMPOSIO_INSTALL_DIR,
        [switch]$NoPath
    )
    $ErrorActionPreference = 'Stop'
    if (-not $InstallDir) { $InstallDir = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.composio' }
    $InstallDir = [IO.Path]::GetFullPath($InstallDir)
    $owner = if ($env:COMPOSIO_GITHUB_OWNER) { $env:COMPOSIO_GITHUB_OWNER } else { 'ComposioHQ' }
    $repo = if ($env:COMPOSIO_GITHUB_REPO) { $env:COMPOSIO_GITHUB_REPO } else { 'composio' }
    if ($owner -notmatch '^[A-Za-z0-9._-]+$' -or $repo -notmatch '^[A-Za-z0-9._-]+$') { throw 'Invalid GitHub owner or repository.' }
    $api = if ($env:COMPOSIO_GITHUB_API_BASE_URL) { $env:COMPOSIO_GITHUB_API_BASE_URL.TrimEnd('/') } else { 'https://api.github.com' }
    function Test-DownloadUrl([uri]$Uri) {
        return -not $Uri.UserInfo -and ($Uri.Scheme -eq 'https' -or ($Uri.Scheme -eq 'http' -and $Uri.IsLoopback))
    }
    if (-not (Test-DownloadUrl ([uri]$api))) { throw 'The GitHub API URL must use HTTPS (HTTP is allowed on localhost).' }
    $releasesUrl = "$api/repos/$owner/$repo/releases"
    $archiveName = 'composio-windows-x64.zip'

    if ($Version) {
        $bareVersion = $Version -replace '^@composio/cli@', ''
        if ($bareVersion -notmatch '^\d+\.\d+\.\d+(-beta\.\d+)?$') { throw "Invalid CLI version: $Version" }
        $tag = "@composio/cli@$bareVersion"
        $release = Invoke-RestMethod -Uri "$releasesUrl/tags/$([uri]::EscapeDataString($tag))" -TimeoutSec 60
    } else {
        $release = $null
        for ($page = 1; $page -le 5 -and -not $release; $page++) {
            $releases = @(Invoke-RestMethod -Uri "${releasesUrl}?per_page=100&page=$page" -TimeoutSec 60)
            $release = $releases | Where-Object {
                -not $_.draft -and -not $_.prerelease -and $_.tag_name -match '^@composio/cli@\d+\.\d+\.\d+$' -and
                @($_.assets | Where-Object { $_.name -eq $archiveName }).Count -gt 0
            } | Sort-Object { [version]($_.tag_name -replace '^@composio/cli@', '') } -Descending | Select-Object -First 1
            if ($releases.Count -eq 0) { break }
        }
        if (-not $release) { throw 'No stable CLI release with a Windows x64 archive was found.' }
        $tag = $release.tag_name
    }
    $archive = $release.assets | Where-Object { $_.name -eq $archiveName } | Select-Object -First 1
    $checksums = $release.assets | Where-Object { $_.name -eq 'checksums.txt' } | Select-Object -First 1
    if (-not $archive) { throw "Release $tag has no Windows x64 archive." }
    if (-not $checksums) { throw "Release $tag has no checksums.txt. Refusing to install." }

    $tempDir = Join-Path ([IO.Path]::GetTempPath()) "composio-install-$([Guid]::NewGuid())"
    New-Item -ItemType Directory -Path $tempDir | Out-Null
    try {
        $zipPath = Join-Path $tempDir $archiveName
        $checksumPath = Join-Path $tempDir 'checksums.txt'
        foreach ($download in @(@($archive.browser_download_url, $zipPath), @($checksums.browser_download_url, $checksumPath))) {
            $uri = [uri]$download[0]
            if (-not (Test-DownloadUrl $uri)) { throw 'Release download URLs must use HTTPS (HTTP is allowed on localhost), without credentials.' }
            Invoke-WebRequest -Uri $download[0] -OutFile $download[1] -UseBasicParsing -TimeoutSec 120
        }
        $checksumLine = Get-Content -LiteralPath $checksumPath | Where-Object { $_ -match '^([a-fA-F0-9]{64})\s+\*?composio-windows-x64\.zip$' } | Select-Object -First 1
        if (-not $checksumLine) { throw "Missing or malformed checksum for $archiveName. Refusing to install." }
        $expectedHash = ($checksumLine -split '\s+')[0]
        if ((Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash -ne $expectedHash) { throw "Checksum mismatch for $archiveName. Refusing to install." }
        $extractDir = Join-Path $tempDir 'extract'
        Expand-Archive -LiteralPath $zipPath -DestinationPath $extractDir
        $bundle = Join-Path $extractDir 'composio-windows-x64'
        foreach ($relativePath in @('composio.exe', 'release-tag.txt', 'run-helpers-runtime.mjs', 'generation-runtime.mjs', 'services/run-helpers-runtime.mjs', 'services/generation-runtime.mjs')) {
            if (-not (Test-Path -LiteralPath (Join-Path $bundle $relativePath) -PathType Leaf)) { throw "Incomplete CLI bundle: missing $relativePath. Refusing to install." }
        }
        New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
        $target = Join-Path $InstallDir 'composio.exe'
        $backup = "$target.old"
        try {
            if (Test-Path -LiteralPath $backup) { Remove-Item -LiteralPath $backup -Force }
        } catch {
            throw "Could not remove the previous executable backup. Close other Composio processes and retry. $($_.Exception.Message)"
        }
        # Copy support files individually so credentials and config in .composio survive.
        Get-ChildItem -LiteralPath $bundle -Force | Where-Object { $_.Name -ne 'composio.exe' } | ForEach-Object {
            Copy-Item -LiteralPath $_.FullName -Destination $InstallDir -Recurse -Force
        }
        $staged = Join-Path $InstallDir "composio-$([Guid]::NewGuid()).exe"
        Copy-Item -LiteralPath (Join-Path $bundle 'composio.exe') -Destination $staged
        try {
            $hadTarget = Test-Path -LiteralPath $target
            if ($hadTarget) { Move-Item -LiteralPath $target -Destination $backup }
            try { Move-Item -LiteralPath $staged -Destination $target } catch {
                if ($hadTarget) { Move-Item -LiteralPath $backup -Destination $target }
                throw
            }
            Remove-Item -LiteralPath $backup -Force -ErrorAction SilentlyContinue
        } finally {
            if (Test-Path -LiteralPath $staged) { Remove-Item -LiteralPath $staged -Force }
        }
        if (-not $NoPath) {
            $separator = [IO.Path]::PathSeparator
            $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
            if ($InstallDir -notin @($userPath -split [regex]::Escape([string]$separator))) {
                [Environment]::SetEnvironmentVariable('Path', (@($InstallDir, $userPath) | Where-Object { $_ }) -join $separator, 'User')
            }
            if ($InstallDir -notin $env:PATH.Split($separator)) { $env:PATH = "$InstallDir$separator$env:PATH" }
        }
        Write-Host "Installed $tag in $InstallDir. Run composio login to connect your account."
    } finally {
        Remove-Item -LiteralPath $tempDir -Recurse -Force
    }
}

if ($MyInvocation.InvocationName -ne '.') {
    $ErrorActionPreference = 'Stop'
    if ([Environment]::OSVersion.Platform -ne 'Win32NT' -or $env:PROCESSOR_ARCHITECTURE -ne 'AMD64') {
        throw 'This installer requires Windows x64. Use install.sh on Linux, macOS, or WSL.'
    }
    Install-Composio -Version $Version -InstallDir $InstallDir -NoPath:$NoPath
}
