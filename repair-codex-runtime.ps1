param(
  [switch]$AddDefenderExclusions
)

$ErrorActionPreference = "Stop"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"

function Rename-IfExists {
  param([Parameter(Mandatory = $true)][string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    Write-Host "MISSING  $Path"
    return
  }

  $parent = Split-Path -Parent $Path
  $leaf = Split-Path -Leaf $Path
  $targetLeaf = "$leaf.bak-$stamp"
  $target = Join-Path $parent $targetLeaf

  Rename-Item -LiteralPath $Path -NewName $targetLeaf
  Write-Host "RENAMED  $Path -> $target"
}

Write-Host "Close Codex before running this script. If Codex is open, stop here with Ctrl+C."
Start-Sleep -Seconds 3

if ($AddDefenderExclusions) {
  Write-Host "Adding Microsoft Defender exclusions for Codex runtime folders..."
  Add-MpPreference -ExclusionPath "C:\Users\gonza\AppData\Local\OpenAI\Codex"
  Add-MpPreference -ExclusionPath "C:\Users\gonza\.codex"
}

$paths = @(
  "C:\Users\gonza\AppData\Local\OpenAI\Codex\bin",
  "C:\Users\gonza\.codex\.sandbox-bin",
  "C:\Users\gonza\.codex\plugins\cache\openai-bundled\browser",
  "C:\Users\gonza\.codex\plugins\cache\openai-bundled\chrome",
  "C:\Users\gonza\.codex\plugins\cache\openai-bundled\computer-use"
)

foreach ($path in $paths) {
  Rename-IfExists -Path $path
}

Write-Host ""
Write-Host "Done. Reopen Codex and let it rebuild the runtime/plugin cache."
