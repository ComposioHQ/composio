# Composio CLI installer for Windows x64 (experimental).
#
#   irm https://raw.githubusercontent.com/ComposioHQ/composio/next/install.ps1 | iex
#
# Configure it with environment variables, like install.sh:
#   COMPOSIO_INSTALL_VERSION  Release to install, such as 0.3.1 or 0.3.1-beta.329. Default: latest stable.
#   COMPOSIO_INSTALL_DIR      Directory for the CLI bundle. Default: ~\.composio
#   COMPOSIO_INSTALL_SHELL    Set to "none" to leave PATH unchanged.

# The script block keeps variables and preferences out of the caller's session under `iex`.
& {
    $ErrorActionPreference = 'Stop'
    # Windows PowerShell redraws its progress bar per chunk, which slows downloads to a crawl.
    $ProgressPreference = 'SilentlyContinue'

    # A 32-bit PowerShell on 64-bit Windows reports the real architecture in PROCESSOR_ARCHITEW6432.
    $arch = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
    if ($env:OS -ne 'Windows_NT' -or $arch -ne 'AMD64') {
        throw 'This installer requires Windows x64. On Linux, macOS, or WSL, run: curl -fsSL https://composio.dev/install | sh'
    }

    $archiveName = 'composio-windows-x64.zip'
    $installDir = if ($env:COMPOSIO_INSTALL_DIR) { $env:COMPOSIO_INSTALL_DIR } else { Join-Path $HOME '.composio' }
    $installDir = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($installDir)

    # Find the release: the requested version, or the newest stable one that ships a Windows archive.
    $api = if ($env:COMPOSIO_GITHUB_API_BASE_URL) { $env:COMPOSIO_GITHUB_API_BASE_URL.TrimEnd('/') } else { 'https://api.github.com' }
    $releasesUrl = "$api/repos/ComposioHQ/composio/releases"
    $release = $null
    if ($env:COMPOSIO_INSTALL_VERSION) {
        $version = $env:COMPOSIO_INSTALL_VERSION -replace '^@composio/cli@', ''
        if ($version -notmatch '^\d+\.\d+\.\d+(-beta\.\d+)?$') {
            throw "Invalid Composio CLI version `"$env:COMPOSIO_INSTALL_VERSION`". Expected X.Y.Z or X.Y.Z-beta.N."
        }
        $release = Invoke-RestMethod "$releasesUrl/tags/$([uri]::EscapeDataString("@composio/cli@$version"))"
    } else {
        Write-Host 'Finding latest stable CLI release...'
        for ($page = 1; $page -le 5 -and -not $release; $page++) {
            # Assign before piping: Windows PowerShell emits the JSON array as a single object.
            $candidates = Invoke-RestMethod "${releasesUrl}?per_page=100&page=$page"
            if (-not $candidates) { break }
            $release = $candidates | Where-Object {
                $_.tag_name -match '^@composio/cli@\d+\.\d+\.\d+$' -and -not $_.draft -and -not $_.prerelease -and
                $_.assets.name -contains $archiveName
            } | Select-Object -First 1
        }
        if (-not $release) { throw 'No stable CLI release with a Windows x64 archive was found. Set COMPOSIO_INSTALL_VERSION to choose one.' }
    }
    $tag = $release.tag_name
    $archiveUrl = ($release.assets | Where-Object { $_.name -eq $archiveName }).browser_download_url
    $checksumsUrl = ($release.assets | Where-Object { $_.name -eq 'checksums.txt' }).browser_download_url
    if (-not $archiveUrl) { throw "Release $tag has no Windows x64 archive." }
    if (-not $checksumsUrl) { throw "Release $tag has no checksums.txt, so it cannot be verified. Refusing to install." }

    $tempDir = Join-Path ([IO.Path]::GetTempPath()) "composio-install-$([Guid]::NewGuid())"
    New-Item -ItemType Directory -Path $tempDir | Out-Null
    try {
        Write-Host "Installing Composio CLI $tag for windows-x64"
        $archivePath = Join-Path $tempDir $archiveName
        $checksumsPath = Join-Path $tempDir 'checksums.txt'
        Invoke-WebRequest $archiveUrl -OutFile $archivePath -UseBasicParsing
        Invoke-WebRequest $checksumsUrl -OutFile $checksumsPath -UseBasicParsing

        $entry = Select-String -LiteralPath $checksumsPath -Pattern '^([0-9a-f]{64})\s+\*?composio-windows-x64\.zip$' | Select-Object -First 1
        if (-not $entry) { throw "checksums.txt has no entry for $archiveName. Refusing to install." }
        if ((Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash -ne $entry.Matches[0].Groups[1].Value) {
            throw "Checksum mismatch for $archiveName. Refusing to install."
        }

        Expand-Archive -LiteralPath $archivePath -DestinationPath $tempDir
        $bundle = Join-Path $tempDir 'composio-windows-x64'
        if (-not (Test-Path -LiteralPath (Join-Path $bundle 'composio.exe') -PathType Leaf)) {
            throw 'The archive has no composio.exe. Refusing to install.'
        }

        # Windows cannot overwrite a running executable, but it can rename one. Move the current
        # composio.exe aside, then copy the bundle over the install directory. Everything else in
        # that directory (credentials, configuration) stays untouched.
        New-Item -ItemType Directory -Path $installDir -Force | Out-Null
        $exe = Join-Path $installDir 'composio.exe'
        $previousExe = "$exe.old"
        try {
            if (Test-Path -LiteralPath $previousExe) { Remove-Item -LiteralPath $previousExe -Force }
        } catch {
            throw "Could not remove $previousExe. Close other Composio processes and retry. $($_.Exception.Message)"
        }
        $hadExe = Test-Path -LiteralPath $exe
        if ($hadExe) { Move-Item -LiteralPath $exe -Destination $previousExe }
        try {
            Get-ChildItem -LiteralPath $bundle -Force | Copy-Item -Destination $installDir -Recurse -Force
        } catch {
            if ($hadExe) { Move-Item -LiteralPath $previousExe -Destination $exe -Force }
            throw
        }
        # Fails only while the previous executable is still running; the next install removes it.
        Remove-Item -LiteralPath $previousExe -Force -ErrorAction SilentlyContinue
    } finally {
        Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction SilentlyContinue
    }

    if ($env:COMPOSIO_INSTALL_SHELL -ne 'none') {
        $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
        if (($userPath -split ';') -notcontains $installDir) {
            [Environment]::SetEnvironmentVariable('Path', ((@($installDir, $userPath) | Where-Object { $_ }) -join ';'), 'User')
        }
        # Also update this session, so `composio` works without opening a new terminal.
        if (($env:Path -split ';') -notcontains $installDir) { $env:Path = "$installDir;$env:Path" }
    }

    Write-Host "Installed $tag in $installDir"
    Write-Host 'Windows support is experimental. Report problems at https://github.com/ComposioHQ/composio/issues'
    Write-Host 'Run "composio login" to connect your account.'
}
