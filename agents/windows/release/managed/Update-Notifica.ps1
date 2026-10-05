#Requires -Version 5.1
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$ExpectedManifestSha256,
    [switch]$Preflight,
    [switch]$Recover
)
$ErrorActionPreference='Stop'; Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'ReleaseTools.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'ManagedDistribution.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'ManagedUpdate.psm1') -Force
$lease=$null
try {
    if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'ADMINISTRATOR_REQUIRED' }
    if (-not [Environment]::Is64BitProcess -or [Environment]::OSVersion.Version.Build -lt 22000) { throw 'WINDOWS_ELEVEN_X64_REQUIRED' }
    $package=Read-ManagedDistribution $PSScriptRoot $ExpectedManifestSha256
    if ($package.format -ne 2 -or $package.version -cne '0.13.0') { throw 'UPDATE_PACKAGE_REQUIRED' }
    $root=Assert-LocalPath (Join-Path ([Environment]::GetFolderPath('ProgramFiles')) 'NotificaIA\Agent')
    $data=Assert-LocalPath (Join-Path ([Environment]::GetFolderPath('CommonApplicationData')) 'NotificaIA\Agent')
    $state=Assert-LocalPath (Join-Path $data 'state')
    $configPath=Assert-LocalPath (Join-Path $data 'config.json')
    $recordPath=Assert-LocalPath (Join-Path $data 'managed-installation.json')
    $journalPath=Assert-LocalPath (Join-Path $data 'managed-update.json')
    $serviceName='NotificaSigningAgent'; $taskName='NotificaSigningTray'
    $sc=Join-Path ([Environment]::GetFolderPath('System')) 'sc.exe'
    if (Test-Path -LiteralPath (Join-Path $data 'installation.json')) { throw 'SIGNED_INSTALLATION_REQUIRES_SIGNED_UPDATER' }
    if (-not (Test-Path -LiteralPath $recordPath)) { throw 'MANAGED_INSTALLATION_REQUIRED' }
    if (-not $Preflight) {
        try { $lease=[IO.File]::Open((Join-Path $data 'managed-setup.lock'),'OpenOrCreate','ReadWrite','None') } catch { throw 'SETUP_ALREADY_RUNNING' }
    }
    $current=Read-UpdateJson $recordPath
    $currentConfig=Read-UpdateJson $configPath
    $checkpoint=$null
    if ($Recover) {
        if (-not (Test-Path -LiteralPath $journalPath)) { throw 'NO_INTERRUPTED_UPDATE' }
        $checkpoint=Read-UpdateJson $journalPath
        if ($checkpoint.format -ne 1 -or $checkpoint.manifestSha256 -cne $ExpectedManifestSha256) { throw 'RECOVERY_PACKAGE_MISMATCH' }
        $previous=$checkpoint.installation; $originalConfig=$checkpoint.configuration
        Assert-ManagedTarget $checkpoint.candidateTarget $root $package.version | Out-Null
    } else {
        if (Test-Path -LiteralPath $journalPath) { throw 'RECOVER_INTERRUPTED_UPDATE_FIRST' }
        if ($current.version -ceq $package.version -and $current.manifestSha256 -ceq $ExpectedManifestSha256 -and $current.status -ceq 'installed') {
            Write-Output 'ALREADY_INSTALLED'; exit 0
        }
        $previous=$current; $originalConfig=$currentConfig
    }
    Assert-ManagedUpdateSource $previous $originalConfig $root $data $package.version
    $oldExe=Assert-LocalPath (Join-Path $previous.target 'agent\Notifica.Agent.exe')
    if ([version](Get-Item -LiteralPath $oldExe).VersionInfo.ProductVersion.Split('+')[0] -ne [version]$previous.version) { throw 'INSTALLED_VERSION_MISMATCH' }
    $allowed=@($oldExe)
    if ($Recover) { $allowed+=Join-Path $checkpoint.candidateTarget 'agent\Notifica.Agent.exe' }
    $service=Get-CimInstance Win32_Service -Filter "Name='NotificaSigningAgent'"
    if (-not $service) { throw 'MANAGED_SERVICE_MISSING' }
    Assert-ServiceOwnership $service $allowed $configPath
    $task=Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
    if (@($task.Actions).Count -ne 1 -or $task.Actions[0].Execute -notin $allowed -or
        $task.Actions[0].Arguments -cne ('--config "'+$configPath+'"')) { throw 'TRAY_OWNERSHIP_MISMATCH' }
    $sid=[Security.Principal.SecurityIdentifier]::new($originalConfig.allowedUserSid)
    $account=$sid.Translate([Security.Principal.NTAccount]).Value
    $taskUser=$task.Principal.UserId
    if ($taskUser -ine $sid.Value -and $taskUser -ine $account) { throw 'TRAY_USER_MISMATCH' }
    if (-not $Recover -and -not $task.Settings.Enabled) { throw 'ENABLE_EXISTING_TRAY_BEFORE_UPDATE' }
    Assert-NoSigningWork $state
    $folder=if (Test-Path -LiteralPath (Join-Path $state 'receiver-folder.json')) { Read-UpdateJson (Join-Path $state 'receiver-folder.json') }
        elseif ($originalConfig.PSObject.Properties.Name -contains 'receiverDirectory' -and $originalConfig.receiverDirectory) { $originalConfig.receiverDirectory }
        else { Join-Path $state 'Firmados' }
    $folder=Assert-LocalPath $folder
    if ([IO.DriveInfo]::new([IO.Path]::GetPathRoot($folder)).DriveFormat -ine 'NTFS') { throw 'CLOUD_FOLDER_REQUIRES_NTFS' }
    if (-not $Recover) {
        $target=Join-Path $root ('versions\'+$package.version+'-'+[Guid]::NewGuid().ToString('N'))
        $checkpoint=[pscustomobject]@{format=1;manifestSha256=$ExpectedManifestSha256;installation=$previous;configuration=$originalConfig;
            taskXml=(Export-ScheduledTask -TaskName $taskName);candidateTarget=$target;startedAt=[DateTimeOffset]::UtcNow.ToString('O')}
    }
    $newExe=Join-Path $checkpoint.candidateTarget 'agent\Notifica.Agent.exe'
    if ($Preflight) { Write-Output ('PREFLIGHT_PASSED: '+$previous.version+' -> '+$package.version+'; no changes made'); exit 0 }
    function Invoke-Sc([string[]]$Arguments) { & $sc @Arguments | Out-Null; if ($LASTEXITCODE -ne 0) { throw 'SERVICE_CONFIGURATION_FAILED' } }
    function Stop-Installed {
        $owned=Get-CimInstance Win32_Service -Filter "Name='NotificaSigningAgent'"
        Assert-ServiceOwnership $owned @($oldExe,$newExe) $configPath
        $ownedTask=Get-ScheduledTask -TaskName $taskName
        if (@($ownedTask.Actions).Count -ne 1 -or $ownedTask.Actions[0].Execute -notin @($oldExe,$newExe) -or
            $ownedTask.Actions[0].Arguments -cne ('--config "'+$configPath+'"')) { throw 'TRAY_OWNERSHIP_MISMATCH' }
        Disable-ScheduledTask -TaskName $taskName | Out-Null
        Stop-ScheduledTask -TaskName $taskName
        Stop-Service $serviceName
        (Get-Service $serviceName).WaitForStatus('Stopped',[TimeSpan]::FromSeconds(30))
    }
    function Set-Payload([string]$Executable) {
        Invoke-Sc @('config',$serviceName,'binPath=',('"'+$Executable+'" --service --config "'+$configPath+'"'))
        $action=New-ScheduledTaskAction -Execute $Executable -Argument ('--config "'+$configPath+'"')
        Set-ScheduledTask -TaskName $taskName -Action $action | Out-Null
    }
    function Confirm-Ready([string]$Version) {
        $deadline=[DateTimeOffset]::UtcNow.AddSeconds(30)
        do {
            $running=Get-CimInstance Win32_Service -Filter "Name='NotificaSigningAgent'"
            $markerPath=Join-Path $state 'service-ready.json'
            if ($running.State -eq 'Running' -and (Test-Path -LiteralPath $markerPath)) {
                try { $marker=Read-UpdateJson $markerPath } catch { $marker=$null }
                if ($marker -and $marker.processId -eq $running.ProcessId -and $marker.version -ceq $Version -and
                    [DateTimeOffset]::Parse($marker.at) -gt [DateTimeOffset]::UtcNow.AddMinutes(-2)) { return }
            }
            Start-Sleep -Milliseconds 250
        } while ([DateTimeOffset]::UtcNow -lt $deadline)
        throw 'SERVICE_READINESS_FAILED'
    }
    function Start-Tray {
        try { Start-ScheduledTask -TaskName $taskName } catch { Write-Output 'TRAY_START_PENDING_SIGN_OUT_AND_BACK_IN' }
    }
    function Restore-Previous {
        # If a signing journal appeared before any switch, leave config/state
        # untouched and simply resume the original service. Otherwise stop again
        # and refuse to change versions with unresolved signing work.
        $installedService=Get-CimInstance Win32_Service -Filter "Name='NotificaSigningAgent'"
        Assert-ServiceOwnership $installedService @($oldExe,$newExe) $configPath
        $nowConfig=Read-UpdateJson $configPath
        $unchanged=($nowConfig | ConvertTo-Json -Depth 20 -Compress) -ceq ($originalConfig | ConvertTo-Json -Depth 20 -Compress)
        if (-not ($installedService.PathName -ceq ('"'+$oldExe+'" --service --config "'+$configPath+'"') -and $unchanged)) {
            Stop-Installed
            Assert-NoSigningWork $state
            Save-ReleaseJson $configPath $originalConfig
            Invoke-Sc @('config',$serviceName,'binPath=',('"'+$oldExe+'" --service --config "'+$configPath+'"'))
        }
        Register-ScheduledTask -TaskName $taskName -Xml $checkpoint.taskXml -Force | Out-Null
        Start-Service $serviceName
        Confirm-Ready $previous.version
        Save-ReleaseJson $recordPath $previous
        Start-Tray
    }
    if ($Recover) {
        Restore-Previous
        Remove-Item -LiteralPath $journalPath
        Write-Output 'PREVIOUS_VERSION_RESTORED'; exit 0
    }
    # New immutable directory; no replacement/removal of the running version.
    Expand-VerifiedPayload (Join-Path $PSScriptRoot 'payload.zip') $package.payloadSha256 $checkpoint.candidateTarget
    if ([version](Get-Item -LiteralPath $newExe).VersionInfo.ProductVersion.Split('+')[0] -ne [version]$package.version) { throw 'PAYLOAD_VERSION_MISMATCH' }
    $nextConfig=New-ManagedUpdateConfiguration $originalConfig $checkpoint.candidateTarget
    $nextRecord=$previous | ConvertTo-Json -Depth 20 | ConvertFrom-Json
    $nextRecord.version=$package.version; $nextRecord.target=$checkpoint.candidateTarget; $nextRecord.manifestSha256=$ExpectedManifestSha256
    $nextRecord | Add-Member -NotePropertyName previousTarget -NotePropertyValue $previous.target -Force
    $nextRecord | Add-Member -NotePropertyName updatedAt -NotePropertyValue ([DateTimeOffset]::UtcNow.ToString('O')) -Force
    # Keep a private rollback checkpoint after success; never copy identity keys,
    # PDFs, or signing journals into the release directory.
    $backups=Assert-LocalPath (Join-Path $data 'update-backups')
    New-Item -ItemType Directory -Path $backups -Force | Out-Null
    Set-ReleaseAcl $backups
    Save-ReleaseJson (Join-Path $backups ('0.12.0-'+[Guid]::NewGuid().ToString('N')+'.json')) $checkpoint
    Invoke-ManagedUpdateTransaction $journalPath $checkpoint @{
        Stop={ Stop-Installed }
        CheckIdle={ Assert-NoSigningWork $state }
        Switch={
            Save-ReleaseJson $configPath $nextConfig
            $validate=Start-Process -FilePath $newExe -ArgumentList @('--validate-config','--config',('"'+$configPath+'"')) -WindowStyle Hidden -PassThru
            if (-not $validate.WaitForExit(60000)) { $validate.Kill(); throw 'CONFIGURATION_VALIDATION_TIMEOUT' }
            if ($validate.ExitCode -ne 0) { throw 'CONFIGURATION_VALIDATION_FAILED' }
            Set-Payload $newExe
        }
        StartAndVerify={ Start-Service $serviceName; Confirm-Ready $package.version }
        Commit={ Save-ReleaseJson $recordPath $nextRecord; Enable-ScheduledTask -TaskName $taskName | Out-Null }
        Restore={ Restore-Previous }
    }
    Start-Tray
    Write-Output 'UPDATED_TO_0_13_0_ENROLLMENT_PRESERVED'
} catch {
    $code=if ($_.Exception.Message -cmatch '^[A-Z][A-Z_]{3,90}$') { $_.Exception.Message } else { 'MANAGED_UPDATE_FAILED' }
    Write-Output $code; exit 1
} finally { if ($lease) { $lease.Dispose() } }
