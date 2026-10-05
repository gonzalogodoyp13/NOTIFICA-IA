Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'

function Read-ManagedDistribution([string]$Directory, [string]$ExpectedManifestSha256) {
    if ($ExpectedManifestSha256 -cnotmatch '^[a-f0-9]{64}$') { throw 'EXPECTED_MANIFEST_HASH_REQUIRED' }
    $Directory=Assert-LocalPath $Directory
    $path=Join-Path $Directory 'distribution.json'
    $stream=[IO.File]::Open($path,'Open','Read','Read')
    try {
        if ($stream.Length -gt 65536) { throw 'MANIFEST_TOO_LARGE' }
        $sha=[Security.Cryptography.SHA256]::Create()
        try { $hash=([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-','').ToLowerInvariant() } finally { $sha.Dispose() }
        if ($hash -cne $ExpectedManifestSha256) { throw 'MANIFEST_CHECKSUM_MISMATCH' }
        $stream.Position=0; $reader=[IO.StreamReader]::new($stream)
        $manifest=$reader.ReadToEnd() | ConvertFrom-Json
        if ($manifest.format -notin @(1,2) -or $manifest.mode -cne 'operator-managed-unsigned' -or
            $manifest.version -cnotmatch '^\d+\.\d+\.\d+$' -or $manifest.payloadSha256 -cnotmatch '^[a-f0-9]{64}$') { throw 'INVALID_MANAGED_MANIFEST' }
        $names=@($manifest.files.PSObject.Properties.Name)
        $required=@('Install-Notifica.ps1','ReleaseTools.psm1','ManagedDistribution.psm1','install-request.example.json','INSTALACION.md')
        if ($manifest.format -eq 2) { $required+=@('Update-Notifica.ps1','ManagedUpdate.psm1','ACTUALIZACION.md') }
        if ($names.Count -ne $required.Count -or @($names | Where-Object { $_ -notin $required }).Count) { throw 'INVALID_MANAGED_FILES' }
        foreach ($entry in $manifest.files.PSObject.Properties) {
            if ($entry.Value -cnotmatch '^[a-f0-9]{64}$' -or (Get-FileHash -LiteralPath (Join-Path $Directory $entry.Name) -Algorithm SHA256).Hash.ToLowerInvariant() -cne $entry.Value) { throw 'DISTRIBUTION_FILE_CHANGED' }
        }
        if ((Get-FileHash -LiteralPath (Join-Path $Directory 'payload.zip') -Algorithm SHA256).Hash.ToLowerInvariant() -cne $manifest.payloadSha256) { throw 'PAYLOAD_CHECKSUM_MISMATCH' }
        return $manifest
    } finally { $stream.Dispose() }
}

function Read-ManagedRequest([string]$Path) {
    $path=Assert-LocalPath $Path
    if ((Get-Item -LiteralPath $path).Length -gt 65536) { throw 'REQUEST_TOO_LARGE' }
    $request=Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
    $allowed=@('serverUrl','allowedUserSid','receiverDirectory','pkcs11Library','certificateFingerprint','enableSigning','timestampUrl','timestampPolicyOid','trustedCertificateFiles')
    $names=@($request.PSObject.Properties.Name)
    if ($names.Count -ne $allowed.Count -or @($names | Where-Object { $_ -notin $allowed }).Count) { throw 'INVALID_REQUEST_FIELDS' }
    return $request
}

function Assert-ManagedResume($Record, [string]$ManifestHash, [string]$RequestHash) {
    if ($Record.mode -cne 'operator-managed-unsigned' -or $Record.manifestSha256 -cne $ManifestHash -or $Record.requestSha256 -cne $RequestHash -or $Record.status -cne 'installing') { throw 'RESUME_DOES_NOT_MATCH_INSTALLATION' }
}
Export-ModuleMember -Function Read-ManagedDistribution,Read-ManagedRequest,Assert-ManagedResume
