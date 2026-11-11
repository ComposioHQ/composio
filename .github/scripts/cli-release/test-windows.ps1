# Checks a Windows x64 CLI archive on a real Windows machine: the documented installer
# one-liner, the native binary, companion modules, self-upgrade, and repair.
# A local server stands in for GitHub and serves install.ps1 plus the archive under test.
param(
    [Parameter(Mandatory)][string]$ArchivePath,
    [Parameter(Mandatory)][string]$ExpectedVersion
)
$ErrorActionPreference = 'Stop'
$ArchivePath = (Resolve-Path -LiteralPath $ArchivePath).Path
$testRoot = Join-Path ([IO.Path]::GetTempPath()) "composio windows $([Guid]::NewGuid())"
$envNames = @(
    'BUN_BE_BUN', 'COMPOSIO_CACHE_DIR', 'COMPOSIO_DISABLE_TELEMETRY', 'COMPOSIO_GITHUB_API_BASE_URL', 'COMPOSIO_INSTALL_DIR',
    'COMPOSIO_INSTALL_SHELL', 'COMPOSIO_INSTALL_VERSION', 'COMPOSIO_USER_API_KEY', 'COMPOSIO_WINDOWS_SMOKE_ARCHIVE',
    'COMPOSIO_WINDOWS_SMOKE_INSTALLER', 'COMPOSIO_WINDOWS_SMOKE_PORT', 'COMPOSIO_WINDOWS_SMOKE_SKILL', 'COMPOSIO_WINDOWS_SMOKE_TAG',
    'USERPROFILE'
)
$savedEnv = @{}
foreach ($name in $envNames) { $savedEnv[$name] = [Environment]::GetEnvironmentVariable($name) }
$savedUserPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$server = $null

