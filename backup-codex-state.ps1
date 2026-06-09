param(
  [string]$DestinationRoot = "C:\Users\gonza\Desktop\NOTIFICA IA - WEB - (2)\codex-backups"
)

$ErrorActionPreference = "Stop"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = Join-Path $DestinationRoot "codex-state-$stamp"
$zipPath = "$backupDir.zip"

New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

$items = @(
  "C:\Users\gonza\.codex\sessions",
  "C:\Users\gonza\.codex\config.toml",
  "C:\Users\gonza\.codex\plugins",
  "C:\Users\gonza\.codex\skills",
  "C:\Users\gonza\Desktop\NOTIFICA IA - WEB - (2)\AGENTS.md",
  "C:\Users\gonza\Desktop\NOTIFICA IA - WEB - (2)\CODEX_REINSTALL_HANDOFF.md",
  "C:\Users\gonza\Desktop\NOTIFICA IA - WEB - (2)\package.json",
  "C:\Users\gonza\Desktop\NOTIFICA IA - WEB - (2)\prisma\schema.prisma"
)

foreach ($item in $items) {
  if (Test-Path -LiteralPath $item) {
    $leaf = Split-Path -Leaf $item
    $target = Join-Path $backupDir $leaf
    Copy-Item -LiteralPath $item -Destination $target -Recurse -Force
    Write-Host "COPIED  $item"
  } else {
    Write-Host "MISSING $item"
  }
}

Compress-Archive -LiteralPath $backupDir -DestinationPath $zipPath -Force
Write-Host ""
Write-Host "Backup created:"
Write-Host $zipPath
