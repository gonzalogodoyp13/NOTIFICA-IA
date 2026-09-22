#Requires -RunAsAdministrator
#Requires -Version 7.0
param([string]$AllowedUserSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value)
$ErrorActionPreference = 'Stop'
$serviceName = 'NotificaSigningAgent'
$binaryDirectory = Join-Path $env:ProgramFiles 'NotificaIA\Agent'
$configurationDirectory = Join-Path $env:ProgramData 'NotificaIA\Agent'
$configPath = Join-Path $configurationDirectory 'config.json'
$output = Join-Path $PSScriptRoot 'artifacts\service-verification.json'
# This test never takes over or removes an existing installation.
if ((Get-Service -Name $serviceName -ErrorAction SilentlyContinue) -or (Test-Path -LiteralPath $binaryDirectory) -or (Test-Path -LiteralPath $configurationDirectory) -or (Get-ScheduledTask -TaskName 'NotificaSigningTray' -ErrorAction SilentlyContinue)) {
    throw 'Existing agent installation detected. Preserve it and use an isolated verification machine.'
}
$testKeyName = $null
$clientTaskName = 'NotificaSigningVerification-' + [Guid]::NewGuid().ToString()
$clientTaskCreated = $false
$results = [ordered]@{ completed=$false; checkedAt=[DateTimeOffset]::UtcNow.ToString('O'); allowedUserSid=$AllowedUserSid; serviceStarted=$false; standardUserPipeVerified=$false; restartIdentityPreserved=$false; restartCycles=0; automaticRecoveryVerified=$false; gracefulStopVerified=$false; tokenHealth=$null; cleanupCompleted=$false }
function Read-LocalStatus {
    $outFile = Join-Path $PSScriptRoot 'artifacts\service-status.json'
    $errFile = Join-Path $PSScriptRoot 'artifacts\service-status-errors.txt'
    $process = Start-Process -FilePath (Join-Path $binaryDirectory 'Notifica.Agent.exe') -ArgumentList @('--status','--config',('"'+$configPath+'"')) -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput $outFile -RedirectStandardError $errFile
    if ($process.ExitCode -ne 0) { throw 'Local service status failed.' }
    return (Get-Content -LiteralPath $outFile -Raw | ConvertFrom-Json).status
}
try {
    & (Join-Path $PSScriptRoot 'install.ps1') -ServerUrl 'https://localhost/' -AllowedUserSid $AllowedUserSid
    $testKeyName = (Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json).keyName
    $deadline = [DateTimeOffset]::UtcNow.AddSeconds(45)
    do {
        Start-Sleep -Milliseconds 1000
        try { $first = Read-LocalStatus } catch { $first = $null }
    } while ((!$first -or $first.health -eq 'OFFLINE') -and [DateTimeOffset]::UtcNow -lt $deadline)
    if (!$first -or !$first.deviceKeyFingerprint) { throw 'Service did not initialize its protected device identity.' }
    $results.serviceStarted = $true
    $results.tokenHealth = $first.health
    $results.serviceAccount = (Get-CimInstance Win32_Service -Filter "Name='NotificaSigningAgent'").StartName
    if ($results.serviceAccount -ne 'NT SERVICE\NotificaSigningAgent') { throw 'Unexpected service account.' }
    # Query from the real interactive user with a filtered, non-admin token.
    # This proves the tray can inspect the protected service process and pipe.
    $clientOutput = Join-Path $PSScriptRoot ('artifacts\service-client-' + $testKeyName + '.json')
    $clientAccount = ([Security.Principal.SecurityIdentifier]::new($AllowedUserSid)).Translate([Security.Principal.NTAccount]).Value
    $clientAction = New-ScheduledTaskAction -Execute (Join-Path $binaryDirectory 'Notifica.Agent.exe') -Argument ('--status --config "' + $configPath + '" --status-output "' + $clientOutput + '"')
    $clientPrincipal = New-ScheduledTaskPrincipal -UserId $clientAccount -LogonType Interactive -RunLevel Limited
    $clientSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::FromMinutes(1))
    Register-ScheduledTask -TaskName $clientTaskName -Action $clientAction -Principal $clientPrincipal -Settings $clientSettings | Out-Null
    $clientTaskCreated = $true
    Start-ScheduledTask -TaskName $clientTaskName
    $deadline = [DateTimeOffset]::UtcNow.AddSeconds(45)
    while (!(Test-Path -LiteralPath $clientOutput) -and [DateTimeOffset]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 500 }
    if (!(Test-Path -LiteralPath $clientOutput)) { throw 'Standard-user pipe check did not return a result.' }
    $clientStatus = Get-Content -LiteralPath $clientOutput -Raw | ConvertFrom-Json
    if ($clientStatus.errorCode) { $results.clientFailure = $clientStatus; throw 'Standard-user pipe query failed.' }
    if ($clientStatus.clientIsAdministrator -or $clientStatus.clientUserSid -ne $AllowedUserSid -or !$clientStatus.response.ok -or $clientStatus.response.status.deviceKeyFingerprint -ne $first.deviceKeyFingerprint) { throw 'Standard-user pipe identity verification failed.' }
    $results.standardUserPipeVerified = $true
    for ($cycle=1; $cycle -le 3; $cycle++) {
        Restart-Service -Name $serviceName
        $deadline = [DateTimeOffset]::UtcNow.AddSeconds(45)
        do {
            Start-Sleep -Milliseconds 1000
            try { $second = Read-LocalStatus } catch { $second = $null }
        } while ((!$second -or $second.health -eq 'OFFLINE') -and [DateTimeOffset]::UtcNow -lt $deadline)
        if (!$second -or $second.deviceKeyFingerprint -ne $first.deviceKeyFingerprint) { throw 'Restart did not preserve the machine CNG identity.' }
        if ($second.health -ne 'TOKEN_READY') { throw 'Connected token was not ready under the virtual service account.' }
        $results.restartCycles = $cycle
    }
    $results.restartIdentityPreserved = $true
    # Exercise configured SCM recovery against only this test-created service.
    $testServicePid = (Get-CimInstance Win32_Service -Filter "Name='NotificaSigningAgent'").ProcessId
    $testServiceProcess = Get-Process -Id $testServicePid
    if ($testServiceProcess.Path -ne (Join-Path $binaryDirectory 'Notifica.Agent.exe')) { throw 'Unexpected service process; refusing recovery test.' }
    Stop-Process -Id $testServicePid -Force
    $deadline = [DateTimeOffset]::UtcNow.AddSeconds(50)
    do {
        Start-Sleep -Milliseconds 1000
        $recoveredService = Get-CimInstance Win32_Service -Filter "Name='NotificaSigningAgent'"
        try { $recovered = Read-LocalStatus } catch { $recovered = $null }
    } while ((!$recovered -or $recovered.health -ne 'TOKEN_READY' -or $recoveredService.ProcessId -eq $testServicePid) -and [DateTimeOffset]::UtcNow -lt $deadline)
    if (!$recovered -or $recovered.deviceKeyFingerprint -ne $first.deviceKeyFingerprint -or $recovered.health -ne 'TOKEN_READY' -or !$recoveredService.ProcessId -or $recoveredService.ProcessId -eq $testServicePid) { throw 'SCM automatic recovery did not preserve healthy service identity.' }
    $results.automaticRecoveryVerified = $true
    Stop-Service -Name $serviceName
    if ((Get-Service -Name $serviceName).Status -ne 'Stopped') { throw 'Graceful service stop did not finish.' }
    $results.gracefulStopVerified = $true
    $results.completed = $true
} catch {
    $results.failure = $_.Exception.Message
    $results.failureLocation = $_.ScriptStackTrace
    $failureException = $_.Exception
    $nativeErrors = @()
    while ($failureException) {
        if ($failureException -is [ComponentModel.Win32Exception]) { $nativeErrors += $failureException.NativeErrorCode }
        $failureException = $failureException.InnerException
    }
    $results.nativeErrors = $nativeErrors
    $results.serviceStateAtFailure = (& sc.exe queryex $serviceName) -join "`n"
    if ($clientTaskCreated) {
        $clientTaskInfo = Get-ScheduledTaskInfo -TaskName $clientTaskName
        $results.clientTaskLastResult = $clientTaskInfo.LastTaskResult
    }
    throw
} finally {
    $diagnosticPath = Join-Path $configurationDirectory 'state\service-error.json'
    if (Test-Path -LiteralPath $diagnosticPath) { $results.serviceDiagnostic = Get-Content -LiteralPath $diagnosticPath -Raw | ConvertFrom-Json }
    $installed = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
    if ($installed) { Stop-Service -Name $serviceName -ErrorAction SilentlyContinue; & sc.exe delete $serviceName | Out-Null }
    if ($clientTaskCreated) { Stop-ScheduledTask -TaskName $clientTaskName -ErrorAction SilentlyContinue; Unregister-ScheduledTask -TaskName $clientTaskName -Confirm:$false }
    $trayTask = Get-ScheduledTask -TaskName 'NotificaSigningTray' -ErrorAction SilentlyContinue
    if ($trayTask) { Unregister-ScheduledTask -TaskName 'NotificaSigningTray' -Confirm:$false }
    if (!$testKeyName -and (Test-Path -LiteralPath $configPath)) { $testKeyName = (Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json).keyName }
    if ($testKeyName) {
        $options = [Security.Cryptography.CngKeyOpenOptions]::MachineKey
        $provider = [Security.Cryptography.CngProvider]::MicrosoftSoftwareKeyStorageProvider
        if ([Security.Cryptography.CngKey]::Exists($testKeyName,$provider,$options)) {
            $key = [Security.Cryptography.CngKey]::Open($testKeyName,$provider,$options); $key.Delete(); $key.Dispose()
        }
    }
    # Both exact target paths were proven absent before this test. Check their
    # resolved absolute locations again before removing only test-created files.
    foreach ($target in @($binaryDirectory,$configurationDirectory)) {
        if (Test-Path -LiteralPath $target) {
            $resolved = (Resolve-Path -LiteralPath $target).Path
            if ($resolved -notin @([IO.Path]::GetFullPath($binaryDirectory),[IO.Path]::GetFullPath($configurationDirectory))) { throw 'Unsafe verification cleanup path.' }
            if ((Get-Item -LiteralPath $resolved).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Refusing to delete a reparse point.' }
            Remove-Item -LiteralPath $resolved -Recurse -Force
        }
    }
    $results.cleanupCompleted = $true
    $results | ConvertTo-Json | Set-Content -LiteralPath $output -Encoding utf8
}
Write-Output "Windows service verification passed. Evidence: $output"
