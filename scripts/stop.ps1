$ErrorActionPreference = 'Stop'
$courtUrl = 'http://127.0.0.1:4317'
try {
    $courtHealth = Invoke-RestMethod -Uri "$courtUrl/api/health" -TimeoutSec 2
    if ($courtHealth.app -ne 'codex-court') { throw 'This port is not running Codex Court.' }
    $courtSession = Invoke-RestMethod -Uri "$courtUrl/api/bootstrap" -TimeoutSec 2
    Invoke-RestMethod -Uri "$courtUrl/api/shutdown" -Method Post -Headers @{ 'X-Court-Token' = $courtSession.token } -ContentType 'application/json' -Body '{}' -TimeoutSec 5 | Out-Null
    Write-Output 'Codex Court server stopped. The official Codex app and your other browsers were not touched.'
} catch {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Codex Court', 'OK', 'Information') | Out-Null
    exit 1
}
