#Requires -Version 7.0
# Repackage the verified 0.13.0 payload with the corrected updater only.
param(
    [Parameter(Mandatory)][string]$OriginalPackage,
    [Parameter(Mandatory)][string]$OriginalManifestHash,
    [Parameter(Mandatory)][string]$Output,
    [ValidateRange(3,999)][int]$Revision=3
)
$ErrorActionPreference='Stop'; Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'ReleaseTools.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'managed/ManagedDistribution.psm1') -Force
$source=Read-ManagedDistribution $OriginalPackage $OriginalManifestHash
if ($source.version -cne '0.13.0' -or $source.format -ne 2) { throw 'ORIGINAL_0_13_PACKAGE_REQUIRED' }
$Output=Assert-LocalPath $Output
if (Test-Path -LiteralPath $Output) { throw 'OUTPUT_MUST_BE_NEW' }
$package=Join-Path $Output 'package'; $assets=Join-Path $Output 'release-assets'; $patch=Join-Path $Output 'patch'
New-Item -ItemType Directory -Path $package,$assets,$patch | Out-Null
foreach ($name in (@($source.files.PSObject.Properties.Name)+@('payload.zip'))) {
    Copy-Item -LiteralPath (Join-Path $OriginalPackage $name) -Destination $package
}
foreach ($name in @('Update-Notifica.ps1','ManagedUpdate.psm1')) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot ('managed/'+$name)) -Destination $package -Force
}
$zipName="NOTIFICA-Windows-0.13.0-managed.$Revision.zip"
$patchName="NOTIFICA-Windows-0.13.0-updater-fix.$Revision.zip"
foreach ($name in @('ACTUALIZACION.md','INSTALACION.md')) {
    $path=Join-Path $package $name
    (Get-Content -LiteralPath $path -Raw -Encoding UTF8).Replace('NOTIFICA-Windows-0.13.0-managed.zip',$zipName) |
        Set-Content -LiteralPath $path -Encoding utf8
}
$source | Add-Member -NotePropertyName packageRevision -NotePropertyValue $Revision -Force
$source | Add-Member -NotePropertyName previousManifestSha256 -NotePropertyValue $OriginalManifestHash -Force
foreach ($entry in $source.files.PSObject.Properties) {
    $entry.Value=(Get-FileHash -LiteralPath (Join-Path $package $entry.Name) -Algorithm SHA256).Hash.ToLowerInvariant()
}
Save-ReleaseJson (Join-Path $package 'distribution.json') $source
$manifestHash=(Get-FileHash -LiteralPath (Join-Path $package 'distribution.json') -Algorithm SHA256).Hash.ToLowerInvariant()
Read-ManagedDistribution $package $manifestHash | Out-Null
foreach ($name in @('Update-Notifica.ps1','ManagedUpdate.psm1','ACTUALIZACION.md','INSTALACION.md','distribution.json')) {
    Copy-Item -LiteralPath (Join-Path $package $name) -Destination $patch
}
Compress-Archive -Path (Join-Path $patch '*') -DestinationPath (Join-Path $assets $patchName)
Compress-Archive -Path (Join-Path $package '*') -DestinationPath (Join-Path $assets $zipName) -CompressionLevel NoCompression
$zipHash=(Get-FileHash -LiteralPath (Join-Path $assets $zipName) -Algorithm SHA256).Hash.ToLowerInvariant()
$patchHash=(Get-FileHash -LiteralPath (Join-Path $assets $patchName) -Algorithm SHA256).Hash.ToLowerInvariant()
$guide=(Get-Content -LiteralPath (Join-Path $package 'ACTUALIZACION.md') -Raw -Encoding UTF8).
    Replace('HASH-DE-DISTRIBUTION-JSON-PUBLICADO-EN-LAS-NOTAS',$manifestHash).Replace('HASH-ZIP-PUBLICADO-EN-LAS-NOTAS',$zipHash)
$guide | Set-Content -LiteralPath (Join-Path $assets 'ACTUALIZACION.md') -Encoding utf8
$guideHash=(Get-FileHash -LiteralPath (Join-Path $assets 'ACTUALIZACION.md') -Algorithm SHA256).Hash.ToLowerInvariant()
"$zipHash  $zipName`n$patchHash  $patchName`n$manifestHash  distribution.json (dentro del ZIP)`n$guideHash  ACTUALIZACION.md" |
    Set-Content -LiteralPath (Join-Path $assets 'SHA256SUMS.txt') -Encoding utf8
@"
# NOTIFICA Windows 0.13.0 - revisión $Revision del actualizador

Corrige TRAY_USER_MISMATCH cuando Windows muestra un nombre corto (gonza) para
la misma cuenta registrada (GONZA\gonza). La comprobación usa el SID del XML
oficial de la tarea; una cuenta realmente distinta sigue siendo rechazada.

Corrige también el cambio de servicio en Windows PowerShell 5.1: usa CIM con
argumentos tipados y verifica la ruta guardada. La invocación anterior de sc.exe
perdía las comillas y podía fallar tanto al actualizar como al restaurar.

El agente y los runtimes son exactamente el payload verificado de 0.13.0.
No hay que cambiar la cuenta Windows ni volver a inscribir el PC. Los PCs que
ya ejecutan 0.13.0 no necesitan reinstalar por esta corrección del actualizador.

Publicar como nueva pre-release v0.13.0-managed.$Revision; conservar revisiones anteriores sin modificar.
Paquete completo: $zipName.
Si ya extrajiste managed.1 o managed.2, puedes aplicar $patchName
encima de esa carpeta: reemplaza solo sus cinco archivos, conserva payload.zip y
los otros archivos originales. No aplicar el parche a Program Files/ProgramData.
En ambos casos usa la NUEVA huella del manifiesto y repite -Preflight antes de actualizar.
Si hay una actualización interrumpida, ejecuta primero -Recover con el paquete y
hash que la iniciaron. No reemplaces sus archivos mientras exista ese diario.

Manifest SHA-256 / ExpectedManifestSha256: $manifestHash
ZIP completo SHA-256: $zipHash
Parche SHA-256: $patchHash

Comprobaciones: 26 pruebas de actualización/identidad, 13 escenarios completos del
script con SCM/tareas simulados y 15 de integridad. Una prueba elevada con un
servicio temporal que nunca se inició reprodujo el error 1639 de sc.exe y verificó
que CIM conserva exactamente la ruta. Los resultados del piloto real se registran
por separado. Preparar estos archivos no publica la Release en GitHub.
"@ | Set-Content -LiteralPath (Join-Path $assets 'RELEASE-NOTES.md') -Encoding utf8
Save-ReleaseJson (Join-Path $Output 'revision-result.json') @{version='0.13.0';packageRevision=$Revision;package=$package;patch=$patch;releaseAssets=$assets;manifestSha256=$manifestHash;zipSha256=$zipHash;patchSha256=$patchHash;payloadSha256=$source.payloadSha256}
Write-Output (Join-Path $Output 'revision-result.json')
