#Requires -Version 7.0
param(
    [string]$CertificateThumbprint,
    [string]$TimestampUrl,
    [string]$SignTool,
    [Parameter(Mandatory)][string]$JdkArchive,
    [Parameter(Mandatory)][string]$DssArchive,
    [Parameter(Mandatory)][string]$Output,
    [string]$Dotnet = 'dotnet',
    [ValidateSet('pilot','broad')][string]$Ring='pilot',
    [string[]]$Computers=@(),
    [string[]]$FromVersions=@(),
    [ValidateSet('upgrade','rollback')][string]$Kind='upgrade',
    [string]$MinimumVersion='0.11.0',
    [string]$AcceptanceFile,
    [switch]$PrepareOnly
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'ReleaseTools.psm1') -Force
$publisher=''
if (-not $PrepareOnly) {
if (-not $CertificateThumbprint -or -not $TimestampUrl -or -not $SignTool) { throw 'RELEASE_SIGNING_CONFIGURATION_REQUIRED' }
$certificate = Get-Item -LiteralPath ('Cert:\CurrentUser\My\'+$CertificateThumbprint)
$usages=@($certificate.Extensions | Where-Object { $_.Oid.Value -eq '2.5.29.37' } | ForEach-Object { $_.EnhancedKeyUsages | ForEach-Object { $_.Value } })
if (-not $certificate.HasPrivateKey -or $certificate.NotAfter -le (Get-Date) -or
    '1.3.6.1.5.5.7.3.3' -notin $usages) { throw 'CODE_SIGNING_CERTIFICATE_REQUIRED' }
$publisher=Get-CertificateHash $certificate
$timestamp=[Uri]$TimestampUrl
if ($timestamp.Scheme -ne 'https' -or $timestamp.UserInfo) { throw 'HTTPS_TIMESTAMP_REQUIRED' }
}
if ($Ring -eq 'pilot' -and $Computers.Count -eq 0) { throw 'PILOT_COMPUTERS_REQUIRED' }
if (@($Computers + $FromVersions | Where-Object { $_ -cnotmatch '^[A-Za-z0-9._-]{1,80}$' }).Count) { throw 'INVALID_TARGET' }
if ($MinimumVersion -cnotmatch '^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$') { throw 'INVALID_MINIMUM_VERSION' }
if ((& $Dotnet --version).Trim() -cne '10.0.401') { throw 'PINNED_SDK_REQUIRED' }
$acceptanceHash=''
if ($Ring -eq 'broad') {
    if (-not $AcceptanceFile) { throw 'OPERATOR_ACCEPTANCE_REQUIRED' }
    & (Join-Path $PSScriptRoot 'verify-pilot.ps1') -Evidence $AcceptanceFile
    if (-not $?) { throw 'PILOT_NOT_ACCEPTED' }
    $acceptanceHash=(Get-FileHash -LiteralPath $AcceptanceFile -Algorithm SHA256).Hash.ToLowerInvariant()
}
foreach ($archive in @(@($JdkArchive,'192441a9d27da813bada974bb88b4cf64d37a9589ed37f204374d411ca5ce07f'),
    @($DssArchive,'41574211c00b4f7b97c672760fa9f58749d3828b869c7f0dfcce82cddc66e349'))) {
    if ((Get-FileHash -LiteralPath $archive[0] -Algorithm SHA256).Hash.ToLowerInvariant() -cne $archive[1]) { throw 'DEPENDENCY_CHECKSUM_MISMATCH' }
}
$Output=Assert-LocalPath $Output
if (Test-Path -LiteralPath $Output) { throw 'OUTPUT_MUST_BE_NEW' }
New-Item -ItemType Directory -Path $Output | Out-Null
$work=Join-Path $Output 'build'; New-Item -ItemType Directory -Path $work | Out-Null
$payload=Join-Path $work 'payload'; New-Item -ItemType Directory -Path $payload | Out-Null
Expand-Archive -LiteralPath $JdkArchive -DestinationPath (Join-Path $work 'jdk')
Expand-Archive -LiteralPath $DssArchive -DestinationPath (Join-Path $work 'dss')
$jdks=@(Get-ChildItem (Join-Path $work 'jdk') -Directory)
$jars=@(Get-ChildItem (Join-Path $work 'dss') -Filter 'dss-pades-6.5.jar' -File -Recurse)
if ($jdks.Count -ne 1 -or $jars.Count -ne 1) { throw 'DEPENDENCY_LAYOUT_INVALID' }
$jdk=$jdks[0].FullName; $libraries=$jars[0].DirectoryName
Copy-Item -LiteralPath $jdk -Destination (Join-Path $payload 'java') -Recurse
New-Item -ItemType Directory -Path (Join-Path $payload 'engine\lib') -Force | Out-Null
Copy-Item -Path (Join-Path $libraries '*.jar') -Destination (Join-Path $payload 'engine\lib')
# Preserve upstream redistribution notices rather than shipping libraries alone.
New-Item -ItemType Directory -Path (Join-Path $payload 'third-party\jsignpdf') -Force | Out-Null
Copy-Item -Path (Join-Path $work 'dss\*') -Destination (Join-Path $payload 'third-party\jsignpdf') -Recurse -Force
& (Join-Path $PSScriptRoot '../dss-engine/build.ps1') -Jdk $jdk -Libraries $libraries
if (-not $?) { throw 'ENGINE_BUILD_FAILED' }
Copy-Item -LiteralPath (Join-Path $PSScriptRoot '../artifacts/dss-engine/notifica-dss-6.5.jar') -Destination (Join-Path $payload 'engine')
& $Dotnet publish (Join-Path $PSScriptRoot '../Notifica.Agent/Notifica.Agent.csproj') -c Release -r win-x64 --self-contained true -o (Join-Path $payload 'agent') -p:DebugType=None -p:DebugSymbols=false
if ($LASTEXITCODE -ne 0) { throw 'AGENT_BUILD_FAILED' }
$version=([xml](Get-Content (Join-Path $PSScriptRoot '../Notifica.Agent/Notifica.Agent.csproj'))).Project.PropertyGroup.Version
function Sign-ReleaseFile([string]$Path) {
    & $SignTool sign /sha1 $CertificateThumbprint /fd SHA256 /tr $TimestampUrl /td SHA256 $Path
    if ($LASTEXITCODE -ne 0) { throw 'AUTHENTICODE_SIGN_FAILED' }
    Assert-Publisher $Path $publisher
}
if (-not $PrepareOnly) {
    Sign-ReleaseFile (Join-Path $payload 'agent\Notifica.Agent.exe')
    Sign-ReleaseFile (Join-Path $payload 'agent\Notifica.Agent.dll')
}
& $Dotnet publish (Join-Path $PSScriptRoot '../Notifica.Setup/Notifica.Setup.csproj') -c Release -r win-x64 -o (Join-Path $work 'setup') "-p:PublisherSha256=$publisher" -p:DebugType=None -p:DebugSymbols=false
if ($LASTEXITCODE -ne 0) { throw 'SETUP_BUILD_FAILED' }
Copy-Item (Join-Path $work 'setup\Notifica.Setup.exe') (Join-Path $Output 'Notifica.Setup.exe')
if (-not $PrepareOnly) { Sign-ReleaseFile (Join-Path $Output 'Notifica.Setup.exe') }
Compress-Archive -Path (Join-Path $payload '*') -DestinationPath (Join-Path $Output 'payload.zip') -CompressionLevel Optimal
$hash=(Get-FileHash (Join-Path $Output 'payload.zip') -Algorithm SHA256).Hash.ToLowerInvariant()
if ($PrepareOnly) {
    @{ version=$version; payloadSha256=$hash; distributable=$false; reason='PUBLISHER_SIGNATURE_REQUIRED' } |
        ConvertTo-Json | Set-Content -LiteralPath (Join-Path $Output 'candidate.json') -Encoding UTF8
    Write-Output 'CANDIDATE_ONLY_NOT_INSTALLABLE'
    exit 0
}
$computerLiteral=($Computers | ForEach-Object { "'$_'" }) -join ','
$fromLiteral=($FromVersions | ForEach-Object { "'$_'" }) -join ','
$expires=[DateTimeOffset]::UtcNow.AddDays(30).ToString('O')
@"
@{
 Format=1; Version='$version'; MinimumVersion='$MinimumVersion'; Kind='$Kind'; Ring='$Ring'
 Computers=@($computerLiteral); FromVersions=@($fromLiteral); ExpiresAt='$expires'
 PayloadSha256='$hash'; AcceptanceSha256='$acceptanceHash'
}
"@ | Set-Content -LiteralPath (Join-Path $Output 'release.psd1') -Encoding UTF8
# SignTool also uses the PowerShell SIP for data files. Its RFC 3161 transport
# supports HTTPS; Set-AuthenticodeSignature's legacy timestamp API does not.
Sign-ReleaseFile (Join-Path $Output 'release.psd1')
Read-Release $Output $publisher | Out-Null
Write-Output 'SIGNED_RELEASE_READY'
