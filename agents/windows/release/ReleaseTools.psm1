Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-LocalPath([string]$Path) {
    if ($Path -notmatch '^[A-Za-z]:[\\/]' -or $Path.Substring(2).Contains(':')) { throw 'LOCAL_PATH_REQUIRED' }
    $full = [IO.Path]::GetFullPath($Path)
    $node = if (Test-Path -LiteralPath $full -PathType Container) { [IO.DirectoryInfo]::new($full) } else { [IO.FileInfo]::new($full) }
    while ($node) {
        if ($node.Exists -and ($node.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'REPARSE_POINT_REJECTED' }
        $node = if ($node -is [IO.DirectoryInfo]) { $node.Parent } else { $node.Directory }
    }
    return $full
}
function Get-CertificateHash($Certificate) {
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash($Certificate.RawData))).Replace('-','').ToLowerInvariant() }
    finally { $sha.Dispose() }
}
function Assert-Publisher([string]$Path, [string]$PublisherSha256) {
    if ($PublisherSha256 -cnotmatch '^[a-f0-9]{64}$') { throw 'PUBLISHER_NOT_PROVISIONED' }
    $signature = Get-AuthenticodeSignature -LiteralPath $Path
    if ($signature.Status -ne 'Valid' -or -not $signature.SignerCertificate -or
        (Get-CertificateHash $signature.SignerCertificate) -cne $PublisherSha256) { throw 'UNTRUSTED_PUBLISHER' }
    if (-not $signature.TimeStamperCertificate) { throw 'TIMESTAMP_REQUIRED' }
}
function Read-Release([string]$Directory, [string]$PublisherSha256) {
    $directory = Assert-LocalPath $Directory
    $manifest = Assert-LocalPath (Join-Path $directory 'release.psd1')
    if ((Get-Item -LiteralPath $manifest).Length -gt 65536) { throw 'MANIFEST_TOO_LARGE' }
    $locked=[IO.File]::Open($manifest,'Open','Read','Read')
    try {
    Assert-Publisher $manifest $PublisherSha256
    $release = Import-PowerShellDataFile -LiteralPath $manifest
    if ($release.Format -ne 1 -or $release.Version -cnotmatch '^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$' -or
        $release.PayloadSha256 -cnotmatch '^[a-f0-9]{64}$' -or $release.Kind -notin @('upgrade','rollback') -or
        $release.Ring -notin @('pilot','broad') -or [DateTimeOffset]::Parse($release.ExpiresAt) -le [DateTimeOffset]::UtcNow) { throw 'INVALID_RELEASE' }
    if ($release.Ring -eq 'pilot' -and @($release.Computers).Count -eq 0) { throw 'PILOT_TARGETS_REQUIRED' }
    if ($release.Ring -eq 'broad' -and $release.AcceptanceSha256 -cnotmatch '^[a-f0-9]{64}$') { throw 'OPERATOR_ACCEPTANCE_REQUIRED' }
    return $release
    } finally { $locked.Dispose() }
}
function Assert-ReleaseTarget($Release, [string]$CurrentVersion, [string]$ComputerName) {
    if ($Release.Ring -eq 'pilot' -and $ComputerName -notin @($Release.Computers)) { throw 'OUTSIDE_RELEASE_RING' }
    if ($CurrentVersion) {
        if ($CurrentVersion -notin @($Release.FromVersions)) { throw 'UNSUPPORTED_UPGRADE_SOURCE' }
        if ($Release.Kind -eq 'upgrade' -and [version]$Release.Version -le [version]$CurrentVersion) { throw 'DOWNGRADE_REJECTED' }
        if ($Release.Kind -eq 'rollback' -and [version]$Release.Version -ge [version]$CurrentVersion) { throw 'INVALID_ROLLBACK' }
    } elseif ($Release.Kind -ne 'upgrade') { throw 'ROLLBACK_REQUIRES_INSTALLATION' }
    if ([version]$Release.Version -lt [version]$Release.MinimumVersion) { throw 'BELOW_MINIMUM_VERSION' }
}
function Expand-VerifiedPayload([string]$Archive, [string]$ExpectedHash, [string]$Destination) {
    Add-Type -AssemblyName System.IO.Compression
    $archive = Assert-LocalPath $Archive
    $destination = Assert-LocalPath $Destination
    if (Test-Path -LiteralPath $destination) { throw 'STAGING_MUST_BE_NEW' }
    # Hold a read-only lock throughout verification/extraction to prevent replacement.
    $stream = [IO.File]::Open($archive, 'Open', 'Read', 'Read')
    try {
        $sha = [Security.Cryptography.SHA256]::Create()
        try { $actual = ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-','').ToLowerInvariant() } finally { $sha.Dispose() }
        if ($actual -cne $ExpectedHash) { throw 'PAYLOAD_CHECKSUM_MISMATCH' }
        $stream.Position = 0
        $zip = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Read, $true)
        try {
            $paths = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
            [long]$size = 0
            if ($zip.Entries.Count -gt 10000) { throw 'PAYLOAD_TOO_MANY_FILES' }
            foreach ($entry in $zip.Entries) {
                $relative = $entry.FullName.Replace('/', '\')
                $segments = $relative.TrimEnd('\').Split('\')
                if ($relative.StartsWith('\') -or $relative.Contains(':') -or $relative.Contains([char]0) -or
                    @($segments | Where-Object { $_ -in @('','..','.') -or $_.EndsWith('.') -or $_.EndsWith(' ') -or $_ -match '^(CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])(?:\.|$)' }).Count -gt 0 -or
                    (($entry.ExternalAttributes -shr 16) -band 0xf000) -eq 0xa000 -or -not $paths.Add($relative)) { throw 'UNSAFE_ARCHIVE_PATH' }
                $size += $entry.Length
                if ($size -gt 3GB -or $entry.Length -gt 512MB) { throw 'PAYLOAD_TOO_LARGE' }
                $target = [IO.Path]::GetFullPath((Join-Path $destination $relative))
                if (-not $target.StartsWith($destination.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'UNSAFE_ARCHIVE_PATH' }
            }
            [IO.Directory]::CreateDirectory($destination) | Out-Null
            foreach ($entry in $zip.Entries) {
                $target = Join-Path $destination $entry.FullName
                if ($entry.FullName.EndsWith('/')) { [IO.Directory]::CreateDirectory($target) | Out-Null; continue }
                [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target)) | Out-Null
                $inputStream = $entry.Open(); $output = [IO.File]::Open($target, 'CreateNew', 'Write', 'None')
                try { $inputStream.CopyTo($output); $output.Flush($true) } finally { $output.Dispose(); $inputStream.Dispose() }
            }
        } finally { $zip.Dispose() }
    } finally { $stream.Dispose() }
}
function Set-ReleaseAcl([string]$Path, [string[]]$Readers = @(), [string]$Writer = '') {
    $acl = [Security.AccessControl.DirectorySecurity]::new()
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($sid in @('S-1-5-18','S-1-5-32-544')) {
        $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($sid),'FullControl','ContainerInherit,ObjectInherit','None','Allow'))
    }
    foreach ($sid in $Readers) {
        $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($sid),'ReadAndExecute','ContainerInherit,ObjectInherit','None','Allow'))
    }
    if ($Writer) { $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($Writer),'Modify','ContainerInherit,ObjectInherit','None','Allow')) }
    Set-Acl -LiteralPath $Path -AclObject $acl
}
function Save-ReleaseJson([string]$Path, $Value) {
    $temporary=$Path+'.'+[Guid]::NewGuid().ToString('N')+'.tmp'
    $bytes=[Text.UTF8Encoding]::new($false).GetBytes(($Value | ConvertTo-Json -Depth 20))
    $file=[IO.File]::Open($temporary,'CreateNew','Write','None')
    try { $file.Write($bytes,0,$bytes.Length); $file.Flush($true) } finally { $file.Dispose() }
    if (Test-Path -LiteralPath $Path) {
        # PowerShell converts a null string argument to an empty path. Use an
        # owned unique backup explicitly for consistent Windows PS 5.1/7 behavior.
        $backup=$Path+'.'+[Guid]::NewGuid().ToString('N')+'.bak'
        [IO.File]::Replace($temporary,$Path,$backup)
        Remove-Item -LiteralPath $backup
    } else { [IO.File]::Move($temporary,$Path) }
}
function Test-InitialRequest($Request, [string]$Root, [string]$Data, [bool]$AllowExistingReceiver = $false) {
    $uri=[Uri]$Request.serverUrl
    if (-not $uri.IsAbsoluteUri -or $uri.Scheme -ne 'https' -or $uri.AbsolutePath -ne '/' -or $uri.UserInfo -or $uri.Query -or $uri.Fragment) { throw 'HTTPS_ORIGIN_REQUIRED' }
    if ($Request.enableSigning -isnot [bool]) { throw 'SIGNING_CHOICE_REQUIRED' }
    $sid=[Security.Principal.SecurityIdentifier]::new($Request.allowedUserSid)
    $account=$sid.Translate([Security.Principal.NTAccount]).Value
    $receiver=Assert-LocalPath $Request.receiverDirectory
    foreach ($protected in @($Root,$Data)) {
        $protected=[IO.Path]::GetFullPath($protected).TrimEnd('\')
        if ($receiver.TrimEnd('\') -ieq $protected -or $receiver.StartsWith($protected+'\',[StringComparison]::OrdinalIgnoreCase) -or
            $protected.StartsWith($receiver.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'RECEIVER_OVERLAPS_INSTALLATION' }
    }
    if (-not $AllowExistingReceiver -and (Test-Path -LiteralPath $receiver)) { throw 'CHOOSE_NEW_RECEIVER_DIRECTORY' }
    $driver=Assert-LocalPath $Request.pkcs11Library
    if ($null -ne $Request.certificateFingerprint -and $Request.certificateFingerprint -cnotmatch '^[a-f0-9]{64}$') { throw 'INVALID_CERTIFICATE_FINGERPRINT' }
    $certificates=[Collections.Generic.List[byte[]]]::new()
    if ($Request.enableSigning) {
        if ($Request.certificateFingerprint -cnotmatch '^[a-f0-9]{64}$' -or -not (Test-Path -LiteralPath $driver)) { throw 'SIGNING_CONFIGURATION_REQUIRED' }
        if ((Get-AuthenticodeSignature -LiteralPath $driver).Status -ne 'Valid') { throw 'TRUSTED_TOKEN_DRIVER_REQUIRED' }
        $timestamp=[Uri]$Request.timestampUrl
        if (-not $timestamp.IsAbsoluteUri -or $timestamp.Scheme -ne 'https' -or $timestamp.UserInfo -or $timestamp.Fragment) { throw 'HTTPS_TSA_REQUIRED' }
        if ($null -ne $Request.timestampPolicyOid -and $Request.timestampPolicyOid -cnotmatch '^[0-9]+(\.[0-9]+)+$') { throw 'INVALID_TSA_POLICY' }
        if (@($Request.trustedCertificateFiles).Count -lt 1 -or @($Request.trustedCertificateFiles).Count -gt 10) { throw 'EXPLICIT_TRUST_REQUIRED' }
        foreach ($path in $Request.trustedCertificateFiles) {
            $source=Assert-LocalPath $path
            if ((Get-Item -LiteralPath $source).Length -gt 65536) { throw 'CERTIFICATE_TOO_LARGE' }
            $bytes=[IO.File]::ReadAllBytes($source)
            if ([Security.Cryptography.X509Certificates.X509Certificate2]::GetCertContentType($bytes) -ne 'Cert') { throw 'PUBLIC_TRUST_CERTIFICATES_ONLY' }
            $cert=[Security.Cryptography.X509Certificates.X509Certificate2]::new($bytes)
            try { if ($cert.HasPrivateKey) { throw 'PUBLIC_TRUST_CERTIFICATES_ONLY' }; $certificates.Add($cert.RawData) } finally { $cert.Dispose() }
        }
    }
    return @{sid=$sid;account=$account;receiver=$receiver;driver=$driver;certificates=$certificates}
}
function Invoke-InitialInstallation([string]$Journal, $Record, [scriptblock]$Provision, [scriptblock]$Activate) {
    if (Test-Path -LiteralPath $Journal) { throw 'RECOVER_INITIAL_INSTALLATION_FIRST' }
    Save-ReleaseJson $Journal @{ kind='initial'; record=$Record; startedAt=[DateTimeOffset]::UtcNow.ToString('O') }
    # Failure deliberately leaves the same key/configuration checkpoint for repair.
    & $Provision
    & $Activate
    Remove-Item -LiteralPath $Journal
}
function Assert-ServiceOwnership($Service, [string[]]$Executables, [string]$ConfigurationPath) {
    $paths=@($Executables | ForEach-Object { '"'+$_+'" --service --config "'+$ConfigurationPath+'"' })
    if ($Service.PathName -notin $paths -or $Service.StartName -ine 'NT SERVICE\NotificaSigningAgent') { throw 'SERVICE_OWNERSHIP_MISMATCH' }
}
function Invoke-ReleaseSwitch([string]$Journal, $Previous, [scriptblock]$Switch, [scriptblock]$Restore) {
    if (Test-Path -LiteralPath $Journal) { throw 'RECOVER_PREVIOUS_INSTALLATION_FIRST' }
    Save-ReleaseJson $Journal @{ previous=$Previous; startedAt=[DateTimeOffset]::UtcNow.ToString('O') }
    try { & $Switch }
    catch {
        try { & $Restore; Remove-Item -LiteralPath $Journal }
        catch { throw 'ROLLBACK_FAILED_JOURNAL_PRESERVED' }
        throw 'INSTALLATION_ROLLED_BACK'
    }
    Remove-Item -LiteralPath $Journal
}
Export-ModuleMember -Function Assert-LocalPath,Get-CertificateHash,Assert-Publisher,Read-Release,Assert-ReleaseTarget,Expand-VerifiedPayload,Set-ReleaseAcl,Save-ReleaseJson,Invoke-ReleaseSwitch,Test-InitialRequest,Invoke-InitialInstallation,Assert-ServiceOwnership
