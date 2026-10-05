#Requires -Version 5.1
param([string]$Output=(Join-Path $PSScriptRoot '../../artifacts/managed-update-tests'))
$ErrorActionPreference='Stop'; Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot '../ReleaseTools.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'ManagedUpdate.psm1') -Force
$run=Join-Path ([IO.Path]::GetFullPath($Output)) ([Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $run | Out-Null
$checks=[Collections.Generic.List[string]]::new()
function Check([string]$Name,[scriptblock]$Body) { & $Body; $checks.Add($Name) }
function Reject([scriptblock]$Body,[string]$Expected) {
    $caught=$null; try { & $Body | Out-Null } catch { $caught=$_.Exception.Message }
    if ($caught -cne $Expected) { throw "Expected $Expected; received $caught" }
}
$root=Join-Path $run 'program'; $data=Join-Path $run 'data'; $state=Join-Path $data 'state'
New-Item -ItemType Directory -Path $state -Force | Out-Null
$oldTarget=Join-Path $root ('versions\0.12.0-'+('a'*32)); $newTarget=Join-Path $root ('versions\0.13.0-'+('b'*32))
$record=[pscustomobject]@{mode='operator-managed-unsigned';status='installed';version='0.12.0';target=$oldTarget;keyName=[Guid]::NewGuid().ToString()}
$config=[pscustomobject]@{serverUrl='https://test.invalid/';allowedUserSid='S-1-5-21-1-2-3-1000';dataDirectory=$state;
    machineKey=$true;keyName=$record.keyName;pkcs11Library='C:\Driver\token.dll';certificateFingerprint=('a'*64);receiverDirectory=(Join-Path $run 'documents');
    signingEngine=[pscustomobject]@{javaExecutable=(Join-Path $oldTarget 'java\bin\java.exe');bridgeJar=(Join-Path $oldTarget 'engine\notifica-dss-6.5.jar');
        librariesDirectory=(Join-Path $oldTarget 'engine\lib');outputDirectory=(Join-Path $state 'signed');timestampUrl='https://tsa.invalid/';
        timestampPolicyOid='1.2.3';trustedCertificateFiles=@('C:\Trust\public.cer')}}
Check 'known managed 0.12 signer accepted' { Assert-ManagedUpdateSource $record $config $root $data '0.13.0' }
Check 'unknown old version rejected' {
    $copy=$record | ConvertTo-Json | ConvertFrom-Json; $copy.version='0.11.0'
    Reject { Assert-ManagedUpdateSource $copy $config $root $data '0.13.0' } 'UNSUPPORTED_UPGRADE_SOURCE'
}
Check 'incomplete installation rejected' {
    $copy=$record | ConvertTo-Json | ConvertFrom-Json; $copy.status='installing'
    Reject { Assert-ManagedUpdateSource $copy $config $root $data '0.13.0' } 'MANAGED_INSTALLATION_REQUIRED'
}
Check 'wrong machine identity rejected' {
    $copy=$config | ConvertTo-Json -Depth 20 | ConvertFrom-Json; $copy.keyName=[Guid]::NewGuid().ToString()
    Reject { Assert-ManagedUpdateSource $record $copy $root $data '0.13.0' } 'INSTALLATION_CONFIGURATION_MISMATCH'
}
Check 'external target rejected' { Reject { Assert-ManagedTarget (Join-Path $run 'elsewhere') $root '0.12.0' } 'INVALID_INSTALLATION_TARGET' }
Check 'path traversal target rejected' { Reject { Assert-ManagedTarget (Join-Path $oldTarget '..\..\outside') $root '0.12.0' } 'INVALID_INSTALLATION_TARGET' }
Check 'custom engine rejected' {
    $copy=$config | ConvertTo-Json -Depth 20 | ConvertFrom-Json; $copy.signingEngine.javaExecutable='C:\Other\java.exe'
    Reject { Assert-ManagedUpdateSource $record $copy $root $data '0.13.0' } 'CUSTOM_SIGNING_ENGINE_REQUIRES_REVIEW'
}
Check 'signer update changes only three runtime paths' {
    $before=$config | ConvertTo-Json -Depth 20 -Compress
    $next=New-ManagedUpdateConfiguration $config $newTarget
    if ($next.signingEngine.javaExecutable -cne (Join-Path $newTarget 'java\bin\java.exe')) { throw 'RUNTIME_NOT_MOVED' }
    $next.signingEngine.javaExecutable=$config.signingEngine.javaExecutable
    $next.signingEngine.bridgeJar=$config.signingEngine.bridgeJar
    $next.signingEngine.librariesDirectory=$config.signingEngine.librariesDirectory
    if (($next | ConvertTo-Json -Depth 20 -Compress) -cne $before -or ($config | ConvertTo-Json -Depth 20 -Compress) -cne $before) { throw 'SETTINGS_CHANGED' }
}
Check 'receiver update preserves full configuration' {
    $receiver=$config | ConvertTo-Json -Depth 20 | ConvertFrom-Json; $receiver.PSObject.Properties.Remove('signingEngine')
    Assert-ManagedUpdateSource $record $receiver $root $data '0.13.0'
    if (((New-ManagedUpdateConfiguration $receiver $newTarget) | ConvertTo-Json -Depth 20 -Compress) -cne ($receiver | ConvertTo-Json -Depth 20 -Compress)) { throw 'RECEIVER_CHANGED' }
}
Check 'unfinished signing journal preserved and blocks update' {
    $work=Join-Path $state 'signing-work.json'; [IO.File]::WriteAllText($work,'original signing journal')
    Reject { Assert-NoSigningWork $state } 'REVIEW_ACTIVE_WORK'
    if ((Get-Content $work -Raw) -cne 'original signing journal') { throw 'JOURNAL_CHANGED' }
    Remove-Item -LiteralPath $work
}
Check 'partial signing journal also blocks update' {
    $work=Join-Path $state 'signing-work.json.part'; [IO.File]::WriteAllText($work,'partial')
    Reject { Assert-NoSigningWork $state } 'REVIEW_ACTIVE_WORK'; Remove-Item -LiteralPath $work
}
$configPath=Join-Path $data 'config.json'; $recordPath=Join-Path $data 'managed-installation.json'
$identityPath=Join-Path $state 'identity.json'; $pdf=Join-Path $state 'existing.pdf'; $legacy=Join-Path $state 'receiver-state.json'
[IO.File]::WriteAllText($identityPath,'synthetic identity'); [IO.File]::WriteAllText($pdf,'%PDF-legacy bytes'); [IO.File]::WriteAllText($legacy,'original legacy state')
$protectedHashes=@{}; foreach ($path in @($identityPath,$pdf,$legacy)) { $protectedHashes[$path]=(Get-FileHash $path).Hash }
$journal=Join-Path $data 'managed-update.json'
$checkpoint=@{installation=$record;configuration=$config;candidateTarget=$newTarget;taskXml='<Task>original</Task>'}
foreach ($failure in @('Stop','CheckIdle','Switch','StartAndVerify','Commit','none')) {
    Check "transaction $failure preserves identity/documents and restores failed changes" {
        Save-ReleaseJson $configPath $config; Save-ReleaseJson $recordPath $record
        $context=@{stage='old';failure=$failure;restored=$false;service='old';task='old'}
        $operations=@{
            Stop={ $context.service='stopped'; if ($context.failure -eq 'Stop') { throw 'SIMULATED_STOP_FAILURE' } }
            CheckIdle={ if ($context.failure -eq 'CheckIdle') { throw 'REVIEW_ACTIVE_WORK' } }
            Switch={ Save-ReleaseJson $configPath (New-ManagedUpdateConfiguration $config $newTarget); $context.task='new'; if ($context.failure -eq 'Switch') { throw 'SIMULATED_SWITCH_FAILURE' } }
            StartAndVerify={ $context.service='new'; if ($context.failure -eq 'StartAndVerify') { throw 'SERVICE_READINESS_FAILED' } }
            Commit={ Save-ReleaseJson $recordPath @{version='0.13.0'}; if ($context.failure -eq 'Commit') { throw 'SIMULATED_COMMIT_FAILURE' } }
            Restore={ Save-ReleaseJson $configPath $config; Save-ReleaseJson $recordPath $record; $context.service='old'; $context.task='old'; $context.restored=$true }
        }
        if ($failure -eq 'none') {
            Invoke-ManagedUpdateTransaction $journal $checkpoint $operations
            if ($context.restored -or (Read-UpdateJson $recordPath).version -ne '0.13.0') { throw 'COMMIT_FAILED' }
        } else {
            $expected=if ($failure -eq 'CheckIdle') { 'REVIEW_ACTIVE_WORK' } else { 'UPDATE_FAILED_PREVIOUS_VERSION_RESTORED' }
            Reject { Invoke-ManagedUpdateTransaction $journal $checkpoint $operations } $expected
            if (-not $context.restored -or $context.service -ne 'old' -or $context.task -ne 'old' -or (Read-UpdateJson $recordPath).version -ne '0.12.0') { throw 'RESTORE_FAILED' }
            if (((Read-UpdateJson $configPath) | ConvertTo-Json -Depth 20 -Compress) -cne ($config | ConvertTo-Json -Depth 20 -Compress)) { throw 'RESTORED_CONFIG_CHANGED' }
        }
        if (Test-Path $journal) { throw 'COMPLETED_JOURNAL_NOT_CLEARED' }
        foreach ($path in $protectedHashes.Keys) { if ((Get-FileHash $path).Hash -cne $protectedHashes[$path]) { throw 'USER_DATA_CHANGED' } }
    }
}
Check 'failed restoration preserves durable recovery checkpoint' {
    Reject { Invoke-ManagedUpdateTransaction $journal $checkpoint @{Stop={};CheckIdle={};Switch={throw 'SIMULATED_FAILURE'};Restore={throw 'SIMULATED_RESTORE_FAILURE'}} } 'RECOVERY_REQUIRED_JOURNAL_PRESERVED'
    $saved=Read-UpdateJson $journal
    if ($saved.installation.keyName -cne $record.keyName -or $saved.taskXml -cne $checkpoint.taskXml) { throw 'RECOVERY_DATA_LOST' }
    Reject { Invoke-ManagedUpdateTransaction $journal $checkpoint @{} } 'RECOVER_INTERRUPTED_UPDATE_FIRST'
}
@{passed=$checks.Count;checks=$checks;realServiceModified=$false;realTokenLoginAttempts=0} | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $run 'results.json') -Encoding UTF8
Write-Output "$($checks.Count) managed upgrade checks passed"
Write-Output (Join-Path $run 'results.json')
