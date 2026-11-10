param(
    [Parameter(Mandatory)][string]$ArchivePath,
    [Parameter(Mandatory)][string]$ExpectedVersion
)
$ErrorActionPreference = 'Stop'
$ArchivePath = (Resolve-Path -LiteralPath $ArchivePath).Path
$testRoot = Join-Path ([IO.Path]::GetTempPath()) "composio windows $([Guid]::NewGuid())"
$names = @('BUN_BE_BUN', 'COMPOSIO_GITHUB_API_BASE_URL', 'COMPOSIO_CACHE_DIR', 'COMPOSIO_DISABLE_TELEMETRY', 'COMPOSIO_USER_API_KEY', 'COMPOSIO_WINDOWS_SMOKE_ARCHIVE', 'COMPOSIO_WINDOWS_SMOKE_PORT', 'COMPOSIO_WINDOWS_SMOKE_TAG')
$saved = @{}
foreach ($name in $names) { $saved[$name] = [Environment]::GetEnvironmentVariable($name) }
$server = $null
New-Item -ItemType Directory -Path $testRoot | Out-Null
try {
    $source = Join-Path $testRoot 'source'
    Expand-Archive -LiteralPath $ArchivePath -DestinationPath $source
    $sourceBinary = Join-Path $source 'composio-windows-x64/composio.exe'
    $serverFile = Join-Path $testRoot 'release-server.mjs'
    $portFile = Join-Path $testRoot 'port.txt'
    @'
const archive = Bun.file(process.env.COMPOSIO_WINDOWS_SMOKE_ARCHIVE);
const hash = new Bun.CryptoHasher('sha256').update(await archive.arrayBuffer()).digest('hex');
const tag = process.env.COMPOSIO_WINDOWS_SMOKE_TAG;
const server = Bun.serve({
  hostname: '127.0.0.1', port: 0,
  fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/cli.zip') return new Response(archive);
    if (url.pathname === '/checksums.txt') return new Response(`${hash}  composio-windows-x64.zip\n`);
    const release = {tag_name: tag, name: tag, draft: false, prerelease: tag.includes('-beta.'),
      assets: [
        {name: 'composio-windows-x64.zip', size: archive.size, browser_download_url: `${url.origin}/cli.zip`},
        {name: 'checksums.txt', browser_download_url: `${url.origin}/checksums.txt`}
      ]};
    if (url.pathname.includes('/releases/tags/')) return Response.json(release);
    if (url.pathname.endsWith('/releases')) return Response.json([release]);
    return new Response('not found', {status: 404});
  }
});
await Bun.write(process.env.COMPOSIO_WINDOWS_SMOKE_PORT, String(server.port));
'@ | Set-Content -LiteralPath $serverFile
    $env:COMPOSIO_WINDOWS_SMOKE_ARCHIVE = $ArchivePath
    $env:COMPOSIO_WINDOWS_SMOKE_PORT = $portFile
    $env:COMPOSIO_WINDOWS_SMOKE_TAG = "@composio/cli@$ExpectedVersion"
    $env:BUN_BE_BUN = '1'
    $server = Start-Process -FilePath $sourceBinary -ArgumentList @('"' + $serverFile + '"') -PassThru -RedirectStandardError (Join-Path $testRoot 'server.err')
    Remove-Item Env:BUN_BE_BUN
    for ($attempt = 0; $attempt -lt 100 -and -not (Test-Path -LiteralPath $portFile); $attempt++) {
        if ($server.HasExited) { throw "Release fixture server failed: $(Get-Content -LiteralPath (Join-Path $testRoot 'server.err') -Raw)" }
        Start-Sleep -Milliseconds 100
    }
    if (-not (Test-Path -LiteralPath $portFile)) { throw 'Release fixture server did not start.' }
    $env:COMPOSIO_GITHUB_API_BASE_URL = "http://127.0.0.1:$(Get-Content -LiteralPath $portFile)"
    $env:COMPOSIO_CACHE_DIR = Join-Path $testRoot 'isolated config'
    $env:COMPOSIO_DISABLE_TELEMETRY = '1'
    $env:COMPOSIO_USER_API_KEY = 'test-dummy-api-key-for-ci'
    $installDir = Join-Path $testRoot 'installed CLI'
    & powershell -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot/../../../install.ps1" -Version $ExpectedVersion -InstallDir $installDir -NoPath
    if ($LASTEXITCODE -ne 0) { throw 'Windows PowerShell installation failed.' }
    $binary = Join-Path $installDir 'composio.exe'
    function Invoke-Cli([string[]]$Arguments) {
        $output = & $binary @Arguments
        if ($LASTEXITCODE -ne 0) { throw "CLI failed ($LASTEXITCODE): $Arguments" }
        return ($output -join "`n").Trim()
    }
    if ((Invoke-Cli @('--version')) -ne $ExpectedVersion) { throw 'Unexpected baked CLI version.' }
    Invoke-Cli @('--help') | Out-Host
    if ((Invoke-Cli @('run', 'console.log("windows-inline-ok")')) -ne 'windows-inline-ok') { throw 'Inline companion execution failed.' }
    $scriptFile = Join-Path $testRoot 'script with spaces.ts'
    Set-Content -LiteralPath $scriptFile -Value 'console.log("windows-file-ok");'
    if ((Invoke-Cli @('run', '--file', $scriptFile)) -ne 'windows-file-ok') { throw 'File companion execution failed.' }
    # HTTP fixture exercises Windows asset resolution, checksums, .exe extraction,
    # and replacement of the executable that is currently running.
    $expectedBinaryHash = (Get-FileHash -LiteralPath $binary -Algorithm SHA256).Hash
    for ($upgrade = 1; $upgrade -le 2; $upgrade++) {
        Invoke-Cli @('upgrade', $ExpectedVersion) | Out-Host
        if ((Invoke-Cli @('--version')) -ne $ExpectedVersion) { throw "CLI failed after upgrade $upgrade." }
        if ((Get-FileHash -LiteralPath "$binary.old" -Algorithm SHA256).Hash -ne $expectedBinaryHash) { throw "Upgrade $upgrade did not replace the running executable." }
        if ($upgrade -eq 1) { Set-Content -LiteralPath "$binary.old" -Value 'stale backup' }
    }
    $companionPath = Join-Path $installDir 'run-helpers-runtime.mjs'
    $tagPath = Join-Path $installDir 'release-tag.txt'
    $originalCompanion = [IO.File]::ReadAllText($companionPath)
    $originalTag = [IO.File]::ReadAllText($tagPath)
    $markerCompanion = $originalCompanion + "`n// retained while backup is locked`n"
    [IO.File]::WriteAllText($companionPath, $markerCompanion)
    [IO.File]::WriteAllText($tagPath, '@composio/cli@0.0.0-beta.999999')
    $lockedBackup = [IO.File]::Open("$binary.old", 'Open', 'Read', 'Read')
    try {
        function Expect-BlockedUpgrade([scriptblock]$Action) {
            $PSNativeCommandUseErrorActionPreference = $false
            & $Action 2>&1 | Out-Host
            if ($LASTEXITCODE -eq 0) { throw 'Expected a locked backup to block replacement.' }
            if ([IO.File]::ReadAllText($companionPath) -ne $markerCompanion -or [IO.File]::ReadAllText($tagPath) -ne '@composio/cli@0.0.0-beta.999999') {
                throw 'A blocked upgrade modified the installed support files or metadata.'
            }
            if ((Get-FileHash -LiteralPath $binary -Algorithm SHA256).Hash -ne $expectedBinaryHash) { throw 'A blocked upgrade modified the executable.' }
        }
        Expect-BlockedUpgrade { & $binary upgrade $ExpectedVersion }
        Expect-BlockedUpgrade { & powershell -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot/../../../install.ps1" -Version $ExpectedVersion -InstallDir $installDir -NoPath }
    } finally {
        $lockedBackup.Dispose()
        [IO.File]::WriteAllText($companionPath, $originalCompanion)
        [IO.File]::WriteAllText($tagPath, $originalTag)
    }
    Remove-Item -LiteralPath (Join-Path $installDir 'services/generation-runtime.mjs')
    if ((Invoke-Cli @('run', 'console.log("windows-repair-ok")')) -ne 'windows-repair-ok') { throw 'Companion repair failed.' }
    if (-not (Test-Path -LiteralPath (Join-Path $installDir 'services/generation-runtime.mjs'))) { throw 'Companion was not restored.' }
    Write-Host 'Windows archive installation, run, repeated upgrade, and repair passed.'
} finally {
    if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id -Force; $server.WaitForExit() }
    foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $saved[$name]) }
    Remove-Item -LiteralPath $testRoot -Recurse -Force
}
