#Requires -Version 7.0
param(
    [Parameter(Mandatory)][string]$RuntimePayload,
    [Parameter(Mandatory)][string]$RuntimeSha256,
    [Parameter(Mandatory)][string]$Output,
    [string]$Dotnet='dotnet'
)
$ErrorActionPreference='Stop'; Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'ReleaseTools.psm1') -Force
$Output=Assert-LocalPath $Output
if (Test-Path -LiteralPath $Output) { throw 'OUTPUT_MUST_BE_NEW' }
if ($RuntimeSha256 -cnotmatch '^[a-f0-9]{64}$') { throw 'RUNTIME_HASH_REQUIRED' }
if ((& $Dotnet --version).Trim() -cne '10.0.401') { throw 'PINNED_SDK_REQUIRED' }
$version=([xml](Get-Content (Join-Path $PSScriptRoot '../Notifica.Agent/Notifica.Agent.csproj'))).Project.PropertyGroup.Version
New-Item -ItemType Directory -Path $Output | Out-Null
$repository=Join-Path $Output 'repository'; $assets=Join-Path $Output 'release-assets'
$work=Join-Path (Split-Path $PSScriptRoot) ('artifacts\managed-build-'+[Guid]::NewGuid().ToString('N'))
$payload=Join-Path $work 'payload'; $package=Join-Path $work 'package'
New-Item -ItemType Directory -Path $repository,$assets,$work,$package,(Join-Path $repository 'tools'),(Join-Path $repository 'examples') | Out-Null
# Reuse only an explicitly hash-pinned runtime archive. Rebuild all NOTIFICA code.
Expand-VerifiedPayload $RuntimePayload $RuntimeSha256 $payload
# The upstream demo includes a public example private key; it is not a runtime
# dependency and must not be confused with customer credentials in this package.
$demoKey=Join-Path $payload 'third-party\jsignpdf\JSignPdf\demo\jsmith.p12'
if (Test-Path -LiteralPath $demoKey) { Remove-Item -LiteralPath $demoKey }
[IO.File]::WriteAllText((Join-Path $payload 'third-party\NOTIFICA-DISTRIBUTION-NOTES.txt'),
    'Upstream public demonstration key demo/jsmith.p12 omitted. Runtime libraries and upstream notices retained.')
$forbidden=@(Get-ChildItem -LiteralPath $payload -File -Recurse | Where-Object {
    $_.Name -match '^(\.env($|\.)|identity\.json|config\.json|signing-work\.json)$' -or $_.Extension -in @('.pfx','.p12','.key')
})
if ($forbidden.Count) { throw 'PRIVATE_OR_STATE_FILE_IN_PAYLOAD' }
$agent=Join-Path $payload 'agent'
$resolvedAgent=[IO.Path]::GetFullPath($agent)
if (-not $resolvedAgent.StartsWith([IO.Path]::GetFullPath($work)+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'INVALID_BUILD_TARGET' }
if (Test-Path -LiteralPath $agent) { Remove-Item -LiteralPath $agent -Recurse -Force }
& $Dotnet publish (Join-Path $PSScriptRoot '../Notifica.Agent/Notifica.Agent.csproj') -c Release -r win-x64 --self-contained true --no-restore -o $agent -p:DebugType=None -p:DebugSymbols=false
if ($LASTEXITCODE -ne 0) { throw 'AGENT_BUILD_FAILED' }
& (Join-Path $PSScriptRoot '../dss-engine/build.ps1') -Jdk (Join-Path $payload 'java') -Libraries (Join-Path $payload 'engine\lib')
if (-not $?) { throw 'ENGINE_BUILD_FAILED' }
Copy-Item -LiteralPath (Join-Path $PSScriptRoot '../artifacts/dss-engine/notifica-dss-6.5.jar') -Destination (Join-Path $payload 'engine/notifica-dss-6.5.jar') -Force
foreach ($file in @('README.md','INSTALACION.md','ACTUALIZACION.md','GUIA_GITHUB.md')) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot ('managed/'+$file)) -Destination $repository }
foreach ($file in @('Install-Notifica.ps1','ManagedDistribution.psm1','Update-Notifica.ps1','ManagedUpdate.psm1')) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot ('managed/'+$file)) -Destination (Join-Path $repository 'tools')
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot ('managed/'+$file)) -Destination $package
}
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'ReleaseTools.psm1') -Destination (Join-Path $repository 'tools')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'ReleaseTools.psm1') -Destination $package
$example=Get-Content (Join-Path $PSScriptRoot 'install-request.example.json') -Raw | ConvertFrom-Json
$example.PSObject.Properties.Remove('action'); $example.PSObject.Properties.Remove('releaseDirectory')
$example | ConvertTo-Json -Depth 10 | Set-Content (Join-Path $package 'install-request.example.json') -Encoding utf8
Copy-Item -LiteralPath (Join-Path $package 'install-request.example.json') -Destination (Join-Path $repository 'examples')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'managed/INSTALACION.md') -Destination $package
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'managed/ACTUALIZACION.md') -Destination $package
@'
*.zip
*.exe
*.dll
*.pfx
*.p12
*.pem
.env*
install-request.json
config.json
identity.json
signing-work.json
state/
logs/
'@ | Set-Content (Join-Path $repository '.gitignore') -Encoding utf8
Compress-Archive -Path (Join-Path $payload '*') -DestinationPath (Join-Path $package 'payload.zip') -CompressionLevel Optimal
$files=[ordered]@{}
foreach ($name in @('Install-Notifica.ps1','ReleaseTools.psm1','ManagedDistribution.psm1','install-request.example.json','INSTALACION.md','Update-Notifica.ps1','ManagedUpdate.psm1','ACTUALIZACION.md')) {
    $files[$name]=(Get-FileHash (Join-Path $package $name) -Algorithm SHA256).Hash.ToLowerInvariant()
}
$manifest=[ordered]@{format=2;mode='operator-managed-unsigned';version=$version;runtimeSourceSha256=$RuntimeSha256;
    payloadSha256=(Get-FileHash (Join-Path $package 'payload.zip') -Algorithm SHA256).Hash.ToLowerInvariant();files=$files}
