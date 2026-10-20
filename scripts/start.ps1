param([switch]$NoOpen)
$ErrorActionPreference = 'Stop'
$courtRoot = Split-Path -Parent $PSScriptRoot
$courtPort = 4317
$courtUrl = "http://127.0.0.1:$courtPort"
$courtLocal = Join-Path $courtRoot '.local'
New-Item -ItemType Directory -Path $courtLocal -Force | Out-Null
. (Join-Path $PSScriptRoot 'runtime.ps1')

function Get-CourtHealth {
    try {
        $reply = Invoke-RestMethod -Uri "$courtUrl/api/health" -TimeoutSec 2
        return ($reply.app -eq 'codex-court')
    } catch { return $false }
}

try {
    if (-not (Test-Path -LiteralPath (Join-Path $courtRoot 'dist/index.html'))) {
        throw 'Run Start-Court.cmd once to install and build this client automatically.'
    }
    if (-not (Get-CourtHealth)) {
        $courtNode = Find-CourtNode $courtRoot
        if (-not $courtNode) { throw 'Run Start-Court.cmd once to set up the portable runtime automatically.' }
        $courtServer = Join-Path $courtRoot 'server/index.mjs'
        $env:PORT = [string]$courtPort
        $courtProcess = Start-Process -FilePath $courtNode -ArgumentList @(('"' + $courtServer + '"')) -WorkingDirectory $courtRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $courtLocal 'server.stdout.log') -RedirectStandardError (Join-Path $courtLocal 'server.stderr.log')
        $courtProcess.Id | Set-Content -LiteralPath (Join-Path $courtLocal 'server.pid')
        $courtReady = $false
        for ($courtAttempt = 0; $courtAttempt -lt 40; $courtAttempt++) {
            if (Get-CourtHealth) { $courtReady = $true; break }
            if ($courtProcess.HasExited) { break }
            Start-Sleep -Milliseconds 250
        }
        if (-not $courtReady) { throw 'Codex Court could not start. Check .local/server.stderr.log, or whether port 4317 is already in use.' }
    }
    if ($NoOpen) { Write-Output $courtUrl; exit 0 }
    $courtBrowsers = @(
        (Join-Path ${env:ProgramFiles(x86)} 'Microsoft/Edge/Application/msedge.exe'),
        (Join-Path $env:ProgramFiles 'Microsoft/Edge/Application/msedge.exe'),
        (Join-Path $env:ProgramFiles 'Google/Chrome/Application/chrome.exe')
    )
    $courtBrowser = $courtBrowsers | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if (-not $courtBrowser) { throw 'Install Microsoft Edge or Google Chrome to open the standalone app window.' }
    $courtProfile = Join-Path $courtLocal 'app-browser-profile'
    Start-Process -FilePath $courtBrowser -ArgumentList @("--app=$courtUrl", ('--user-data-dir="' + $courtProfile + '"'), '--no-first-run', '--no-default-browser-check', '--window-size=1512,1000') -WindowStyle Normal
} catch {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Codex Court', 'OK', 'Error') | Out-Null
    exit 1
}
