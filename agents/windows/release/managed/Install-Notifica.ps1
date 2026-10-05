#Requires -Version 5.1
# Unsigned, operator-managed installation. No Authenticode publisher claim.
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$RequestFile,
    [Parameter(Mandatory)][string]$ExpectedManifestSha256,
    [switch]$Preflight,
    [switch]$Resume
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'ReleaseTools.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'ManagedDistribution.psm1') -Force
$lease=$null
try {
    $package=Read-ManagedDistribution $PSScriptRoot $ExpectedManifestSha256
    $request=Read-ManagedRequest $RequestFile
    $requestHash=(Get-FileHash -LiteralPath $RequestFile -Algorithm SHA256).Hash.ToLowerInvariant()
    $root=Assert-LocalPath (Join-Path ([Environment]::GetFolderPath('ProgramFiles')) 'NotificaIA\Agent')
    $data=Assert-LocalPath (Join-Path ([Environment]::GetFolderPath('CommonApplicationData')) 'NotificaIA\Agent')
    $state=Join-Path $data 'state'; $configPath=Join-Path $data 'config.json'
    $recordPath=Join-Path $data 'managed-installation.json'
    $serviceName='NotificaSigningAgent'; $taskName='NotificaSigningTray'
    $sc=Join-Path ([Environment]::GetFolderPath('System')) 'sc.exe'
    $record=$null
    if ($Resume) {
        $record=Get-Content -LiteralPath $recordPath -Raw | ConvertFrom-Json
        Assert-ManagedResume $record $ExpectedManifestSha256 $requestHash
        if (Test-Path -LiteralPath (Join-Path $state 'signing-work.json')) { throw 'REVIEW_ACTIVE_WORK' }
    } elseif ((Test-Path -LiteralPath $root) -or (Test-Path -LiteralPath $data) -or
        (Get-Service $serviceName -ErrorAction SilentlyContinue) -or (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue)) {
        throw 'EXISTING_INSTALLATION_REQUIRES_SEPARATE_UPDATE'
    }
    $prepared=Test-InitialRequest $request $root $data ([bool]$Resume)
    if (-not [Environment]::Is64BitProcess -or [Environment]::OSVersion.Version.Build -lt 22000) { throw 'WINDOWS_ELEVEN_X64_REQUIRED' }
    if ([IO.DriveInfo]::new([IO.Path]::GetPathRoot($prepared.receiver)).DriveFormat -ine 'NTFS') { throw 'CLOUD_FOLDER_REQUIRES_NTFS' }
    if ($Preflight) { Write-Output 'PREFLIGHT_PASSED_NO_INSTALLATION_PERFORMED'; exit 0 }
    if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'ADMINISTRATOR_REQUIRED' }
    # Persistent machine identity and documents are never deleted on failure.
    $serviceSidOutput=& $sc showsid $serviceName
    if ($LASTEXITCODE -ne 0) { throw 'SERVICE_SID_UNAVAILABLE' }
    $serviceSid=[regex]::Match(($serviceSidOutput -join ' '),'S-1-5-80-(?:\d+-){4}\d+').Value
    if (-not $serviceSid) { throw 'SERVICE_SID_UNAVAILABLE' }
    foreach ($path in @($root,$data)) {
        New-Item -ItemType Directory -Path $path -Force | Out-Null
        Set-ReleaseAcl $path @($prepared.sid.Value,$serviceSid)
    }
    try { $lease=[IO.File]::Open((Join-Path $data 'managed-setup.lock'),'OpenOrCreate','ReadWrite','None') } catch { throw 'SETUP_ALREADY_RUNNING' }
    if (-not $Resume) {
        if (Test-Path -LiteralPath $recordPath) { throw 'EXISTING_INSTALLATION_REQUIRES_SEPARATE_UPDATE' }
        $record=[pscustomobject]@{mode='operator-managed-unsigned';status='installing';version=$package.version;
            manifestSha256=$ExpectedManifestSha256;requestSha256=$requestHash;keyName=[Guid]::NewGuid().ToString();
            target=(Join-Path $root ('versions\'+$package.version+'-'+[Guid]::NewGuid().ToString('N')));createdAt=[DateTimeOffset]::UtcNow.ToString('O')}
        Save-ReleaseJson $recordPath $record
    }
    $target=Assert-LocalPath $record.target
    if (-not $target.StartsWith($root+'\versions\',[StringComparison]::OrdinalIgnoreCase)) { throw 'INVALID_INSTALLATION_TARGET' }
    $executable=Join-Path $target 'agent\Notifica.Agent.exe'
    $existingService=Get-CimInstance Win32_Service -Filter "Name='NotificaSigningAgent'"
    if ($existingService) {
        Assert-ServiceOwnership $existingService @($executable) $configPath
        Stop-Service $serviceName -ErrorAction Stop
        (Get-Service $serviceName).WaitForStatus('Stopped',[TimeSpan]::FromSeconds(30))
    }
    # Extraction checkpoint: incomplete directories are retained and a new target
    # is allocated on resume; never trust or recursively delete partial payloads.
    $complete=Join-Path $target 'payload-verified.txt'
    if (-not (Test-Path -LiteralPath $complete)) {
        if (Test-Path -LiteralPath $target) {
            if ($existingService) { throw 'PARTIAL_PAYLOAD_WITH_SERVICE_REQUIRES_REVIEW' }
            $target=Join-Path $root ('versions\'+$package.version+'-'+[Guid]::NewGuid().ToString('N'))
            $record.target=$target; Save-ReleaseJson $recordPath $record
            $executable=Join-Path $target 'agent\Notifica.Agent.exe'
        }
        Expand-VerifiedPayload (Join-Path $PSScriptRoot 'payload.zip') $package.payloadSha256 $target
        [IO.File]::WriteAllText((Join-Path $target 'payload-verified.txt'),$package.payloadSha256)
    } elseif ((Get-Content -LiteralPath $complete -Raw) -cne $package.payloadSha256) { throw 'INSTALLED_PAYLOAD_MISMATCH' }
    if ([version](Get-Item -LiteralPath $executable).VersionInfo.ProductVersion.Split('+')[0] -ne [version]$package.version) { throw 'PAYLOAD_VERSION_MISMATCH' }
    New-Item -ItemType Directory -Path $state -Force | Out-Null; Set-ReleaseAcl $state @() $serviceSid
    New-Item -ItemType Directory -Path $prepared.receiver -Force | Out-Null; Set-ReleaseAcl $prepared.receiver @($prepared.sid.Value) $serviceSid
    $config=[ordered]@{serverUrl=$request.serverUrl;allowedUserSid=$prepared.sid.Value;dataDirectory=$state;keyName=$record.keyName;
        machineKey=$true;pkcs11Library=$prepared.driver;certificateFingerprint=$request.certificateFingerprint;receiverDirectory=$prepared.receiver}
    if ($request.enableSigning) {
        $trust=Join-Path $data 'trust'; New-Item -ItemType Directory -Path $trust -Force | Out-Null
        $trusted=@(); $index=0
        foreach ($certificate in $prepared.certificates) { $path=Join-Path $trust ((++$index).ToString()+'.cer'); [IO.File]::WriteAllBytes($path,$certificate); $trusted+=$path }
        $config.signingEngine=@{javaExecutable=(Join-Path $target 'java\bin\java.exe');bridgeJar=(Join-Path $target 'engine\notifica-dss-6.5.jar');
            librariesDirectory=(Join-Path $target 'engine\lib');outputDirectory=(Join-Path $state 'signed');trustedCertificateFiles=$trusted;
            timestampUrl=$request.timestampUrl;timestampPolicyOid=$request.timestampPolicyOid}
    }
    Save-ReleaseJson $configPath $config
    function Invoke-Agent([string]$Action) {
        $process=Start-Process -FilePath $executable -ArgumentList @($Action,'--config',('"'+$configPath+'"')) -WindowStyle Hidden -PassThru
        if (-not $process.WaitForExit(60000)) { $process.Kill(); throw 'AGENT_OPERATION_TIMEOUT' }
        if ($process.ExitCode -ne 0) { throw 'AGENT_OPERATION_FAILED' }
    }
    function Invoke-Sc([string[]]$Arguments) { & $sc @Arguments | Out-Null; if ($LASTEXITCODE -ne 0) { throw 'SERVICE_CONFIGURATION_FAILED' } }
    Invoke-Agent '--validate-config'
    if (-not $existingService) {
        Invoke-Sc @('create',$serviceName,'binPath=',('"'+$executable+'" --service --config "'+$configPath+'"'),'start=','delayed-auto','obj=',('NT SERVICE\'+$serviceName),'DisplayName=','NOTIFICA IA Signing Agent')
    }
    Invoke-Sc @('sidtype',$serviceName,'unrestricted')
    Invoke-Sc @('failure',$serviceName,'reset=','86400','actions=','restart/10000/restart/30000/restart/60000')
    Invoke-Sc @('failureflag',$serviceName,'1')
    Invoke-Agent '--repair-service-key'
    $task=Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($task -and (@($task.Actions).Count -ne 1 -or $task.Actions[0].Execute -cne $executable -or $task.Actions[0].Arguments -cne ('--config "'+$configPath+'"'))) { throw 'TRAY_OWNERSHIP_MISMATCH' }
    $action=New-ScheduledTaskAction -Execute $executable -Argument ('--config "'+$configPath+'"')
    $trigger=New-ScheduledTaskTrigger -AtLogOn -User $prepared.account
    $principal=New-ScheduledTaskPrincipal -UserId $prepared.account -LogonType Interactive -RunLevel Limited
    $settings=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
    Start-Service $serviceName
    $deadline=[DateTimeOffset]::UtcNow.AddSeconds(30); $ready=$false
    do {
        $service=Get-CimInstance Win32_Service -Filter "Name='NotificaSigningAgent'"; $markerPath=Join-Path $state 'service-ready.json'
        if ($service.State -eq 'Running' -and (Test-Path -LiteralPath $markerPath)) {
            $marker=Get-Content -LiteralPath $markerPath -Raw | ConvertFrom-Json
            if ($marker.processId -eq $service.ProcessId -and $marker.version -ceq $package.version -and [DateTimeOffset]::Parse($marker.at) -gt [DateTimeOffset]::UtcNow.AddMinutes(-2)) { $ready=$true; break }
        }
        Start-Sleep -Milliseconds 250
    } while ([DateTimeOffset]::UtcNow -lt $deadline)
    if (-not $ready) { throw 'SERVICE_READINESS_FAILED' }
    $record.status='installed'; Save-ReleaseJson $recordPath $record
    Start-ScheduledTask -TaskName $taskName
    Write-Output 'INSTALLED_ENROLLMENT_REQUIRED'
} catch {
    $code=if ($_.Exception.Message -cmatch '^[A-Z][A-Z_]{3,90}$') { $_.Exception.Message } else { 'MANAGED_INSTALLATION_FAILED' }
    Write-Output $code
    exit 1
} finally { if ($lease) { $lease.Dispose() } }