$manifest | ConvertTo-Json -Depth 10 | Set-Content (Join-Path $package 'distribution.json') -Encoding utf8
$manifestHash=(Get-FileHash (Join-Path $package 'distribution.json') -Algorithm SHA256).Hash.ToLowerInvariant()
Import-Module (Join-Path $PSScriptRoot 'managed/ManagedDistribution.psm1') -Force
Read-ManagedDistribution $package $manifestHash | Out-Null
$zipName="NOTIFICA-Windows-$version-managed.zip"
Compress-Archive -Path (Join-Path $package '*') -DestinationPath (Join-Path $assets $zipName) -CompressionLevel NoCompression
$zipHash=(Get-FileHash (Join-Path $assets $zipName) -Algorithm SHA256).Hash.ToLowerInvariant()
"$zipHash  $zipName`n$manifestHash  distribution.json (dentro del ZIP)" | Set-Content (Join-Path $assets 'SHA256SUMS.txt') -Encoding utf8
$updateGuide=(Get-Content (Join-Path $PSScriptRoot 'managed/ACTUALIZACION.md') -Raw).
    Replace('HASH-DE-DISTRIBUTION-JSON-PUBLICADO-EN-LAS-NOTAS',$manifestHash).
    Replace('HASH-ZIP-PUBLICADO-EN-LAS-NOTAS',$zipHash)
$updateGuide | Set-Content (Join-Path $assets 'ACTUALIZACION.md') -Encoding utf8
$guideHash=(Get-FileHash (Join-Path $assets 'ACTUALIZACION.md') -Algorithm SHA256).Hash.ToLowerInvariant()
"$guideHash  ACTUALIZACION.md" | Add-Content (Join-Path $assets 'SHA256SUMS.txt') -Encoding utf8
@"
# NOTIFICA Windows $version - instalación administrada

Pre-release para instalación personal mediante control remoto. Sin firma de editor.
Incluye instalación nueva y actualización administrada 0.12.0 -> 0.13.0 con conservación de inscripción, configuración y documentos.
Carpeta compartida por oficina: últimos 50 días de PDF firmados FEA, descarga al abrir, también en el PC firmante.
El historial completo permanece en Firmados de la aplicación. Requiere desplegar también la aplicación web/servidor.
Incluye agente, .NET 10.0.12, Java 21.0.12, motor DSS 6.5 y avisos de dependencias.
No incluye controlador USB, certificado FEA, datos de clientes ni configuración del servidor.

Descarga **$zipName**. Para PCs existentes sigue ACTUALIZACION.md; para PCs nuevos sigue INSTALACION.md.
SHA-256 del ZIP: **$zipHash**
SHA-256 de distribution.json para ExpectedManifestSha256: **$manifestHash**

Se han comprobado construcción e integridad. La instalación elevada y aceptación
en PCs destino sigue pendiente. No se afirma un piloto de producción completado.
El actualizador conserva la versión anterior y recupera un cambio fallido; bloquea trabajos de firma pendientes.
No desinstales ni vuelvas a inscribir los PCs para actualizar. GitHub no instala la actualización automáticamente.
No uses el ZIP automático Source code para instalar.
"@ | Set-Content (Join-Path $assets 'RELEASE-NOTES.md') -Encoding utf8
@{repository=$repository;releaseAssets=$assets;package=$package;payload=$payload;manifestSha256=$manifestHash;zipSha256=$zipHash;version=$version} |
    ConvertTo-Json | Set-Content (Join-Path $work 'build-result.json') -Encoding utf8
Write-Output (Join-Path $work 'build-result.json')
