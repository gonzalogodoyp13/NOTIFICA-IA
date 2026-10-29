#Requires -Version 5.1
# Exercise the complete entry script with real isolated files and simulated SCM/
# Task Scheduler/process operations. Never operate on the installed service.
param([Parameter(Mandatory)][string]$OldAgentExe,[Parameter(Mandatory)][string]$NewAgentExe)
$ErrorActionPreference='Stop'; Set-StrictMode -Version Latest
$oldVersion = (Get-Item -LiteralPath $OldAgentExe).VersionInfo.ProductVersion.Split('+')[0]
$newVersion = (Get-Item -LiteralPath $NewAgentExe).VersionInfo.ProductVersion.Split('+')[0]
Import-Module (Join-Path $PSScriptRoot '../ReleaseTools.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'ManagedUpdate.psm1') -Force
$run=Join-Path ([IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../artifacts/managed-entry-tests'))) ([Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $run -Force | Out-Null
$source=Get-Content (Join-Path $PSScriptRoot 'Update-Notifica.ps1') -Raw -Encoding UTF8
function Get-FixtureTaskXml {
    $fixtureTask=$global:fixture.task
    return ('<Task xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task"><Principals><Principal id="Author"><UserId>'+ $global:fixture.securitySid +'</UserId></Principal></Principals><Settings><Enabled>'+ $fixtureTask.Settings.Enabled.ToString().ToLowerInvariant() +'</Enabled></Settings><Actions><Exec><Command>'+ [Security.SecurityElement]::Escape($fixtureTask.Actions[0].Execute) +'</Command><Arguments>'+ [Security.SecurityElement]::Escape($fixtureTask.Actions[0].Arguments) +'</Arguments></Exec></Actions></Task>')
}
$mocks=@'
function Get-CimInstance { param($ClassName,$Filter) return $global:fixture.service }
function Get-ScheduledTask { param($TaskName) return $global:fixture.task }
function Export-ScheduledTask { param($TaskName) return (Get-FixtureTaskXml) }
function Disable-ScheduledTask { param($TaskName) $global:fixture.task.Settings.Enabled=$false }
function Enable-ScheduledTask { param($TaskName) $global:fixture.task.Settings.Enabled=$true }
function Stop-ScheduledTask { param($TaskName) $global:fixture.taskRunning=$false }
function Start-ScheduledTask { param($TaskName) $global:fixture.taskRunning=$true }
function New-ScheduledTaskAction { param($Execute,$Argument) return [pscustomobject]@{Execute=$Execute;Arguments=$Argument} }
function Set-ScheduledTask { param($TaskName,$Action) $global:fixture.task.Actions=@($Action) }
function Register-ScheduledTask {
    param($TaskName,$Xml,[switch]$Force)
    $saved=[xml]$Xml
    $global:fixture.task=[pscustomobject]@{Actions=@([pscustomobject]@{Execute=$saved.Task.Actions.Exec.Command;Arguments=$saved.Task.Actions.Exec.Arguments});Principal=[pscustomobject]@{Id='Author';UserId='short-display-name'};Settings=[pscustomobject]@{Enabled=($saved.Task.Settings.Enabled -ceq 'true')}}
    $global:fixture.securitySid=$saved.Task.Principals.Principal.UserId
}
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
    $version=if ($global:fixture.service.PathName -like ('*'+$global:fixture.newVersion+'-*')) { $global:fixture.newVersion } else { $global:fixture.oldVersion }
    if ($version -eq $global:fixture.newVersion -and $global:fixture.scenario -in @('start-failure','recovery-failure')) { throw 'SIMULATED_START_FAILURE' }
    if ($version -eq $global:fixture.oldVersion -and $global:fixture.scenario -eq 'recovery-failure') { throw 'SIMULATED_RESTORE_FAILURE' }
    $global:fixture.service.State='Running'
    Save-ReleaseJson (Join-Path $global:fixture.state 'service-ready.json') @{processId=7001;version=$version;at=[DateTimeOffset]::UtcNow.ToString('O')}
}
function Invoke-CimMethod {
    param($InputObject,$MethodName,$Arguments)
    if ($InputObject -ne $global:fixture.service -or $MethodName -cne 'Change' -or $Arguments.Count -ne 1 -or -not $Arguments.ContainsKey('PathName')) { throw 'UNEXPECTED_SERVICE_COMMAND' }
    if ($global:fixture.service.State -cne 'Stopped') { throw 'SERVICE_CHANGED_WHILE_RUNNING' }
    if (-not $global:fixture.injected -and $global:fixture.scenario -in @('service-change-failure','service-readback-failure')) {
        $global:fixture.injected=$true
        return [pscustomobject]@{ReturnValue=$(if($global:fixture.scenario -eq 'service-change-failure'){2}else{0})}
    }
    $global:fixture.service.PathName=$Arguments.PathName
    return [pscustomobject]@{ReturnValue=0}
}
function Set-ReleaseAcl { param($Path) if (-not $Path.StartsWith($global:fixture.base,[StringComparison]::OrdinalIgnoreCase)) { throw 'TEST_PATH_ESCAPE' } }
function Start-Process {
    param($FilePath,$ArgumentList,$WindowStyle,[switch]$PassThru)
    if ($ArgumentList[0] -cne '--validate-config' -or $WindowStyle -cne 'Hidden') { throw 'UNEXPECTED_PROCESS' }
    $config=Read-UpdateJson $global:fixture.configPath
    if ($config.signingEngine.javaExecutable -notlike ('*'+$global:fixture.newVersion+'-*')) { throw 'RUNTIME_NOT_SWITCHED' }
    $process=[pscustomobject]@{ExitCode=$(if($global:fixture.scenario -eq 'validation-failure'){1}else{0})}
    $process | Add-Member -MemberType ScriptMethod -Name WaitForExit -Value { param($timeout) return $true }
    return $process
}
'@
$replacements=@{
    "([Environment]::GetFolderPath('ProgramFiles'))"='$global:fixture.programFiles'
    "([Environment]::GetFolderPath('CommonApplicationData'))"='$global:fixture.programData'
    '([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)'='$true'
}
foreach ($entry in $replacements.GetEnumerator()) {
    if (-not $source.Contains($entry.Key)) { throw 'TEST_SEAM_CHANGED' }
    $source=$source.Replace($entry.Key,$entry.Value)
}
$source=$source.Replace('$lease=$null',('$lease=$null'+[Environment]::NewLine+$mocks))
$checks=[Collections.Generic.List[string]]::new()
foreach ($scenario in @('preflight','upgrade','validation-failure','service-change-failure','service-readback-failure','start-failure','stop-failure','late-signing-work','recovery-failure','recover','wrong-service','wrong-task','wrong-tray-user')) {
    $base=Join-Path $run $scenario; $package=Join-Path $base 'package'; $payload=Join-Path $base 'payload'
    $programFiles=Join-Path $base 'program-files'; $programData=Join-Path $base 'program-data'
    $root=Join-Path $programFiles 'NotificaIA\Agent'; $data=Join-Path $programData 'NotificaIA\Agent'; $state=Join-Path $data 'state'
    $oldTarget=Join-Path $root ('versions\'+$oldVersion+'-'+('a'*32)); $oldExe=Join-Path $oldTarget 'agent\Notifica.Agent.exe'
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
    Save-ReleaseJson (Join-Path $package 'distribution.json') @{format=2;version=$newVersion;mode='operator-managed-unsigned';files=$files;payloadSha256=(Get-FileHash (Join-Path $package 'payload.zip')).Hash.ToLowerInvariant()}
    $hash=(Get-FileHash (Join-Path $package 'distribution.json')).Hash.ToLowerInvariant()
    $configPath=Join-Path $data 'config.json'; $recordPath=Join-Path $data 'managed-installation.json'
    $key=[Guid]::NewGuid().ToString(); $userSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $config=[pscustomobject]@{serverUrl='https://test.invalid/';allowedUserSid=$userSid;dataDirectory=$state;machineKey=$true;keyName=$key;
        pkcs11Library='C:\Unused\token.dll';certificateFingerprint=('a'*64);receiverDirectory=(Join-Path $base 'Documents');
        signingEngine=[pscustomobject]@{javaExecutable=(Join-Path $oldTarget 'java\bin\java.exe');bridgeJar=(Join-Path $oldTarget 'engine\notifica-dss-6.5.jar');librariesDirectory=(Join-Path $oldTarget 'engine\lib');
            outputDirectory=(Join-Path $state 'signed');timestampUrl='https://tsa.invalid/';timestampPolicyOid=$null;trustedCertificateFiles=@('C:\Trust\certificate.cer')}}
    $record=[pscustomobject]@{mode='operator-managed-unsigned';status='installed';version=$oldVersion;target=$oldTarget;keyName=$key;manifestSha256=('a'*64);requestSha256=('b'*64)}
    Save-ReleaseJson $configPath $config; Save-ReleaseJson $recordPath $record
    $originalConfig=(Get-FileHash $configPath).Hash
    $identity=Join-Path $state 'identity.json'; $pdf=Join-Path $base 'old-document.pdf'
    [IO.File]::WriteAllText($identity,'original device enrollment'); [IO.File]::WriteAllText($pdf,'%PDF-preserved bytes')
    $oldPath='"'+$oldExe+'" --service --config "'+$configPath+'"'
    $global:fixture=@{base=$base;scenario=$scenario;oldVersion=$oldVersion;newVersion=$newVersion;programFiles=$programFiles;programData=$programData;state=$state;configPath=$configPath;injected=$false;
        service=[pscustomobject]@{PathName=$oldPath;StartName='NT SERVICE\NotificaSigningAgent';State='Running';ProcessId=7001};
        task=[pscustomobject]@{Actions=@([pscustomobject]@{Execute=$oldExe;Arguments=('--config "'+$configPath+'"')});Principal=[pscustomobject]@{Id='Author';UserId='short-display-name'};Settings=[pscustomobject]@{Enabled=$true}};taskRunning=$true;securitySid=$userSid}
    Save-ReleaseJson (Join-Path $state 'service-ready.json') @{processId=7001;version=$oldVersion;at=[DateTimeOffset]::UtcNow.ToString('O')}
    $arguments=@{ExpectedManifestSha256=$hash}
    if ($scenario -eq 'preflight') { $arguments.Preflight=$true }
    if ($scenario -eq 'wrong-service') { $global:fixture.service.StartName='LocalSystem' }
    if ($scenario -eq 'wrong-task') { $global:fixture.task.Actions[0].Execute='C:\Unrelated\app.exe' }
    if ($scenario -eq 'wrong-tray-user') { $global:fixture.securitySid='S-1-5-18' }
    if ($scenario -eq 'recover') {
        $target=Join-Path $root ('versions\'+$newVersion+'-'+('c'*32)); $candidate=Join-Path $target 'agent\Notifica.Agent.exe'
        Save-ReleaseJson (Join-Path $data 'managed-update.json') @{format=1;manifestSha256=$hash;installation=$record;configuration=$config;taskXml=(Get-FixtureTaskXml);candidateTarget=$target}
        Save-ReleaseJson $configPath (New-ManagedUpdateConfiguration $config $target)
        $global:fixture.service.PathName='"'+$candidate+'" --service --config "'+$configPath+'"'
        $global:fixture.task.Actions[0].Execute=$candidate; $global:fixture.task.Settings.Enabled=$false
        $arguments.Recover=$true
    }
    $actual=(& (Join-Path $package 'Update-Notifica.ps1') @arguments | Out-String).Trim()
    $expected=switch ($scenario) {
        'preflight' {"PREFLIGHT_PASSED: $oldVersion -> $newVersion; no changes made"}
        'upgrade' {'UPDATED_TO_'+$newVersion.Replace('.','_')+'_ENROLLMENT_PRESERVED'}
        'late-signing-work' {'REVIEW_ACTIVE_WORK'}
        'recovery-failure' {'RECOVERY_REQUIRED_JOURNAL_PRESERVED'}
        'recover' {'PREVIOUS_VERSION_RESTORED'}
        'wrong-service' {'SERVICE_OWNERSHIP_MISMATCH'}
        'wrong-task' {'TRAY_OWNERSHIP_MISMATCH'}
        'wrong-tray-user' {'TRAY_USER_MISMATCH'}
        default {'UPDATE_FAILED_PREVIOUS_VERSION_RESTORED'}
    }
    if ($actual -cne $expected) { throw "Scenario $scenario expected $expected but got $actual" }
    if ($scenario -eq 'upgrade') {
        if ((Read-UpdateJson $recordPath).version -ne $newVersion -or $global:fixture.service.PathName -notlike ('*'+$newVersion+'-*')) { throw 'ENTRY_COMMIT_FAILED' }
        # Rerunning an already-installed package must be harmless.
        $again=(& (Join-Path $package 'Update-Notifica.ps1') @arguments | Out-String).Trim()
        if ($again -cne 'ALREADY_INSTALLED') { throw 'IDEMPOTENCY_FAILED' }
    } elseif ($scenario -ne 'recovery-failure') {
        if ((Get-FileHash $configPath).Hash -cne $originalConfig -or (Read-UpdateJson $recordPath).version -cne $oldVersion) { throw 'ENTRY_ORIGINAL_SETTINGS_CHANGED' }
        if ($scenario -notin @('wrong-service','wrong-task','wrong-tray-user') -and
            ($global:fixture.service.PathName -cne $oldPath -or $global:fixture.service.State -cne 'Running' -or
             -not $global:fixture.task.Settings.Enabled -or -not $global:fixture.taskRunning)) { throw 'ENTRY_PREVIOUS_SERVICE_NOT_RESTORED' }
    }
    if ($scenario -eq 'recovery-failure' -and -not (Test-Path (Join-Path $data 'managed-update.json'))) { throw 'RECOVERY_CHECKPOINT_MISSING' }
    if ($scenario -eq 'late-signing-work' -and (Get-Content (Join-Path $state 'signing-work.json') -Raw) -cne 'preserve uncertain signing work') { throw 'WORK_NOT_PRESERVED' }
    if ((Get-Content $identity -Raw) -cne 'original device enrollment' -or (Get-Content $pdf -Raw) -cne '%PDF-preserved bytes') { throw 'USER_DATA_CHANGED' }
    $checks.Add($scenario)
}
@{passed=$checks.Count;checks=$checks;scmAndTaskSchedulerSimulated=$true;productionInstallationModified=$false} | ConvertTo-Json | Set-Content (Join-Path $run 'results.json') -Encoding UTF8
Write-Output "$($checks.Count) full entry-script scenarios passed with isolated Windows-operation shims"
Write-Output (Join-Path $run 'results.json')
