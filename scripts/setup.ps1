param([switch]$PrepareOnly, [switch]$NoOpen)
$ErrorActionPreference = 'Stop'
$courtRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'runtime.ps1')
try {
    Write-Host 'Codex Court - local setup' -ForegroundColor Cyan
    Write-Host 'Your own Codex login and conversations stay on your computer.'
    $courtNode = Find-CourtNode $courtRoot
    if (-not $courtNode) { $courtNode = Install-CourtRuntime $courtRoot }
    Write-Host ('Runtime: ' + (& $courtNode --version))
    if (-not (Test-Path -LiteralPath (Join-Path $courtRoot 'dist/index.html'))) {
        $courtNpm = Join-Path (Split-Path -Parent $courtNode) 'npm.cmd'
        if (-not (Test-Path -LiteralPath $courtNpm)) {
            $courtNode = Install-CourtRuntime $courtRoot
            $courtNpm = Join-Path (Split-Path -Parent $courtNode) 'npm.cmd'
        }
        $courtPreviousPath = $env:Path
        Push-Location $courtRoot
        try {
            $env:Path = (Split-Path -Parent $courtNode) + ';' + $env:Path
            Write-Host 'Installing locked dependencies from npm...'
            & $courtNpm ci --no-audit --no-fund
            if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. Check your internet connection and rerun Start-Court.cmd.' }
            & $courtNpm run build
            if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
        } finally { Pop-Location; $env:Path = $courtPreviousPath }
    }
    if ($PrepareOnly) { Write-Host 'Setup verified. Ready to launch.'; exit 0 }
    & (Join-Path $PSScriptRoot 'start.ps1') -NoOpen:$NoOpen
    exit $LASTEXITCODE
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
