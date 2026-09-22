param([string]$Dotnet = 'dotnet')
$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
    & $Dotnet publish '.\Notifica.Agent\Notifica.Agent.csproj' -c Release -r win-x64 --self-contained true -o '.\artifacts\win-x64' -p:DebugType=None -p:DebugSymbols=false
    if ($LASTEXITCODE -ne 0) { throw 'Agent publish failed' }
    $result = Start-Process -FilePath '.\artifacts\win-x64\Notifica.Agent.exe' -ArgumentList '--self-test' -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput '.\artifacts\self-test.json' -RedirectStandardError '.\artifacts\self-test-errors.txt'
    if ($result.ExitCode -ne 0) { throw 'Agent self-test failed. See artifacts/self-test-errors.txt.' }
    Get-Content -LiteralPath '.\artifacts\self-test.json'
} finally { Pop-Location }
