#Requires -Version 5.1
param([string]$Output = (Join-Path $PSScriptRoot '../artifacts/phase11/package-tests'))
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot 'ReleaseTools.psm1') -Force
Add-Type -AssemblyName System.IO.Compression
$Output=[IO.Path]::GetFullPath($Output)
New-Item -ItemType Directory -Path $Output -Force | Out-Null
$run=Join-Path $Output ([Guid]::NewGuid().ToString('N')); New-Item -ItemType Directory -Path $run | Out-Null
$checks=[Collections.Generic.List[object]]::new()
function Check([string]$Name, [scriptblock]$Body) { & $Body; $checks.Add(@{name=$Name;passed=$true}) }
function Reject([scriptblock]$Body, [string]$Expected) {
    $caught=$null; try { & $Body | Out-Null } catch { $caught=$_.Exception.Message }
    if ($caught -cne $Expected) { throw "Expected $Expected, received $caught" }
}
function Archive([string]$Entry) {
    $path=Join-Path $run ([Guid]::NewGuid().ToString('N')+'.zip')
    $file=[IO.File]::Open($path,'CreateNew','ReadWrite','None')
    $zip=[IO.Compression.ZipArchive]::new($file,'Create')
    try { $entryStream=$zip.CreateEntry($Entry).Open(); try { $bytes=[Text.Encoding]::UTF8.GetBytes('immutable signed PDF');$entryStream.Write($bytes,0,$bytes.Length) } finally { $entryStream.Dispose() } } finally { $zip.Dispose(); $file.Dispose() }
    return $path
}
$good=Archive 'agent/document.pdf'; $hash=(Get-FileHash $good -Algorithm SHA256).Hash.ToLowerInvariant()
Check 'verified archive preserves bytes' {
    $target=Join-Path $run 'valid'; Expand-VerifiedPayload $good $hash $target
    if ((Get-Content (Join-Path $target 'agent/document.pdf') -Raw) -cne 'immutable signed PDF') { throw 'CONTENT_CHANGED' }
}
Check 'tampering is rejected before extraction' { Reject { Expand-VerifiedPayload $good ('a'*64) (Join-Path $run 'tampered') } 'PAYLOAD_CHECKSUM_MISMATCH' }
Check 'existing destination cannot be overwritten' { Reject { Expand-VerifiedPayload $good $hash (Join-Path $run 'valid') } 'STAGING_MUST_BE_NEW' }
foreach ($entry in @('../escape.exe','/root.exe','C:/escape.exe','a/../../escape.exe','a:file.exe','a./file.exe','CON.exe','a//b.exe')) {
    Check "unsafe zip rejected: $entry" {
        $zip=Archive $entry; $digest=(Get-FileHash $zip -Algorithm SHA256).Hash.ToLowerInvariant()
        Reject { Expand-VerifiedPayload $zip $digest (Join-Path $run ([Guid]::NewGuid().ToString('N'))) } 'UNSAFE_ARCHIVE_PATH'
    }
}
$release=@{Version='0.12.0';MinimumVersion='0.11.0';Kind='upgrade';Ring='pilot';Computers=@('PILOT-1');FromVersions=@('0.11.0')}
Check 'targeted upgrade accepted' { Assert-ReleaseTarget $release '0.11.0' 'PILOT-1' }
Check 'wrong pilot computer rejected' { Reject { Assert-ReleaseTarget $release '0.11.0' 'OTHER' } 'OUTSIDE_RELEASE_RING' }
Check 'unapproved source rejected' { Reject { Assert-ReleaseTarget $release '0.9.0' 'PILOT-1' } 'UNSUPPORTED_UPGRADE_SOURCE' }
Check 'replay/downgrade rejected' { $r=$release.Clone();$r.Version='0.11.0'; Reject { Assert-ReleaseTarget $r '0.11.0' 'PILOT-1' } 'DOWNGRADE_REJECTED' }
Check 'explicit rollback accepted' { $r=$release.Clone();$r.Kind='rollback';$r.Version='0.11.0';$r.FromVersions=@('0.12.0'); Assert-ReleaseTarget $r '0.12.0' 'PILOT-1' }
Check 'rollback below floor rejected' { $r=$release.Clone();$r.Kind='rollback';$r.Version='0.10.0'; Reject { Assert-ReleaseTarget $r '0.11.0' 'PILOT-1' } 'BELOW_MINIMUM_VERSION' }
Check 'rollback cannot bootstrap installation' { $r=$release.Clone();$r.Kind='rollback'; Reject { Assert-ReleaseTarget $r '' 'PILOT-1' } 'ROLLBACK_REQUIRES_INSTALLATION' }
Check 'missing embedded publisher rejected' { Reject { Assert-Publisher $good '' } 'PUBLISHER_NOT_PROVISIONED' }
Check 'unsigned file rejected' { Reject { Assert-Publisher $good ('a'*64) } 'UNTRUSTED_PUBLISHER' }
Check 'a trusted different publisher is rejected' {
    $microsoft=Join-Path $PSHOME $(if($PSVersionTable.PSVersion.Major -ge 7){'pwsh.exe'}else{'powershell.exe'})
    if ((Get-AuthenticodeSignature -LiteralPath $microsoft).Status -ne 'Valid') { throw 'TEST_REQUIRES_TRUSTED_POWERSHELL' }
    Reject { Assert-Publisher $microsoft ('a'*64) } 'UNTRUSTED_PUBLISHER'
}
Check 'upgrade failure restores previous bytes and keeps documents' {
    $config=Join-Path $run 'configuration.json'; $journal=Join-Path $run 'transaction.json'
    Save-ReleaseJson $config @{version='old'}
    $pdf=Join-Path $run 'valid/agent/document.pdf';$originalHash=(Get-FileHash $pdf).Hash
    Reject { Invoke-ReleaseSwitch $journal @{version='old'} { Save-ReleaseJson $config @{version='new'}; throw 'SIMULATED_START_FAILURE' } { Save-ReleaseJson $config @{version='old'} } } 'INSTALLATION_ROLLED_BACK'
    if ((Get-Content $config -Raw | ConvertFrom-Json).version -ne 'old' -or (Test-Path $journal) -or (Get-FileHash $pdf).Hash -ne $originalHash) { throw 'RECOVERY_FAILED' }
}
Check 'rollback failure preserves durable recovery journal' {
    $journal=Join-Path $run 'failed-rollback.json'
    Reject { Invoke-ReleaseSwitch $journal @{version='old'} { throw 'FAILURE' } { throw 'ROLLBACK_FAILURE' } } 'ROLLBACK_FAILED_JOURNAL_PRESERVED'
    if ((Get-Content $journal -Raw | ConvertFrom-Json).previous.version -ne 'old') { throw 'JOURNAL_LOST' }
    Reject { Invoke-ReleaseSwitch $journal @{} {} {} } 'RECOVER_PREVIOUS_INSTALLATION_FIRST'
}
Check 'successful switch commits and clears its journal' {
    $journal=Join-Path $run 'successful-switch.json';$config=Join-Path $run 'configuration.json'
    Invoke-ReleaseSwitch $journal @{version='old'} { Save-ReleaseJson $config @{version='new'} } { throw 'UNEXPECTED_RESTORE' }
    if ((Test-Path $journal) -or (Get-Content $config -Raw | ConvertFrom-Json).version -ne 'new') { throw 'SWITCH_FAILED' }
}
function InitialRequest {
    return [pscustomobject]@{serverUrl='https://pilot.example/';allowedUserSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value;
        receiverDirectory=(Join-Path $run 'new-receiver');pkcs11Library=(Join-Path $run 'missing-provider.dll');
        certificateFingerprint=$null;enableSigning=$false;timestampUrl=$null;timestampPolicyOid=$null;trustedCertificateFiles=@()}
}
$installRoot=Join-Path $run 'application';$installData=Join-Path $run 'state'
Check 'receiver preflight has no filesystem side effects' {
    $r=InitialRequest;$prepared=Test-InitialRequest $r $installRoot $installData
    if ($prepared.receiver -cne $r.receiverDirectory -or (Test-Path $r.receiverDirectory)) { throw 'PREFLIGHT_MUTATED_STATE' }
}
Check 'signing selection must be boolean' { $r=InitialRequest;$r.enableSigning='false'; Reject { Test-InitialRequest $r $installRoot $installData } 'SIGNING_CHOICE_REQUIRED' }
Check 'HTTP origin rejected before directory creation' { $r=InitialRequest;$r.serverUrl='http://pilot.example/';Reject { Test-InitialRequest $r $installRoot $installData } 'HTTPS_ORIGIN_REQUIRED' }
Check 'receiver cannot overlap application directory' { $r=InitialRequest;$r.receiverDirectory=Join-Path $installRoot 'receiver';Reject { Test-InitialRequest $r $installRoot $installData } 'RECEIVER_OVERLAPS_INSTALLATION' }
Check 'receiver cannot be ancestor of protected state' { $r=InitialRequest;$r.receiverDirectory=$run;Reject { Test-InitialRequest $r $installRoot $installData } 'RECEIVER_OVERLAPS_INSTALLATION' }
Check 'existing receiver directory is untouched' { $r=InitialRequest;$r.receiverDirectory=Join-Path $run 'valid';Reject { Test-InitialRequest $r $installRoot $installData } 'CHOOSE_NEW_RECEIVER_DIRECTORY' }
Check 'missing signing driver rejected before installation' { $r=InitialRequest;$r.enableSigning=$true;$r.certificateFingerprint='a'*64;Reject { Test-InitialRequest $r $installRoot $installData } 'SIGNING_CONFIGURATION_REQUIRED' }
Check 'failed initial activation retains exact key/configuration checkpoint' {
    $journal=Join-Path $run 'initial-failed.json';$keyId=[Guid]::NewGuid().ToString()
    $record=@{configuration=@{keyName=$keyId};installation=@{version='0.11.0'}}
    Reject { Invoke-InitialInstallation $journal $record {} { throw 'SIMULATED_START_FAILURE' } } 'SIMULATED_START_FAILURE'
    if ((Get-Content $journal -Raw | ConvertFrom-Json).record.configuration.keyName -cne $keyId) { throw 'IDENTITY_CHECKPOINT_LOST' }
    Reject { Invoke-InitialInstallation $journal @{} {} {} } 'RECOVER_INITIAL_INSTALLATION_FIRST'
}
Check 'successful initial activation clears checkpoint' {
    $journal=Join-Path $run 'initial-success.json';$marker=Join-Path $run 'initial-ready.json'
    Invoke-InitialInstallation $journal @{version='0.11.0'} {} { Save-ReleaseJson $marker @{ready=$true} }
    if ((Test-Path $journal) -or -not (Get-Content $marker -Raw | ConvertFrom-Json).ready) { throw 'INITIAL_ACTIVATION_FAILED' }
}
Check 'SCM ownership requires the recorded image and account' {
    $configPath=Join-Path $run 'config.json';$exe=Join-Path $installRoot 'agent.exe'
    $service=[pscustomobject]@{PathName=('"'+$exe+'" --service --config "'+$configPath+'"');StartName='NT SERVICE\NotificaSigningAgent'}
    Assert-ServiceOwnership $service @($exe) $configPath
    $service.StartName='LocalSystem';Reject { Assert-ServiceOwnership $service @($exe) $configPath } 'SERVICE_OWNERSHIP_MISMATCH'
    $service.StartName='NT SERVICE\NotificaSigningAgent';$service.PathName='unrelated.exe'
    Reject { Assert-ServiceOwnership $service @($exe) $configPath } 'SERVICE_OWNERSHIP_MISMATCH'
}
$checks | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $Output 'results.json') -Encoding UTF8
Write-Output ("{0} release integrity checks passed" -f $checks.Count)
