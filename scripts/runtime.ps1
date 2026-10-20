# Runtime discovery and optional verified local installation. No system PATH changes.
$ErrorActionPreference = 'Stop'
function Find-CourtNode([string]$Root) {
    $courtCandidates = @((Join-Path $Root 'runtime/node.exe'))
    $courtConfig = Get-Content -LiteralPath (Join-Path $Root 'shared/runtime.json') -Raw | ConvertFrom-Json
    $courtArch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') { 'arm64' } else { 'x64' }
    $courtCandidates += Join-Path $Root ('.local/runtime/node-v' + $courtConfig.version + '-win-' + $courtArch + '/node.exe')
    $courtInstalledNode = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($courtInstalledNode) { $courtCandidates += $courtInstalledNode.Source }
    foreach ($courtCandidate in $courtCandidates) {
        if (Test-Path -LiteralPath $courtCandidate -PathType Leaf) {
            try {
                $courtVersion = & $courtCandidate --version 2>$null
                if ($LASTEXITCODE -eq 0 -and $courtVersion -match '^v(\d+)\.' -and [int]$Matches[1] -ge 22) { return $courtCandidate }
            } catch { }
        }
    }
    return $null
}
function Install-CourtRuntime([string]$Root, [string]$Architecture = '') {
    if (-not $Architecture) { $Architecture = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') { 'arm64' } else { 'x64' } }
    if ($Architecture -notin @('x64', 'arm64')) { throw 'Unsupported Windows architecture.' }
    $courtConfig = Get-Content -LiteralPath (Join-Path $Root 'shared/runtime.json') -Raw | ConvertFrom-Json
    $courtAsset = $courtConfig.files.$Architecture
    $courtCache = Join-Path $Root '.local/runtime'
    $courtArchive = Join-Path $courtCache $courtAsset.file
    $courtExtracted = Join-Path $courtCache ([IO.Path]::GetFileNameWithoutExtension($courtAsset.file))
    $courtExe = Join-Path $courtExtracted 'node.exe'
    New-Item -ItemType Directory -Force -Path $courtCache | Out-Null
    if (-not (Test-Path -LiteralPath $courtArchive) -or (Get-FileHash -LiteralPath $courtArchive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $courtAsset.sha256) {
        Write-Host ('Downloading portable Node.js ' + $courtConfig.version + ' from nodejs.org...')
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -UseBasicParsing -Uri ($courtConfig.baseUrl + '/' + $courtAsset.file) -OutFile $courtArchive
    }
    if ((Get-FileHash -LiteralPath $courtArchive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $courtAsset.sha256) { throw 'Node.js SHA-256 verification failed. Runtime was not executed.' }
    # Extract only the checksum-verified official archive into this application's private runtime cache.
    Expand-Archive -LiteralPath $courtArchive -DestinationPath $courtCache -Force
    if (-not (Test-Path -LiteralPath $courtExe)) { throw 'Portable Node.js installation did not produce node.exe.' }
    return $courtExe
}
