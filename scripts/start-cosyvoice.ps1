param(
    [Parameter(Mandatory=$true)][string]$Repository,
    [Parameter(Mandatory=$true)][string]$ModelDirectory,
    [string]$Python = 'python',
    [ValidateRange(1024,65535)][int]$Port = 50000
)
$ErrorActionPreference = 'Stop'
$courtRepository = (Resolve-Path -LiteralPath $Repository).Path
$courtModel = (Resolve-Path -LiteralPath $ModelDirectory).Path
if (-not (Test-Path -LiteralPath (Join-Path $courtRepository 'cosyvoice') -PathType Container)) { throw 'Select the installed official CosyVoice repository.' }
if (-not (Get-Command $Python -ErrorAction SilentlyContinue)) { throw 'Select the Python executable inside your installed CosyVoice environment.' }
& $Python (Join-Path $PSScriptRoot 'cosyvoice-local.py') --repository $courtRepository --model-dir $courtModel --port $Port
exit $LASTEXITCODE
