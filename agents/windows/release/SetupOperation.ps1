# Embedded in the Authenticode bootstrapper. Never distributed as a bypass installer.
#Requires -Version 5.1
#Requires -RunAsAdministrator
param([Parameter(Mandatory)][string]$RequestFile, [Parameter(Mandatory)][string]$PublisherSha256,
      [Parameter(Mandatory)][string]$Bootstrapper)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'ReleaseTools.psm1') -Force
$setupLease=$null
try {
    Assert-Publisher $Bootstrapper $PublisherSha256
    try { $setupLease=[IO.File]::Open((Join-Path (Split-Path -Parent $PSScriptRoot) 'setup.lock'),'OpenOrCreate','ReadWrite','None') }
    catch { throw 'SETUP_ALREADY_RUNNING' }
    if ((Get-Item -LiteralPath $RequestFile).Length -gt 65536) { throw 'REQUEST_TOO_LARGE' }
    $request = Get-Content -LiteralPath $RequestFile -Raw | ConvertFrom-Json
    if ($request.action -notin @('install','update','rollback','uninstall','repair')) { throw 'INVALID_ACTION' }
    $root = Assert-LocalPath (Join-Path ([Environment]::GetFolderPath('ProgramFiles')) 'NotificaIA\Agent')
    $data = Assert-LocalPath (Join-Path ([Environment]::GetFolderPath('CommonApplicationData')) 'NotificaIA\Agent')
    $state = Join-Path $data 'state'; $configPath = Join-Path $data 'config.json'
    $installedPath = Join-Path $data 'installation.json'
    $journalPath = Join-Path $data 'installation-transaction.json'
    $initialPath = Join-Path $data 'installation-initial.json'
    $name = 'NotificaSigningAgent'; $taskName = 'NotificaSigningTray'
    $sc = Join-Path ([Environment]::GetFolderPath('System')) 'sc.exe'
    $uninstallRegistry='HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\NotificaSigningAgent'
    $installed = if (Test-Path -LiteralPath $installedPath) { Get-Content -LiteralPath $installedPath -Raw | ConvertFrom-Json } else { $null }
    $initial = if (Test-Path -LiteralPath $initialPath) { Get-Content -LiteralPath $initialPath -Raw | ConvertFrom-Json } else { $null }
    $executable=$null; $recoveryExecutable=$null
    if ($installed -and $installed.publisherSha256 -cne $PublisherSha256) { throw 'PUBLISHER_CHANGE_REJECTED' }
    if ($initial -and $request.action -ne 'repair') { throw 'RECOVER_INITIAL_INSTALLATION_FIRST' }
    if ($request.action -eq 'install') {
        if ($installed -or (Test-Path -LiteralPath $root) -or (Test-Path -LiteralPath $data) -or
            (Get-Service $name -ErrorAction SilentlyContinue) -or (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue)) { throw 'EXISTING_INSTALLATION' }
        $prepared=Test-InitialRequest $request $root $data
        $userSid=$prepared.sid; $account=$prepared.account
    } else {
        if (-not $installed -and -not $initial) { throw 'MANAGED_INSTALLATION_REQUIRED' }
        if ($initial) {
            if ($initial.kind -ne 'initial' -or $initial.record.installation.publisherSha256 -cne $PublisherSha256) { throw 'PUBLISHER_CHANGE_REJECTED' }
            $config=$initial.record.configuration
            $originalConfig=$config | ConvertTo-Json -Depth 20
        } else { $originalConfig=Get-Content -LiteralPath $configPath -Raw; $config=$originalConfig | ConvertFrom-Json }
        $userSid = [Security.Principal.SecurityIdentifier]::new($config.allowedUserSid)
        $account = $userSid.Translate([Security.Principal.NTAccount]).Value
        # Unresolved work is deliberately preserved and blocks removal/replacement.
        if (Test-Path -LiteralPath (Join-Path $state 'signing-work.json')) { throw 'REVIEW_ACTIVE_WORK' }
    }
    function Invoke-Checked([string]$File, [string[]]$Arguments) {
        & $File @Arguments | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'SYSTEM_OPERATION_FAILED' }
    }
    function Stop-Installed {
        $allowed=@(); if ($executable) { $allowed+=$executable }; if ($installed) { $allowed+=$installed.executable }; if ($recoveryExecutable) { $allowed+=$recoveryExecutable }
        $task=Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
        if ($task) {
            if (@($task.Actions).Count -ne 1 -or $task.Actions[0].Execute -notin $allowed -or $task.Actions[0].Arguments -cne ('--config "'+$configPath+'"')) { throw 'TRAY_OWNERSHIP_MISMATCH' }
            Stop-ScheduledTask -TaskName $taskName -ErrorAction Stop
        }
        $service=Get-CimInstance Win32_Service -Filter "Name='NotificaSigningAgent'"
        if ($service) {
            Assert-ServiceOwnership $service $allowed $configPath
            Stop-Service $name -ErrorAction Stop
            (Get-Service $name).WaitForStatus('Stopped', [TimeSpan]::FromSeconds(30))
        }
        # Task termination targets only our registered tray. Never kill token-driver processes.
    }
    function Set-ServicePayload([string]$Executable) {
        $binaryPath = '"' + $Executable + '" --service --config "' + $configPath + '"'
        Invoke-Checked $sc @('config',$name,'binPath=',$binaryPath)
        $action = New-ScheduledTaskAction -Execute $Executable -Argument ('--config "' + $configPath + '"')
        $trigger = New-ScheduledTaskTrigger -AtLogOn -User $account
        $principal = New-ScheduledTaskPrincipal -UserId $account -LogonType Interactive -RunLevel Limited
        $settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
        Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
    }
    function Invoke-Agent([string]$Executable, [string]$Action) {
        $process = Start-Process -FilePath $Executable -ArgumentList @($Action,'--config',('"'+$configPath+'"')) -WindowStyle Hidden -PassThru
        if (-not $process.WaitForExit(60000)) { $process.Kill(); throw 'AGENT_OPERATION_TIMEOUT' }
        if ($process.ExitCode -ne 0) { throw 'AGENT_OPERATION_FAILED' }
    }
    function Ensure-ServiceFoundation([string]$Executable) {
        $service=Get-CimInstance Win32_Service -Filter "Name='NotificaSigningAgent'"
        if ($service) { Assert-ServiceOwnership $service @($Executable) $configPath }
        else {
            $binaryPath='"'+$Executable+'" --service --config "'+$configPath+'"'
            Invoke-Checked $sc @('create',$name,'binPath=',$binaryPath,'start=','delayed-auto','obj=',('NT SERVICE\'+$name),'DisplayName=','NOTIFICA IA Signing Agent')
        }
        Invoke-Checked $sc @('sidtype',$name,'unrestricted')
        Invoke-Checked $sc @('failure',$name,'reset=','86400','actions=','restart/10000/restart/30000/restart/60000')
        Invoke-Checked $sc @('failureflag',$name,'1')
        Invoke-Agent $Executable '--repair-service-key'
    }
    function Register-Removal($Installation) {
        $uninstallRequest=Join-Path $data 'uninstall-request.json'
        Save-ReleaseJson $uninstallRequest @{action='uninstall'}
        New-Item -Path $uninstallRegistry -Force | Out-Null
        $values=@{DisplayName='NOTIFICA IA Signing Agent';DisplayVersion=$Installation.version;Publisher='NOTIFICA IA';
            InstallLocation=$root;UninstallString=('"'+$Installation.setupExecutable+'" --request "'+$uninstallRequest+'"')}
        foreach ($entry in $values.GetEnumerator()) { New-ItemProperty -Path $uninstallRegistry -Name $entry.Key -Value $entry.Value -PropertyType String -Force | Out-Null }
        foreach ($entry in @('NoModify','NoRepair')) { New-ItemProperty -Path $uninstallRegistry -Name $entry -Value 1 -PropertyType DWord -Force | Out-Null }
    }
    function Confirm-ServiceReady([string]$ExpectedVersion) {
        $deadline=[DateTimeOffset]::UtcNow.AddSeconds(30)
        do {
            $service=Get-CimInstance Win32_Service -Filter "Name='NotificaSigningAgent'"
            $markerPath=Join-Path $state 'service-ready.json'
            if ($service.State -eq 'Running' -and (Test-Path -LiteralPath $markerPath)) {
                $marker=Get-Content -LiteralPath $markerPath -Raw | ConvertFrom-Json
                if ($marker.processId -eq $service.ProcessId -and $marker.version -ceq $ExpectedVersion -and
                    [DateTimeOffset]::Parse($marker.at) -gt [DateTimeOffset]::UtcNow.AddMinutes(-2)) { return }
            }
            Start-Sleep -Milliseconds 250
        } while ([DateTimeOffset]::UtcNow -lt $deadline)
        throw 'SERVICE_READINESS_FAILED'
    }
    if ($request.action -eq 'repair') {
        if ($initial) {
            $record=$initial.record.installation
            $executable=Assert-LocalPath $record.executable
            if (-not $executable.StartsWith($root.TrimEnd('\')+'\versions\',[StringComparison]::OrdinalIgnoreCase) -or
                $config.dataDirectory -ine $state) { throw 'INVALID_INITIAL_CHECKPOINT' }
            Assert-Publisher $executable $PublisherSha256
            Assert-Publisher (Join-Path (Split-Path $executable) 'Notifica.Agent.dll') $PublisherSha256
            Assert-Publisher $record.setupExecutable $PublisherSha256
            Stop-Installed
            if (Test-Path -LiteralPath (Join-Path $state 'signing-work.json')) { throw 'REVIEW_ACTIVE_WORK' }
            Save-ReleaseJson $configPath $config
            Invoke-Agent $executable '--validate-config'
            Ensure-ServiceFoundation $executable
            Set-ServicePayload $executable
            Start-Service $name
            Confirm-ServiceReady $record.version
            Save-ReleaseJson $installedPath $record
            Register-Removal $record
            Start-ScheduledTask -TaskName $taskName
            Remove-Item -LiteralPath $initialPath
            Write-Output 'INITIAL_INSTALLATION_RESUMED'
            exit 0
        }
        if (-not (Test-Path -LiteralPath $journalPath)) { throw 'NO_INTERRUPTED_UPGRADE' }
        $previous=(Get-Content -LiteralPath $journalPath -Raw | ConvertFrom-Json).previous
        if ($previous.PSObject.Properties.Name -contains 'candidateExecutable') { $executable=$previous.candidateExecutable }
        if ($previous.installation.publisherSha256 -cne $PublisherSha256) { throw 'PUBLISHER_CHANGE_REJECTED' }
        $recoveryExecutable=$previous.installation.executable
        Assert-Publisher $previous.installation.executable $PublisherSha256
        Assert-Publisher (Join-Path (Split-Path $previous.installation.executable) 'Notifica.Agent.dll') $PublisherSha256
        Assert-Publisher $previous.installation.setupExecutable $PublisherSha256
        Stop-Installed
        if (Test-Path -LiteralPath (Join-Path $state 'signing-work.json')) { throw 'REVIEW_ACTIVE_WORK' }
        Save-ReleaseJson $configPath $previous.configuration
        Set-ServicePayload $previous.installation.executable
        Start-Service $name
        Confirm-ServiceReady $previous.installation.version
        Save-ReleaseJson $installedPath $previous.installation
        Register-Removal $previous.installation
        Remove-Item -LiteralPath $journalPath
        Start-ScheduledTask -TaskName $taskName
        Write-Output 'PREVIOUS_INSTALLATION_RESTORED'
        exit 0
    }
    if (Test-Path -LiteralPath $journalPath) { throw 'RECOVER_PREVIOUS_INSTALLATION_FIRST' }
    if ($request.action -eq 'uninstall') {
        Stop-Installed
        if (Test-Path -LiteralPath (Join-Path $state 'signing-work.json')) { Start-Service $name; throw 'REVIEW_ACTIVE_WORK' }
        try { Invoke-Agent $installed.executable '--retire' } catch { Start-Service $name -ErrorAction SilentlyContinue; throw 'REVOCATION_NOT_CONFIRMED_INSTALLATION_PRESERVED' }
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
        Invoke-Checked $sc @('delete',$name)
        if (Test-Path -LiteralPath $uninstallRegistry) { Remove-Item -LiteralPath $uninstallRegistry }
        $installed | Add-Member -NotePropertyName retiredAt -NotePropertyValue ([DateTimeOffset]::UtcNow.ToString('O')) -Force
        Save-ReleaseJson $installedPath $installed
        # Retain binaries, config, source/output PDFs and manifests for recovery/audit.
        # No recursive removal and no receiver-folder operation occurs on uninstall.
        Write-Output 'REMOVED_CREDENTIAL_REVOKED_DOCUMENTS_PRESERVED'
        exit 0
    }
    $release = Read-Release $request.releaseDirectory $PublisherSha256
    $currentVersion = if ($installed) { $installed.version } else { '' }
    Assert-ReleaseTarget $release $currentVersion ([Environment]::MachineName)
    if (($request.action -eq 'rollback') -ne ($release.Kind -eq 'rollback')) { throw 'RELEASE_ACTION_MISMATCH' }
    if ($installed -and [version]$release.Version -lt [version]$installed.minimumVersion) { throw 'ROLLBACK_BELOW_INSTALLED_FLOOR' }
    $sidText = (& $sc showsid $name) -join ' '
    if ($LASTEXITCODE -ne 0) { throw 'SERVICE_SID_UNAVAILABLE' }
    $serviceSid = [regex]::Match($sidText,'S-1-5-80-(?:\d+-){4}\d+').Value
    if (-not $serviceSid) { throw 'SERVICE_SID_UNAVAILABLE' }
    foreach ($directory in @($root,$data)) {
        New-Item -ItemType Directory -Path $directory -Force | Out-Null
        Set-ReleaseAcl $directory @($userSid.Value,$serviceSid)
    }
    if (-not (Test-Path -LiteralPath $state)) { New-Item -ItemType Directory -Path $state | Out-Null; Set-ReleaseAcl $state @() $serviceSid }
    $target = Join-Path $root ('versions\' + $release.Version + '-' + [Guid]::NewGuid().ToString('N'))
    Expand-VerifiedPayload (Join-Path $request.releaseDirectory 'payload.zip') $release.PayloadSha256 $target
    $executable = Join-Path $target 'agent\Notifica.Agent.exe'
    Assert-Publisher $executable $PublisherSha256
    Assert-Publisher (Join-Path $target 'agent\Notifica.Agent.dll') $PublisherSha256
    $setupExecutable=Join-Path $target 'Notifica.Setup.exe'
    Copy-Item -LiteralPath $Bootstrapper -Destination $setupExecutable
    Assert-Publisher $setupExecutable $PublisherSha256
    if ([version](Get-Item -LiteralPath $executable).VersionInfo.ProductVersion.Split('+')[0] -ne [version]$release.Version) { throw 'PAYLOAD_VERSION_MISMATCH' }
    if ($request.action -eq 'install') {
        $receiver = $prepared.receiver
        if (Test-Path -LiteralPath $receiver) { throw 'CHOOSE_NEW_RECEIVER_DIRECTORY' }
        New-Item -ItemType Directory -Path $receiver | Out-Null
        Set-ReleaseAcl $receiver @($userSid.Value) $serviceSid
        $config = [ordered]@{ serverUrl=$request.serverUrl; allowedUserSid=$userSid.Value; dataDirectory=$state;
            keyName=[Guid]::NewGuid().ToString(); machineKey=$true; pkcs11Library=$prepared.driver;
            certificateFingerprint=$request.certificateFingerprint; receiverDirectory=$receiver }
        if ($request.enableSigning) {
            $trust = Join-Path $data 'trust'; New-Item -ItemType Directory -Path $trust | Out-Null
            $trusted = @(); $index=0
            foreach ($certificate in $prepared.certificates) {
                $path=Join-Path $trust ((++$index).ToString()+'.cer'); [IO.File]::WriteAllBytes($path,$certificate); $trusted+=$path
            }
            $config.signingEngine = @{ javaExecutable=(Join-Path $target 'java\bin\java.exe'); bridgeJar=(Join-Path $target 'engine\notifica-dss-6.5.jar');
                librariesDirectory=(Join-Path $target 'engine\lib'); outputDirectory=(Join-Path $state 'signed'); trustedCertificateFiles=$trusted;
                timestampUrl=$request.timestampUrl; timestampPolicyOid=$request.timestampPolicyOid }
        }
        Save-ReleaseJson $configPath $config
        Invoke-Agent $executable '--validate-config'
    } else {
        if ($config.PSObject.Properties.Name -contains 'signingEngine' -and $config.signingEngine) {
            $config.signingEngine.javaExecutable = Join-Path $target 'java\bin\java.exe'
            $config.signingEngine.bridgeJar = Join-Path $target 'engine\notifica-dss-6.5.jar'
            $config.signingEngine.librariesDirectory = Join-Path $target 'engine\lib'
        }
    }
    $activate = {
        Stop-Installed
        # A claim can arrive during package verification; fence again after stop.
        if (Test-Path -LiteralPath (Join-Path $state 'signing-work.json')) { throw 'REVIEW_ACTIVE_WORK' }
        Save-ReleaseJson $configPath $config
        Invoke-Agent $executable '--validate-config'
        Set-ServicePayload $executable
        Start-Service $name
        (Get-Service $name).WaitForStatus('Running',[TimeSpan]::FromSeconds(30))
        Confirm-ServiceReady $release.Version
        $minimum = if ($installed -and [version]$installed.minimumVersion -gt [version]$release.MinimumVersion) { $installed.minimumVersion } else { $release.MinimumVersion }
        # Keep the record and Add/Remove Programs entry tied to the same payload.
        $installation=@{ version=$release.Version; minimumVersion=$minimum; publisherSha256=$PublisherSha256; executable=$executable; setupExecutable=$setupExecutable;
            previousExecutable=$(if($installed){$installed.executable}else{$null}); ring=$release.Ring; installedAt=[DateTimeOffset]::UtcNow.ToString('O') }
        Save-ReleaseJson $installedPath $installation
        Register-Removal $installation
        Start-ScheduledTask -TaskName $taskName
    }
    if ($installed) {
        Invoke-ReleaseSwitch $journalPath @{ installation=$installed; configuration=($originalConfig | ConvertFrom-Json);candidateExecutable=$executable } $activate {
            Stop-Installed
            Save-ReleaseJson $configPath ($originalConfig | ConvertFrom-Json)
            Set-ServicePayload $installed.executable
            Start-Service $name
            Confirm-ServiceReady $installed.version
            Save-ReleaseJson $installedPath $installed
            Register-Removal $installed
            Start-ScheduledTask -TaskName $taskName
        }
    } else {
        $record=@{configuration=$config;installation=@{version=$release.Version;minimumVersion=$release.MinimumVersion;publisherSha256=$PublisherSha256;
            executable=$executable;setupExecutable=$setupExecutable;previousExecutable=$null;ring=$release.Ring;installedAt=[DateTimeOffset]::UtcNow.ToString('O')}}
        try { Invoke-InitialInstallation $initialPath $record { Ensure-ServiceFoundation $executable } $activate }
        catch { Stop-Installed; throw }
    }
    Write-Output 'INSTALLATION_VERIFIED'
} catch {
    # Fixed diagnostics only. Never echo request/configuration or arbitrary errors.
    $code = if ($_.Exception.Message -cmatch '^[A-Z][A-Z_]{3,90}$') { $_.Exception.Message } else { 'SETUP_FAILED' }
    Write-Output $code
    exit 1
} finally { if ($setupLease) { $setupLease.Dispose() } }
