#Requires -Version 5.1
param([string]$Output=(Join-Path $PSScriptRoot '../../artifacts/managed-tests'))
$ErrorActionPreference='Stop'; Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot '../ReleaseTools.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'ManagedDistribution.psm1') -Force
$run=Join-Path ([IO.Path]::GetFullPath($Output)) ([Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $run -Force | Out-Null
$checks=[Collections.Generic.List[string]]::new()
function Check([string]$Name,[scriptblock]$Body) { & $Body; $checks.Add($Name) }
function Reject([scriptblock]$Body,[string]$Expected) {
    $caught=$null; try { & $Body | Out-Null } catch { $caught=$_.Exception.Message }
    if ($caught -cne $Expected) { throw "Expected $Expected; received $caught" }
}
function Manifest([int]$Format=1) {
    $files=[ordered]@{}
    $names=@('Install-Notifica.ps1','ReleaseTools.psm1','ManagedDistribution.psm1','install-request.example.json','INSTALACION.md')
    if ($Format -eq 2) { $names+=@('Update-Notifica.ps1','ManagedUpdate.psm1','ACTUALIZACION.md') }
    foreach ($name in $names) {
        $files[$name]=(Get-FileHash (Join-Path $run $name) -Algorithm SHA256).Hash.ToLowerInvariant()
    }
    @{format=$Format;mode='operator-managed-unsigned';version='0.12.0';payloadSha256=(Get-FileHash (Join-Path $run 'payload.zip') -Algorithm SHA256).Hash.ToLowerInvariant();files=$files} |
        ConvertTo-Json -Depth 10 | Set-Content (Join-Path $run 'distribution.json') -Encoding UTF8
    return (Get-FileHash (Join-Path $run 'distribution.json') -Algorithm SHA256).Hash.ToLowerInvariant()
}
foreach ($name in @('Install-Notifica.ps1','ReleaseTools.psm1','ManagedDistribution.psm1','install-request.example.json','INSTALACION.md','payload.zip')) {
    [IO.File]::WriteAllText((Join-Path $run $name),'synthetic test content')
}
$hash=Manifest
Check 'matching manifest and package accepted' { if ((Read-ManagedDistribution $run $hash).version -cne '0.12.0') { throw 'VERSION_LOST' } }
Check 'external manifest pin required' { Reject { Read-ManagedDistribution $run '' } 'EXPECTED_MANIFEST_HASH_REQUIRED' }
Check 'manifest mismatch rejected' { Reject { Read-ManagedDistribution $run ('a'*64) } 'MANIFEST_CHECKSUM_MISMATCH' }
Check 'changed installer rejected' {
    [IO.File]::WriteAllText((Join-Path $run 'Install-Notifica.ps1'),'changed')
    Reject { Read-ManagedDistribution $run $hash } 'DISTRIBUTION_FILE_CHANGED'
    [IO.File]::WriteAllText((Join-Path $run 'Install-Notifica.ps1'),'synthetic test content')
}
Check 'changed payload rejected' {
    [IO.File]::WriteAllText((Join-Path $run 'payload.zip'),'changed')
    Reject { Read-ManagedDistribution $run $hash } 'PAYLOAD_CHECKSUM_MISMATCH'
    [IO.File]::WriteAllText((Join-Path $run 'payload.zip'),'synthetic test content')
}
$requestPath=Join-Path $run 'request.json'
$request=[ordered]@{serverUrl='https://test.invalid/';allowedUserSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value;
    receiverDirectory=(Join-Path $run 'receiver');pkcs11Library=(Join-Path $run 'unused.dll');certificateFingerprint=$null;
    enableSigning=$false;timestampUrl=$null;timestampPolicyOid=$null;trustedCertificateFiles=@()}
$request | ConvertTo-Json | Set-Content $requestPath -Encoding UTF8
Check 'receiver request needs no token login' {
    $r=Read-ManagedRequest $requestPath
    Test-InitialRequest $r (Join-Path $run 'program') (Join-Path $run 'data') | Out-Null
    if (Test-Path $r.receiverDirectory) { throw 'PREFLIGHT_HAS_SIDE_EFFECTS' }
}
Check 'PIN fields rejected' {
    $request.pin='not-a-real-pin'; $request | ConvertTo-Json | Set-Content $requestPath -Encoding UTF8
    Reject { Read-ManagedRequest $requestPath } 'INVALID_REQUEST_FIELDS'; $request.Remove('pin')
}
$record=[pscustomobject]@{mode='operator-managed-unsigned';manifestSha256=$hash;requestSha256=('b'*64);status='installing'}
Check 'matching interrupted installation can resume' { Assert-ManagedResume $record $hash ('b'*64) }
Check 'another package cannot resume' { Reject { Assert-ManagedResume $record ('c'*64) ('b'*64) } 'RESUME_DOES_NOT_MATCH_INSTALLATION' }
Check 'changed request cannot reuse identity' { Reject { Assert-ManagedResume $record $hash ('c'*64) } 'RESUME_DOES_NOT_MATCH_INSTALLATION' }
Check 'completed installation is not an update target' { $record.status='installed'; Reject { Assert-ManagedResume $record $hash ('b'*64) } 'RESUME_DOES_NOT_MATCH_INSTALLATION' }
Check 'existing receiver directory is rejected for a new install' {
    New-Item -ItemType Directory -Path $request.receiverDirectory | Out-Null
    Reject { Test-InitialRequest ([pscustomobject]$request) (Join-Path $run 'program') (Join-Path $run 'data') } 'CHOOSE_NEW_RECEIVER_DIRECTORY'
    Test-InitialRequest ([pscustomobject]$request) (Join-Path $run 'program') (Join-Path $run 'data') $true | Out-Null
}
foreach ($name in @('Update-Notifica.ps1','ManagedUpdate.psm1','ACTUALIZACION.md')) { [IO.File]::WriteAllText((Join-Path $run $name),'synthetic test content') }
$updateHash=Manifest 2
Check 'v2 update package accepted with all pinned files' { Read-ManagedDistribution $run $updateHash | Out-Null }
Check 'modified updater rejected' {
    [IO.File]::WriteAllText((Join-Path $run 'Update-Notifica.ps1'),'tampered')
    Reject { Read-ManagedDistribution $run $updateHash } 'DISTRIBUTION_FILE_CHANGED'
    [IO.File]::WriteAllText((Join-Path $run 'Update-Notifica.ps1'),'synthetic test content')
}
Check 'unlisted file in manifest rejected' {
    $manifest=Get-Content (Join-Path $run 'distribution.json') -Raw | ConvertFrom-Json
    $manifest.files | Add-Member -NotePropertyName 'evil.ps1' -NotePropertyValue ('a'*64)
    $manifest | ConvertTo-Json -Depth 10 | Set-Content (Join-Path $run 'distribution.json') -Encoding UTF8
    $badHash=(Get-FileHash (Join-Path $run 'distribution.json') -Algorithm SHA256).Hash.ToLowerInvariant()
    Reject { Read-ManagedDistribution $run $badHash } 'INVALID_MANAGED_FILES'
}
@{passed=$checks.Count;checks=$checks;realTokenLoginAttempts=0;installed=$false} | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $run 'results.json') -Encoding UTF8
Write-Output "$($checks.Count) managed distribution checks passed"
