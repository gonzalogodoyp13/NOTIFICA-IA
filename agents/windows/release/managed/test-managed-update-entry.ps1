#Requires -Version 5.1
# Exercise the complete entry script with real isolated files and simulated SCM/
# Task Scheduler/process operations. Never operate on the installed service.
param([Parameter(Mandatory)][string]$OldAgentExe,[Parameter(Mandatory)][string]$NewAgentExe)
$ErrorActionPreference='Stop'; Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot '../ReleaseTools.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'ManagedUpdate.psm1') -Force
$run=Join-Path ([IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../artifacts/managed-entry-tests'))) ([Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $run -Force | Out-Null
$source=Get-Content (Join-Path $PSScriptRoot 'Update-Notifica.ps1') -Raw -Encoding UTF8
$mocks=@'
function Get-CimInstance { param($ClassName,$Filter) return $global:fixture.service }
function Get-ScheduledTask { param($TaskName) return $global:fixture.task }
function Export-ScheduledTask { param($TaskName) return ($global:fixture.task | ConvertTo-Json -Depth 20) }
function Disable-ScheduledTask { param($TaskName) $global:fixture.task.Settings.Enabled=$false }
function Enable-ScheduledTask { param($TaskName) $global:fixture.task.Settings.Enabled=$true }
function Stop-ScheduledTask { param($TaskName) $global:fixture.taskRunning=$false }
function Start-ScheduledTask { param($TaskName) $global:fixture.taskRunning=$true }
function New-ScheduledTaskAction { param($Execute,$Argument) return [pscustomobject]@{Execute=$Execute;Arguments=$Argument} }
function Set-ScheduledTask { param($TaskName,$Action) $global:fixture.task.Actions=@($Action) }
function Register-ScheduledTask { param($TaskName,$Xml,[switch]$Force) $global:fixture.task=$Xml | ConvertFrom-Json }
function Stop-Service {
    param($Name)
    if ($global:fixture.scenario -eq 'stop-failure' -and -not $global:fixture.injected) { $global:fixture.injected=$true; throw 'SIMULATED_STOP_FAILURE' }
    $global:fixture.service.State='Stopped'
    if ($global:fixture.scenario -eq 'late-signing-work') { [IO.File]::WriteAllText((Join-Path $global:fixture.state 'signing-work.json'),'preserve uncertain signing work') }
}
function Get-Service {
    param($Name)
    $result=[pscustomobject]@{}
    $result | Add-Member -MemberType ScriptMethod -Name WaitForStatus -Value { param($status,$timeout) if ($global:fixture.service.State -cne $status) { throw 'WRONG_SERVICE_STATUS' } }
    return $result
}
function Start-Service {
    param($Name)
    $version=if ($global:fixture.service.PathName -like '*0.13.0-*') { '0.13.0' } else { '0.12.0' }
    if ($version -eq '0.13.0' -and $global:fixture.scenario -in @('start-failure','recovery-failure')) { throw 'SIMULATED_START_FAILURE' }
    if ($version -eq '0.12.0' -and $global:fixture.scenario -eq 'recovery-failure') { throw 'SIMULATED_RESTORE_FAILURE' }
    $global:fixture.service.State='Running'
    Save-ReleaseJson (Join-Path $global:fixture.state 'service-ready.json') @{processId=7001;version=$version;at=[DateTimeOffset]::UtcNow.ToString('O')}
}
function Mock-Sc {
    if ($args.Count -ne 4 -or $args[0] -cne 'config' -or $args[1] -cne 'NotificaSigningAgent' -or $args[2] -cne 'binPath=') { throw 'UNEXPECTED_SERVICE_COMMAND' }
    $global:fixture.service.PathName=$args[3]; $global:LASTEXITCODE=0
}
function Set-ReleaseAcl { param($Path) if (-not $Path.StartsWith($global:fixture.base,[StringComparison]::OrdinalIgnoreCase)) { throw 'TEST_PATH_ESCAPE' } }
function Start-Process {
    param($FilePath,$ArgumentList,$WindowStyle,[switch]$PassThru)
    if ($ArgumentList[0] -cne '--validate-config' -or $WindowStyle -cne 'Hidden') { throw 'UNEXPECTED_PROCESS' }
    $config=Read-UpdateJson $global:fixture.configPath
    if ($config.signingEngine.javaExecutable -notlike '*0.13.0-*') { throw 'RUNTIME_NOT_SWITCHED' }
    $process=[pscustomobject]@{ExitCode=$(if($global:fixture.scenario -eq 'validation-failure'){1}else{0})}
    $process | Add-Member -MemberType ScriptMethod -Name WaitForExit -Value { param($timeout) return $true }
    return $process
}
'@
$replacements=@{
    "([Environment]::GetFolderPath('ProgramFiles'))"='$global:fixture.programFiles'
    "([Environment]::GetFolderPath('CommonApplicationData'))"='$global:fixture.programData'
    "Join-Path ([Environment]::GetFolderPath('System')) 'sc.exe'"="'Mock-Sc'"
    '([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)'='$true'
}
foreach ($entry in $replacements.GetEnumerator()) {
    if (-not $source.Contains($entry.Key)) { throw 'TEST_SEAM_CHANGED' }
    $source=$source.Replace($entry.Key,$entry.Value)
}
$source=$source.Replace('$lease=$null',('$lease=$null'+[Environment]::NewLine+$mocks))
$checks=[Collections.Generic.List[string]]::new()
foreach ($scenario in @('preflight','upgrade','validation-failure','start-failure','stop-failure','late-signing-work','recovery-failure','recover','wrong-service','wrong-task')) {
    $base=Join-Path $run $scenario; $package=Join-Path $base 'package'; $payload=Join-Path $base 'payload'
    $programFiles=Join-Path $base 'program-files'; $programData=Join-Path $base 'program-data'
    $root=Join-Path $programFiles 'NotificaIA\Agent'; $data=Join-Path $programData 'NotificaIA\Agent'; $state=Join-Path $data 'state'
    $oldTarget=Join-Path $root ('versions\0.12.0-'+('a'*32)); $oldExe=Join-Path $oldTarget 'agent\Notifica.Agent.exe'
    New-Item -ItemType Directory -Path $package,(Join-Path $payload 'agent'),(Split-Path $oldExe),$state -Force | Out-Null
    Copy-Item -LiteralPath $OldAgentExe -Destination $oldExe
    Copy-Item -LiteralPath $NewAgentExe -Destination (Join-Path $payload 'agent\Notifica.Agent.exe')
    Compress-Archive -Path (Join-Path $payload '*') -DestinationPath (Join-Path $package 'payload.zip')
    $names=@('Install-Notifica.ps1','ManagedDistribution.psm1','ManagedUpdate.psm1','INSTALACION.md','ACTUALIZACION.md')
    foreach ($name in $names) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination $package }
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot '../ReleaseTools.psm1') -Destination $package
    [IO.File]::WriteAllText((Join-Path $package 'Update-Notifica.ps1'),$source,[Text.UTF8Encoding]::new($false))
    [IO.File]::WriteAllText((Join-Path $package 'install-request.example.json'),'{}')
    $files=[ordered]@{}
    foreach ($name in ($names+@('ReleaseTools.psm1','Update-Notifica.ps1','install-request.example.json'))) { $files[$name]=(Get-FileHash (Join-Path $package $name)).Hash.ToLowerInvariant() }
    Save-ReleaseJson (Join-Path $package 'distribution.json') @{format=2;version='0.13.0';mode='operator-managed-unsigned';files=$files;payloadSha256=(Get-FileHash (Join-Path $package 'payload.zip')).Hash.ToLowerInvariant()}
    $hash=(Get-FileHash (Join-Path $package 'distribution.json')).Hash.ToLowerInvariant()
    $configPath=Join-Path $data 'config.json'; $recordPath=Join-Path $data 'managed-installation.json'
    $key=[Guid]::NewGuid().ToString(); $userSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $config=[pscustomobject]@{serverUrl='https://test.invalid/';allowedUserSid=$userSid;dataDirectory=$state;machineKey=$true;keyName=$key;
        pkcs11Library='C:\Unused\token.dll';certificateFingerprint=('a'*64);receiverDirectory=(Join-Path $base 'Documents');
        signingEngine=[pscustomobject]@{javaExecutable=(Join-Path $oldTarget 'java\bin\java.exe');bridgeJar=(Join-Path $oldTarget 'engine\notifica-dss-6.5.jar');librariesDirectory=(Join-Path $oldTarget 'engine\lib');
            outputDirectory=(Join-Path $state 'signed');timestampUrl='https://tsa.invalid/';timestampPolicyOid=$null;trustedCertificateFiles=@('C:\Trust\certificate.cer')}}
    $record=[pscustomobject]@{mode='operator-managed-unsigned';status='installed';version='0.12.0';target=$oldTarget;keyName=$key;manifestSha256=('a'*64);requestSha256=('b'*64)}
    Save-ReleaseJson $configPath $config; Save-ReleaseJson $recordPath $record
    $originalConfig=(Get-FileHash $configPath).Hash
    $identity=Join-Path $state 'identity.json'; $pdf=Join-Path $base 'old-document.pdf'
    [IO.File]::WriteAllText($identity,'original device enrollment'); [IO.File]::WriteAllText($pdf,'%PDF-preserved bytes')
    $oldPath='"'+$oldExe+'" --service --config "'+$configPath+'"'
    $global:fixture=@{base=$base;scenario=$scenario;programFiles=$programFiles;programData=$programData;state=$state;configPath=$configPath;injected=$false;
        service=[pscustomobject]@{PathName=$oldPath;StartName='NT SERVICE\NotificaSigningAgent';State='Running';ProcessId=7001};
        task=[pscustomobject]@{Actions=@([pscustomobject]@{Execute=$oldExe;Arguments=('--config "'+$configPath+'"')});Principal=[pscustomobject]@{UserId=$userSid};Settings=[pscustomobject]@{Enabled=$true}};taskRunning=$true}
    Save-ReleaseJson (Join-Path $state 'service-ready.json') @{processId=7001;version='0.12.0';at=[DateTimeOffset]::UtcNow.ToString('O')}
    $arguments=@{ExpectedManifestSha256=$hash}
    if ($scenario -eq 'preflight') { $arguments.Preflight=$true }
    if ($scenario -eq 'wrong-service') { $global:fixture.service.StartName='LocalSystem' }
    if ($scenario -eq 'wrong-task') { $global:fixture.task.Actions[0].Execute='C:\Unrelated\app.exe' }
    if ($scenario -eq 'recover') {
        $target=Join-Path $root ('versions\0.13.0-'+('c'*32)); $candidate=Join-Path $target 'agent\Notifica.Agent.exe'
        Save-ReleaseJson (Join-Path $data 'managed-update.json') @{format=1;manifestSha256=$hash;installation=$record;configuration=$config;taskXml=($global:fixture.task | ConvertTo-Json -Depth 20);candidateTarget=$target}
        Save-ReleaseJson $configPath (New-ManagedUpdateConfiguration $config $target)
        $global:fixture.service.PathName='"'+$candidate+'" --service --config "'+$configPath+'"'
        $global:fixture.task.Actions[0].Execute=$candidate; $global:fixture.task.Settings.Enabled=$false
        $arguments.Recover=$true
    }
    $actual=(& (Join-Path $package 'Update-Notifica.ps1') @arguments | Out-String).Trim()
    $expected=switch ($scenario) {
        'preflight' {'PREFLIGHT_PASSED: 0.12.0 -> 0.13.0; no changes made'}
        'upgrade' {'UPDATED_TO_0_13_0_ENROLLMENT_PRESERVED'}
        'late-signing-work' {'REVIEW_ACTIVE_WORK'}
        'recovery-failure' {'RECOVERY_REQUIRED_JOURNAL_PRESERVED'}
        'recover' {'PREVIOUS_VERSION_RESTORED'}
        'wrong-service' {'SERVICE_OWNERSHIP_MISMATCH'}
        'wrong-task' {'TRAY_OWNERSHIP_MISMATCH'}
        default {'UPDATE_FAILED_PREVIOUS_VERSION_RESTORED'}
    }
    if ($actual -cne $expected) { throw "Scenario $scenario expected $expected but got $actual" }
    if ($scenario -eq 'upgrade') {
        if ((Read-UpdateJson $recordPath).version -ne '0.13.0' -or $global:fixture.service.PathName -notlike '*0.13.0-*') { throw 'ENTRY_COMMIT_FAILED' }
        # Rerunning an already-installed package must be harmless.
        $again=(& (Join-Path $package 'Update-Notifica.ps1') @arguments | Out-String).Trim()
        if ($again -cne 'ALREADY_INSTALLED') { throw 'IDEMPOTENCY_FAILED' }
    } elseif ($scenario -ne 'recovery-failure') {
        if ((Get-FileHash $configPath).Hash -cne $originalConfig -or (Read-UpdateJson $recordPath).version -cne '0.12.0') { throw 'ENTRY_ORIGINAL_SETTINGS_CHANGED' }
    }
    if ($scenario -eq 'recovery-failure' -and -not (Test-Path (Join-Path $data 'managed-update.json'))) { throw 'RECOVERY_CHECKPOINT_MISSING' }
    if ($scenario -eq 'late-signing-work' -and (Get-Content (Join-Path $state 'signing-work.json') -Raw) -cne 'preserve uncertain signing work') { throw 'WORK_NOT_PRESERVED' }
    if ((Get-Content $identity -Raw) -cne 'original device enrollment' -or (Get-Content $pdf -Raw) -cne '%PDF-preserved bytes') { throw 'USER_DATA_CHANGED' }
    $checks.Add($scenario)
}
@{passed=$checks.Count;checks=$checks;scmAndTaskSchedulerSimulated=$true;productionInstallationModified=$false} | ConvertTo-Json | Set-Content (Join-Path $run 'results.json') -Encoding UTF8
Write-Output "$($checks.Count) full entry-script scenarios passed with isolated Windows-operation shims"
Write-Output (Join-Path $run 'results.json')
