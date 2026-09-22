param([Parameter(Mandatory)][string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
# Ephemeral in-memory keys/certificates; no Windows trust store changes.
$rootKey = [Security.Cryptography.RSA]::Create(2048)
$serverKey = [Security.Cryptography.RSA]::Create(2048)
try {
    $rootRequest = [Security.Cryptography.X509Certificates.CertificateRequest]::new('CN=Notifica isolated test CA',$rootKey,[Security.Cryptography.HashAlgorithmName]::SHA256,[Security.Cryptography.RSASignaturePadding]::Pkcs1)
    $rootRequest.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]::new($true,$false,0,$true))
    $rootRequest.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509KeyUsageExtension]::new([Security.Cryptography.X509Certificates.X509KeyUsageFlags]::KeyCertSign,$true))
    $root = $rootRequest.CreateSelfSigned([DateTimeOffset]::UtcNow.AddMinutes(-5),[DateTimeOffset]::UtcNow.AddDays(1))
    $serverRequest = [Security.Cryptography.X509Certificates.CertificateRequest]::new('CN=localhost',$serverKey,[Security.Cryptography.HashAlgorithmName]::SHA256,[Security.Cryptography.RSASignaturePadding]::Pkcs1)
    $san = [Security.Cryptography.X509Certificates.SubjectAlternativeNameBuilder]::new()
    $san.AddDnsName('localhost'); $san.AddIpAddress([Net.IPAddress]::Loopback)
    $serverRequest.CertificateExtensions.Add($san.Build())
    $serverRequest.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]::new($false,$false,0,$true))
    $eku = [Security.Cryptography.OidCollection]::new(); $null=$eku.Add([Security.Cryptography.Oid]::new('1.3.6.1.5.5.7.3.1'))
    $serverRequest.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension]::new($eku,$true))
    $serial = [byte[]]::new(16); [Security.Cryptography.RandomNumberGenerator]::Fill($serial)
    $public = $serverRequest.Create($root,[DateTimeOffset]::UtcNow.AddMinutes(-5),[DateTimeOffset]::UtcNow.AddHours(12),$serial)
    $server = [Security.Cryptography.X509Certificates.RSACertificateExtensions]::CopyWithPrivateKey($public,$serverKey)
    [IO.File]::WriteAllBytes((Join-Path $OutputDirectory 'test-root.cer'),$root.Export([Security.Cryptography.X509Certificates.X509ContentType]::Cert))
    [IO.File]::WriteAllBytes((Join-Path $OutputDirectory 'test-server.pfx'),$server.Export([Security.Cryptography.X509Certificates.X509ContentType]::Pfx,''))
    $root.Dispose(); $public.Dispose(); $server.Dispose()
} finally { $rootKey.Dispose(); $serverKey.Dispose() }
