param([ValidateSet('x64','arm64')][string]$Architecture = 'x64')
$ErrorActionPreference = 'Stop'
$courtRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'runtime.ps1')
$courtVersion = (Get-Content -Raw -LiteralPath (Join-Path $courtRoot 'package.json') | ConvertFrom-Json).version
$courtName = "codex-court-$courtVersion-win-$Architecture"
$courtOutput = Join-Path $courtRoot ".local/releases/$courtName"
if (Test-Path -LiteralPath $courtOutput) { throw "Output already exists: $courtOutput. Preserve or rename it before packaging again." }
if (-not (Test-Path -LiteralPath (Join-Path $courtRoot 'dist/index.html'))) { throw 'Run npm run build first.' }
$courtNode = Install-CourtRuntime -Root $courtRoot -Architecture $Architecture
New-Item -ItemType Directory -Path $courtOutput -Force | Out-Null
# Explicit publication allowlist: never copy the workspace or user data wholesale.
foreach ($courtItem in @('dist','server','shared','assets','docs','README.md','LICENSE','THIRD_PARTY_NOTICES.md','Start-Court.cmd','启动法庭.vbs','停止法庭服务.vbs')) {
    Copy-Item -LiteralPath (Join-Path $courtRoot $courtItem) -Destination $courtOutput -Recurse
}
New-Item -ItemType Directory -Path (Join-Path $courtOutput 'scripts'),(Join-Path $courtOutput 'runtime'),(Join-Path $courtOutput 'licenses') | Out-Null
foreach ($courtScript in @('runtime.ps1','setup.ps1','start.ps1','stop.ps1')) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $courtScript) -Destination (Join-Path $courtOutput 'scripts')
}
Copy-Item -LiteralPath $courtNode -Destination (Join-Path $courtOutput 'runtime/node.exe')
Copy-Item -LiteralPath (Join-Path (Split-Path -Parent $courtNode) 'LICENSE') -Destination (Join-Path $courtOutput 'runtime/LICENSE')
$courtLicenses = @()
foreach ($courtDependency in @('react','react-dom','scheduler','lucide-react','dompurify','marked')) {
    $courtDependencyRoot = Join-Path $courtRoot "node_modules/$courtDependency"
    $courtLicenseFiles = @(Get-ChildItem -LiteralPath $courtDependencyRoot -File | Where-Object { $_.Name -match '^(LICEN[SC]E|NOTICE)' })
    if (-not $courtLicenseFiles.Count) { throw "Missing license for $courtDependency" }
    $courtDependencyVersion = (Get-Content -Raw -LiteralPath (Join-Path $courtDependencyRoot 'package.json') | ConvertFrom-Json).version
    foreach ($courtLicense in $courtLicenseFiles) {
        $courtLicenses += "`n===== $courtDependency $courtDependencyVersion / $($courtLicense.Name) =====`n" + (Get-Content -Raw -LiteralPath $courtLicense.FullName)
    }
}
[IO.File]::WriteAllText((Join-Path $courtOutput 'licenses/frontend-dependencies.txt'), ($courtLicenses -join "`n"), [Text.UTF8Encoding]::new($false))
$courtZip = "$courtOutput.zip"
Compress-Archive -LiteralPath $courtOutput -DestinationPath $courtZip
$courtHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $courtZip).Hash.ToLowerInvariant()
[IO.File]::WriteAllText("$courtZip.sha256", "$courtHash  $courtName.zip`n", [Text.UTF8Encoding]::new($false))
Write-Output $courtZip
Write-Output "SHA256: $courtHash"
