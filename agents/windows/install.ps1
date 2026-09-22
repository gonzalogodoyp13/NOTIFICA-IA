# Foundation installer. Production Authenticode packaging/upgrades remain Phase 11.
#Requires -RunAsAdministrator
#Requires -Version 7.0
param(
    [Parameter(Mandatory)][string]$ServerUrl,
    [Parameter(Mandatory)][string]$AllowedUserSid,
    [string]$CertificateFingerprint,
    [string]$Pkcs11Library = "$env:WINDIR\System32\eTPKCS11.dll",
    [string]$Payload = (Join-Path $PSScriptRoot 'artifacts\win-x64')
)
$ErrorActionPreference = 'Stop'
$serviceName = 'NotificaSigningAgent'
$destination = Join-Path $env:ProgramFiles 'NotificaIA\Agent'
$configurationDirectory = Join-Path $env:ProgramData 'NotificaIA\Agent'
$stateDirectory = Join-Path $configurationDirectory 'state'
$server = [Uri]$ServerUrl
if ($server.Scheme -ne 'https' -or $server.AbsolutePath -ne '/' -or $server.Query -or $server.UserInfo -or $server.Fragment) { throw 'Specify an HTTPS origin only.' }
$allowedUserIdentity = [System.Security.Principal.SecurityIdentifier]::new($AllowedUserSid)
$allowedUserAccount = $allowedUserIdentity.Translate([System.Security.Principal.NTAccount]).Value
if ($CertificateFingerprint -and $CertificateFingerprint -cnotmatch '^[a-f0-9]{64}$') { throw 'Expected lowercase SHA-256 certificate fingerprint.' }
if (-not [IO.Path]::IsPathFullyQualified($Pkcs11Library)) { throw 'Expected an absolute PKCS#11 DLL path.' }
if (Get-Service -Name $serviceName -ErrorAction SilentlyContinue) { throw 'Service already installed. Stop and follow the documented upgrade procedure.' }
if ((Test-Path -LiteralPath $destination) -or (Test-Path -LiteralPath $configurationDirectory)) { throw 'Existing installation files must be inspected and preserved before installing.' }
foreach ($target in @($destination,$configurationDirectory)) {
    $ancestor = [IO.DirectoryInfo]::new($target)
    while ($ancestor) {
        if ($ancestor.Exists -and ($ancestor.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Installation through a reparse point is not allowed.' }
        $ancestor = $ancestor.Parent
    }
}
if (Get-ScheduledTask -TaskName 'NotificaSigningTray' -ErrorAction SilentlyContinue) { throw 'An existing tray task must not be overwritten.' }
if (-not (Test-Path -LiteralPath (Join-Path $Payload 'Notifica.Agent.exe'))) { throw 'Build the agent payload first.' }
New-Item -ItemType Directory -Force -Path $destination,$configurationDirectory,$stateDirectory | Out-Null
function Set-ProtectedDirectoryAcl([string]$Path, [string]$Reader, [string]$Writer) {
    $acl = [System.Security.AccessControl.DirectorySecurity]::new()
    $acl.SetAccessRuleProtection($true,$false)
    foreach ($principal in @('S-1-5-18','S-1-5-32-544')) {
        $acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new([System.Security.Principal.SecurityIdentifier]::new($principal),'FullControl','ContainerInherit,ObjectInherit','None','Allow'))
    }
    if ($Reader) { $acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new([System.Security.Principal.SecurityIdentifier]::new($Reader),'ReadAndExecute','ContainerInherit,ObjectInherit','None','Allow')) }
    if ($Writer) { $acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new([System.Security.Principal.SecurityIdentifier]::new($Writer),'Modify','ContainerInherit,ObjectInherit','None','Allow')) }
    Set-Acl -LiteralPath $Path -AclObject $acl
}
# Resolve the virtual service SID before creating its service.
$sidOutput = & sc.exe showsid $serviceName
if ($LASTEXITCODE -ne 0) { throw 'Could not determine virtual service SID.' }
$serviceSid = [regex]::Match(($sidOutput -join ' '),'S-1-5-80-(?:\d+-){4}\d+').Value
if (-not $serviceSid) { throw 'Virtual service SID not found.' }
Set-ProtectedDirectoryAcl $destination $AllowedUserSid ''
# Service needs execute access to immutable binaries and read-only configuration.
foreach ($path in @($destination,$configurationDirectory)) {
    Set-ProtectedDirectoryAcl $path $AllowedUserSid ''
    $acl = Get-Acl -LiteralPath $path
    $acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new([System.Security.Principal.SecurityIdentifier]::new($serviceSid),'ReadAndExecute','ContainerInherit,ObjectInherit','None','Allow'))
    Set-Acl -LiteralPath $path -AclObject $acl
}
Set-ProtectedDirectoryAcl $stateDirectory '' $serviceSid
Copy-Item -Path (Join-Path $Payload '*') -Destination $destination -Recurse
$config = @{
    serverUrl = $server.AbsoluteUri; dataDirectory = $stateDirectory; allowedUserSid = $AllowedUserSid;
    keyName = [Guid]::NewGuid().ToString(); pkcs11Library = $Pkcs11Library;
    certificateFingerprint = $(if ($CertificateFingerprint) { $CertificateFingerprint } else { $null }); machineKey = $true
}
$configPath = Join-Path $configurationDirectory 'config.json'
$config | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding utf8
$executable = Join-Path $destination 'Notifica.Agent.exe'
$binaryPath = '"' + $executable + '" --service --config "' + $configPath + '"'
& sc.exe create $serviceName binPath= $binaryPath start= delayed-auto obj= "NT SERVICE\$serviceName" DisplayName= 'NOTIFICA IA · Agente de firma'
if ($LASTEXITCODE -ne 0) { throw 'Could not create service.' }
& sc.exe sidtype $serviceName unrestricted
if ($LASTEXITCODE -ne 0) { throw 'Could not enable service SID.' }
& sc.exe failure $serviceName reset= 86400 actions= restart/10000/restart/30000/restart/60000
if ($LASTEXITCODE -ne 0) { throw 'Could not configure service recovery.' }
& sc.exe failureflag $serviceName 1
if ($LASTEXITCODE -ne 0) { throw 'Could not enable recovery for reported service failures.' }
# A restricted virtual service account cannot create machine CNG keys. The
# agent provisions its own non-exportable key locally during elevated install
# and grants key-use access to this service, not to the interactive tray.
$keyProvisioning = Start-Process -FilePath $executable -ArgumentList @('--initialize-service-key','--config',('"'+$configPath+'"')) -WindowStyle Hidden -Wait -PassThru
if ($keyProvisioning.ExitCode -ne 0) { throw 'Could not provision the protected machine device identity.' }
# A per-user logon task uses the interactive token, with no stored password.
$action = New-ScheduledTaskAction -Execute $executable -Argument ('--config "' + $configPath + '"')
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $allowedUserAccount
$principal = New-ScheduledTaskPrincipal -UserId $allowedUserAccount -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName 'NotificaSigningTray' -Action $action -Trigger $trigger -Principal $principal -Settings $settings | Out-Null
Start-Service -Name $serviceName
Write-Output 'Agent installed. Use the tray enrollment dialog with a one-use code from the office administrator.'
