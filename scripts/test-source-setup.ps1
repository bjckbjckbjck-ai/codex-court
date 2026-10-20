$ErrorActionPreference = 'Stop'
$courtRoot = Split-Path -Parent $PSScriptRoot
$courtTemp = Join-Path ([IO.Path]::GetTempPath()) ('court-source-test-' + [guid]::NewGuid().ToString('N'))
$courtCopy = Join-Path $courtTemp 'Court Client'
$courtOldPath = $env:Path
New-Item -ItemType Directory -Path $courtCopy -Force | Out-Null
try {
    foreach ($courtItem in @('package.json','package-lock.json','vite.config.js','index.html','src','public','shared','scripts','server','assets','Start-Court.cmd')) {
        Copy-Item -LiteralPath (Join-Path $courtRoot $courtItem) -Destination $courtCopy -Recurse
    }
    # Exercise missing system Node without downloading the same verified archive again.
    $courtRuntimeCache = Join-Path $courtCopy '.local/runtime'
    New-Item -ItemType Directory -Path $courtRuntimeCache -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $courtRoot '.local/runtime/node-v24.22.0-win-x64.zip') -Destination $courtRuntimeCache
    $env:Path = "$env:SystemRoot\System32;$env:SystemRoot;$env:SystemRoot\System32\WindowsPowerShell\v1.0"
    & "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File (Join-Path $courtCopy 'scripts/setup.ps1') -PrepareOnly
    if ($LASTEXITCODE -ne 0) { throw 'Clean source setup failed.' }
    if (-not (Test-Path -LiteralPath (Join-Path $courtCopy 'dist/index.html'))) { throw 'Source setup did not build the frontend.' }
    Write-Output 'PASS: clean source setup without system Node, using a path containing spaces.'
} finally {
    $env:Path = $courtOldPath
    $courtResolvedTemp = [IO.Path]::GetFullPath($courtTemp)
    $courtAllowedParent = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
    if (-not $courtResolvedTemp.StartsWith($courtAllowedParent,[StringComparison]::OrdinalIgnoreCase) -or (Split-Path -Leaf $courtResolvedTemp) -notlike 'court-source-test-*') { throw 'Refusing cleanup outside the temporary test directory.' }
    Remove-Item -LiteralPath $courtResolvedTemp -Recurse -Force
}