function Assert([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
}

# Runs the documented one-liner in a fresh shell. COMPOSIO_INSTALL_* variables configure it.
function Invoke-Installer([string]$Shell = 'powershell', [string]$Then = '') {
    & $Shell -NoProfile -Command "irm $baseUrl/install.ps1 | iex; $Then"
}

function Invoke-Cli([string[]]$Arguments) {
    $output = & $binary @Arguments
    Assert ($LASTEXITCODE -eq 0) "CLI failed ($LASTEXITCODE): $Arguments"
    return ($output -join "`n").Trim()
}

function Get-Sha256([string]$Path) {
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
}

New-Item -ItemType Directory -Path $testRoot | Out-Null
try {
    # The compiled CLI doubles as a Bun runtime (BUN_BE_BUN), so it can serve its own release.
    # The first path segment of the API base URL selects a scenario:
    #   /stable   lists a stable release behind a newer beta, for the default (latest) install
    #   /corrupt  publishes a checksum that does not match the archive
    #   /skill    adds the CLI skill bundle to the release
    $source = Join-Path $testRoot 'source'
    Expand-Archive -LiteralPath $ArchivePath -DestinationPath $source
    $serverFile = Join-Path $testRoot 'release-server.mjs'
    $portFile = Join-Path $testRoot 'port.txt'
    @'
const archive = Bun.file(process.env.COMPOSIO_WINDOWS_SMOKE_ARCHIVE);
const hash = new Bun.CryptoHasher('sha256').update(await archive.arrayBuffer()).digest('hex');
const tag = process.env.COMPOSIO_WINDOWS_SMOKE_TAG;
const text = body => new Response(body, {headers: {'content-type': 'text/plain; charset=utf-8'}});
const server = Bun.serve({
  hostname: '127.0.0.1', port: 0,
  async fetch(request) {
    const {origin, pathname} = new URL(request.url);
    if (pathname === '/install.ps1') return text(await Bun.file(process.env.COMPOSIO_WINDOWS_SMOKE_INSTALLER).text());
    if (pathname === '/cli.zip') return new Response(archive);
    if (pathname === '/skill.zip') return new Response(Bun.file(process.env.COMPOSIO_WINDOWS_SMOKE_SKILL));
    if (pathname === '/checksums.txt') return text(`${hash}  composio-windows-x64.zip\n`);
    if (pathname === '/corrupt-checksums.txt') return text(`${'0'.repeat(64)}  composio-windows-x64.zip\n`);
    const release = (tagName, checksums = 'checksums.txt') => ({
      tag_name: tagName, name: tagName, draft: false, prerelease: tagName.includes('-beta.'),
      assets: [
        {name: 'composio-windows-x64.zip', size: archive.size, browser_download_url: `${origin}/cli.zip`},
        {name: 'checksums.txt', browser_download_url: `${origin}/${checksums}`}
      ]});
    if (pathname.startsWith('/corrupt/')) return Response.json(release(tag, 'corrupt-checksums.txt'));
    if (pathname.startsWith('/skill/')) {
      const withSkill = release(tag);
      withSkill.assets.push({name: 'composio-skill.zip', browser_download_url: `${origin}/skill.zip`});
      return Response.json(withSkill);
    }
    if (pathname.includes('/releases/tags/')) return Response.json(release(tag));
    if (pathname.startsWith('/stable/')) return Response.json([release('@composio/cli@9.9.9-beta.1'), release('@composio/cli@1.2.3')]);
    if (pathname.endsWith('/releases')) return Response.json([release(tag)]);
    return new Response('not found', {status: 404});
  }
});
await Bun.write(process.env.COMPOSIO_WINDOWS_SMOKE_PORT, String(server.port));
'@ | Set-Content -LiteralPath $serverFile
    $env:COMPOSIO_WINDOWS_SMOKE_ARCHIVE = $ArchivePath
    $env:COMPOSIO_WINDOWS_SMOKE_INSTALLER = (Resolve-Path -LiteralPath "$PSScriptRoot/../../../install.ps1").Path
    $env:COMPOSIO_WINDOWS_SMOKE_PORT = $portFile
    $skillSource = Join-Path $testRoot 'skill/composio-cli'
    New-Item -ItemType Directory -Path $skillSource -Force | Out-Null
    Set-Content -LiteralPath (Join-Path $skillSource 'SKILL.md') -Value '# fixture skill'
    $env:COMPOSIO_WINDOWS_SMOKE_SKILL = Join-Path $testRoot 'composio-skill.zip'
    Compress-Archive -Path $skillSource -DestinationPath $env:COMPOSIO_WINDOWS_SMOKE_SKILL
    $env:COMPOSIO_WINDOWS_SMOKE_TAG = "@composio/cli@$ExpectedVersion"
    $env:BUN_BE_BUN = '1'
    $server = Start-Process -FilePath (Join-Path $source 'composio-windows-x64/composio.exe') -ArgumentList @('"' + $serverFile + '"') -PassThru -RedirectStandardError (Join-Path $testRoot 'server.err')
    Remove-Item Env:BUN_BE_BUN
    for ($attempt = 0; $attempt -lt 100 -and -not (Test-Path -LiteralPath $portFile); $attempt++) {
        if ($server.HasExited) { throw "Release fixture server failed: $(Get-Content -LiteralPath (Join-Path $testRoot 'server.err') -Raw)" }
        Start-Sleep -Milliseconds 100
    }
    Assert (Test-Path -LiteralPath $portFile) 'Release fixture server did not start.'
    $baseUrl = "http://127.0.0.1:$(Get-Content -LiteralPath $portFile)"

    $installDir = Join-Path $testRoot 'installed CLI'
    $binary = Join-Path $installDir 'composio.exe'
    $env:COMPOSIO_GITHUB_API_BASE_URL = $baseUrl
    $env:COMPOSIO_CACHE_DIR = Join-Path $testRoot 'isolated config'
    $env:COMPOSIO_DISABLE_TELEMETRY = '1'
    $env:COMPOSIO_USER_API_KEY = 'test-dummy-api-key-for-ci'
    $env:COMPOSIO_INSTALL_DIR = $installDir
    $env:COMPOSIO_INSTALL_VERSION = $ExpectedVersion
    $env:COMPOSIO_INSTALL_SHELL = 'none'

    # Install a pinned version from Windows PowerShell 5.1, into a path with spaces.
    Invoke-Installer | Out-Host
    Assert ($LASTEXITCODE -eq 0) 'Windows PowerShell installation failed.'
    Assert ((Invoke-Cli @('--version')) -eq $ExpectedVersion) 'Unexpected baked CLI version.'
    Invoke-Cli @('--help') | Out-Host
    Assert ((Invoke-Cli @('run', 'console.log("windows-inline-ok")')) -eq 'windows-inline-ok') 'Inline companion execution failed.'
    $scriptFile = Join-Path $testRoot 'script with spaces.ts'
    Set-Content -LiteralPath $scriptFile -Value 'console.log("windows-file-ok");'
    Assert ((Invoke-Cli @('run', '--file', $scriptFile)) -eq 'windows-file-ok') 'File companion execution failed.'
    $expectedBinaryHash = Get-Sha256 $binary

    # Reinstalling keeps user data. 32-bit PowerShell on x64 Windows is a supported host.
    $userData = Join-Path $installDir 'user_data.json'
    Set-Content -LiteralPath $userData -Value 'preserve credentials'
    Invoke-Installer -Shell (Join-Path $env:WINDIR 'SysWOW64/WindowsPowerShell/v1.0/powershell.exe') | Out-Host
    Assert ($LASTEXITCODE -eq 0) '32-bit PowerShell reinstallation failed.'
    Assert ((Get-Content -LiteralPath $userData) -eq 'preserve credentials') 'Reinstallation did not preserve user data.'
    Assert ((Get-Sha256 $binary) -eq $expectedBinaryHash) 'Reinstallation did not restore the executable.'

    # A checksum mismatch aborts before the installation is touched.
    Set-Content -LiteralPath $binary -Value 'installed before the corrupt download'
    $env:COMPOSIO_GITHUB_API_BASE_URL = "$baseUrl/corrupt"
    $output = Invoke-Installer 2>&1 | Out-String
    Assert ($LASTEXITCODE -ne 0 -and $output -like '*Checksum mismatch*') "Expected a checksum mismatch, got: $output"
    Assert ((Get-Content -LiteralPath $binary) -eq 'installed before the corrupt download') 'A corrupt download modified the executable.'

    # With no version, the installer picks the latest stable release and puts it on PATH,
    # both for the current session and, exactly once, for the user.
    $latestDir = Join-Path $testRoot 'latest install'
    $env:COMPOSIO_GITHUB_API_BASE_URL = "$baseUrl/stable"
    $env:COMPOSIO_INSTALL_DIR = $latestDir
    Remove-Item Env:COMPOSIO_INSTALL_VERSION, Env:COMPOSIO_INSTALL_SHELL
    foreach ($attempt in 1..2) {
        $output = Invoke-Installer -Then 'composio --version'
        Assert ($LASTEXITCODE -eq 0) "Default installation failed: $output"
        Assert (($output -join "`n") -like '*Installed @composio/cli@1.2.3*') 'The installer did not pick the latest stable release.'
        Assert ($output[-1].Trim() -eq $ExpectedVersion) 'composio was not on PATH after installation.'
    }
    $userPathEntries = [Environment]::GetEnvironmentVariable('Path', 'User') -split ';'
    Assert (@($userPathEntries | Where-Object { $_ -eq $latestDir }).Count -eq 1) 'The User PATH entry is missing or duplicated.'

    $env:COMPOSIO_GITHUB_API_BASE_URL = $baseUrl
    $env:COMPOSIO_INSTALL_DIR = $installDir
    $env:COMPOSIO_INSTALL_VERSION = $ExpectedVersion
    $env:COMPOSIO_INSTALL_SHELL = 'none'
    Invoke-Installer | Out-Host
    Assert ($LASTEXITCODE -eq 0) 'Reinstallation after a corrupt download failed.'

    # `composio upgrade` resolves the Windows asset, verifies it, and replaces the executable
    # that is currently running, keeping the previous one as composio.exe.old.
    foreach ($upgrade in 1..2) {
        Invoke-Cli @('upgrade', $ExpectedVersion) | Out-Host
        Assert ((Invoke-Cli @('--version')) -eq $ExpectedVersion) "CLI failed after upgrade $upgrade."
        Assert ((Get-Sha256 "$binary.old") -eq $expectedBinaryHash) "Upgrade $upgrade did not replace the running executable."
        if ($upgrade -eq 1) {
            # The replaced executable stays locked until its process has fully exited.
            for ($attempt = 0; $attempt -lt 50; $attempt++) {
                try { Set-Content -LiteralPath "$binary.old" -Value 'stale backup'; break } catch {
                    if ($attempt -eq 0) {
                        Write-Host 'composio.exe.old is locked. Processes running from the install directory:'
                        Get-Process | Where-Object { $_.Path -like "$installDir*" } | Format-Table Id, ProcessName, StartTime, Path | Out-Host
                    }
                    Start-Sleep -Milliseconds 200
                }
            }
            Write-Host "composio.exe.old became writable after $attempt retries."
        }
    }

    # While another process holds composio.exe.old, neither upgrade path may modify the installation.
    $companionPath = Join-Path $installDir 'run-helpers-runtime.mjs'
    $tagPath = Join-Path $installDir 'release-tag.txt'
    $originalCompanion = [IO.File]::ReadAllText($companionPath)
    $originalTag = [IO.File]::ReadAllText($tagPath)
    $markerCompanion = $originalCompanion + "`n// retained while backup is locked`n"
    $markerTag = '@composio/cli@0.0.0-beta.999999'
    [IO.File]::WriteAllText($companionPath, $markerCompanion)
    [IO.File]::WriteAllText($tagPath, $markerTag)
    $lockedBackup = [IO.File]::Open("$binary.old", 'Open', 'Read', 'Read')
    try {
        foreach ($action in @({ & $binary upgrade $ExpectedVersion }, { Invoke-Installer })) {
            & $action 2>&1 | Out-Host
            Assert ($LASTEXITCODE -ne 0) 'Expected a locked backup to block replacement.'
            Assert ([IO.File]::ReadAllText($companionPath) -eq $markerCompanion) 'A blocked upgrade modified the support files.'
            Assert ([IO.File]::ReadAllText($tagPath) -eq $markerTag) 'A blocked upgrade modified the release metadata.'
            Assert ((Get-Sha256 $binary) -eq $expectedBinaryHash) 'A blocked upgrade modified the executable.'
        }
    } finally {
        $lockedBackup.Dispose()
        [IO.File]::WriteAllText($companionPath, $originalCompanion)
        [IO.File]::WriteAllText($tagPath, $originalTag)
    }

    # A missing companion module is downloaded again on demand.
    $companion = Join-Path $installDir 'services/generation-runtime.mjs'
    Remove-Item -LiteralPath $companion
    Assert ((Invoke-Cli @('run', 'console.log("windows-repair-ok")')) -eq 'windows-repair-ok') 'Companion repair failed.'
    Assert (Test-Path -LiteralPath $companion) 'Companion was not restored.'

    # The CLI skill is linked into the agent's directory with a junction, which needs no
    # elevated rights. Installing twice must replace the link without emptying its target.
    $env:USERPROFILE = Join-Path $testRoot 'home'
    New-Item -ItemType Directory -Path $env:USERPROFILE | Out-Null
    $env:COMPOSIO_GITHUB_API_BASE_URL = "$baseUrl/skill"
    $linkedSkill = Join-Path $env:USERPROFILE '.claude/skills/composio-cli'
    foreach ($attempt in 1..2) {
        Invoke-Cli @('setup', 'skill', 'claude') | Out-Host
        Assert ((Get-Item -LiteralPath $linkedSkill).LinkType -eq 'Junction') 'The skill was not linked with a junction.'
        Assert (Test-Path -LiteralPath (Join-Path $linkedSkill 'SKILL.md')) 'The linked skill is empty.'
    }

    # Shell setup has nothing to do on Windows and says so.
    $output = & $binary install 2>&1 | Out-String
    Assert ($LASTEXITCODE -ne 0 -and $output -like '*Windows*') "Expected composio install to explain itself, got: $output"
    Write-Host 'Windows installation, run, repeated upgrade, repair, and skill setup passed.'
} finally {
    if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id -Force; $server.WaitForExit() }
    foreach ($name in $envNames) { [Environment]::SetEnvironmentVariable($name, $savedEnv[$name]) }
    [Environment]::SetEnvironmentVariable('Path', $savedUserPath, 'User')
    Remove-Item -LiteralPath $testRoot -Recurse -Force
}
