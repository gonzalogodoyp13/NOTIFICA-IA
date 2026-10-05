Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'

function Read-UpdateJson([string]$Path) {
    $Path=Assert-LocalPath $Path
    if ((Get-Item -LiteralPath $Path).Length -gt 262144) { throw 'UPDATE_METADATA_TOO_LARGE' }
    return (Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json)
}
function Assert-ManagedTarget([string]$Target, [string]$Root, [string]$Version) {
    $targetPath=Assert-LocalPath $Target
    $versions=(Assert-LocalPath $Root).TrimEnd('\')+'\versions\'
    if (-not $targetPath.StartsWith($versions,[StringComparison]::OrdinalIgnoreCase) -or
        $targetPath.Substring($versions.Length) -cnotmatch ('^'+[regex]::Escape($Version)+'-[a-f0-9]{32}$')) { throw 'INVALID_INSTALLATION_TARGET' }
    return $targetPath
}
function Assert-ManagedUpdateSource($Record, $Configuration, [string]$Root, [string]$Data, [string]$NewVersion) {
    if ($Record.mode -cne 'operator-managed-unsigned' -or $Record.status -cne 'installed') { throw 'MANAGED_INSTALLATION_REQUIRED' }
    if ($Record.version -cne '0.12.0' -or $NewVersion -cne '0.13.0') { throw 'UNSUPPORTED_UPGRADE_SOURCE' }
    Assert-ManagedTarget $Record.target $Root $Record.version | Out-Null
    $state=Join-Path $Data 'state'
    if ($Configuration.dataDirectory -ine $state -or $Configuration.machineKey -ne $true -or
        $Configuration.keyName -cne $Record.keyName) { throw 'INSTALLATION_CONFIGURATION_MISMATCH' }
    if ($Configuration.PSObject.Properties.Name -contains 'controlledSigning' -and $Configuration.controlledSigning) { throw 'DEVELOPMENT_INSTALLATION_NOT_SUPPORTED' }
    if ($Configuration.PSObject.Properties.Name -contains 'signingEngine' -and $Configuration.signingEngine) {
        $engine=$Configuration.signingEngine
        if ($engine.javaExecutable -ine (Join-Path $Record.target 'java\bin\java.exe') -or
            $engine.bridgeJar -ine (Join-Path $Record.target 'engine\notifica-dss-6.5.jar') -or
            $engine.librariesDirectory -ine (Join-Path $Record.target 'engine\lib')) { throw 'CUSTOM_SIGNING_ENGINE_REQUIRES_REVIEW' }
    }
}
function New-ManagedUpdateConfiguration($Configuration, [string]$Target) {
    # Clone so rollback retains the complete original configuration, including
    # identity, server, trust, token settings and the user's document directory.
    $next=$Configuration | ConvertTo-Json -Depth 20 | ConvertFrom-Json
    if ($next.PSObject.Properties.Name -contains 'signingEngine' -and $next.signingEngine) {
        $next.signingEngine.javaExecutable=Join-Path $Target 'java\bin\java.exe'
        $next.signingEngine.bridgeJar=Join-Path $Target 'engine\notifica-dss-6.5.jar'
        $next.signingEngine.librariesDirectory=Join-Path $Target 'engine\lib'
    }
    return $next
}
function Assert-NoSigningWork([string]$State) {
    # A signing journal can appear while the package is being verified. Call
    # this both before and after stopping the service; never remove the journal.
    foreach ($name in @('signing-work.json','signing-work.json.part')) {
        if (Test-Path -LiteralPath (Join-Path $State $name)) { throw 'REVIEW_ACTIVE_WORK' }
    }
}
function Invoke-ManagedUpdateTransaction([string]$Journal, $Checkpoint, [hashtable]$Operations) {
    if (Test-Path -LiteralPath $Journal) { throw 'RECOVER_INTERRUPTED_UPDATE_FIRST' }
    Save-ReleaseJson $Journal $Checkpoint
    try {
        & $Operations.Stop
        & $Operations.CheckIdle
        & $Operations.Switch
        & $Operations.StartAndVerify
        & $Operations.Commit
    } catch {
        $failure=$_.Exception.Message
        try { & $Operations.Restore } catch { throw 'RECOVERY_REQUIRED_JOURNAL_PRESERVED' }
        Remove-Item -LiteralPath $Journal
        if ($failure -ceq 'REVIEW_ACTIVE_WORK') { throw 'REVIEW_ACTIVE_WORK' }
        throw 'UPDATE_FAILED_PREVIOUS_VERSION_RESTORED'
    }
    Remove-Item -LiteralPath $Journal
}
Export-ModuleMember -Function Read-UpdateJson,Assert-ManagedTarget,Assert-ManagedUpdateSource,New-ManagedUpdateConfiguration,Assert-NoSigningWork,Invoke-ManagedUpdateTransaction
