using System.Security.Principal;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Notifica.Agent;

internal sealed record Configuration(string ServerUrl, string DataDirectory, string AllowedUserSid,
    string KeyName, string Pkcs11Library, string? CertificateFingerprint, bool MachineKey = true,
    Signing.ControlledSigningOptions? ControlledSigning = null, Signing.DssEngineOptions? SigningEngine = null,
    string? ReceiverDirectory = null)
{
    internal static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
        WriteIndented = false
    };
    internal string PipeName => "NotificaSigning-" + KeyName;
    internal void Validate()
    {
        var uri = new Uri(ServerUrl, UriKind.Absolute);
        if (uri.Scheme != "https" || uri.AbsolutePath != "/" || uri.Query.Length != 0 || uri.UserInfo.Length != 0 || uri.Fragment.Length != 0)
            throw new InvalidOperationException("HTTPS_ORIGIN_REQUIRED");
        if (!Path.IsPathFullyQualified(DataDirectory) || !Path.IsPathFullyQualified(Pkcs11Library)) throw new InvalidOperationException("ABSOLUTE_PATH_REQUIRED");
        if (!Guid.TryParseExact(KeyName, "D", out _)) throw new InvalidOperationException("INVALID_KEY_NAME");
        _ = new SecurityIdentifier(AllowedUserSid);
        if (CertificateFingerprint is not null && !System.Text.RegularExpressions.Regex.IsMatch(CertificateFingerprint, "^[a-f0-9]{64}$")) throw new InvalidOperationException("INVALID_CERTIFICATE_FINGERPRINT");
        ControlledSigning?.Validate(this);
        if (ReceiverDirectory is not null) Signing.LocalSigningFiles.RequireLocalPath(ReceiverDirectory);
        if (SigningEngine is not null)
        {
            if (ControlledSigning is not null || CertificateFingerprint is null) throw new InvalidOperationException("INVALID_SIGNING_CONFIGURATION");
            Signing.LocalSigningFiles.RequireLocalPath(DataDirectory);
            SigningEngine.Validate();
        }
    }
    internal static Configuration Load(string path)
    {
        var config = JsonSerializer.Deserialize<Configuration>(File.ReadAllText(path), Json) ?? throw new InvalidOperationException("CONFIGURATION_MISSING");
        config.Validate();
        return config;
    }
}
internal sealed record Identity(string DeviceId, int OfficeId, string Role);
internal sealed record PublicCertificate(string Fingerprint, string Subject, string Issuer, DateTimeOffset NotBefore, DateTimeOffset ExpiresAt, bool DigitalSignature);
internal sealed record TokenHealth(string Token, PublicCertificate? Certificate);
internal sealed record AgentStatus(string Connectivity, string Health, string? ErrorCode, string? DeviceId,
    string? Role, DateTimeOffset? LastSuccessfulContactAt, PublicCertificate? Certificate, string? DeviceKeyFingerprint = null, string? MirrorError = null,
    Signing.RemoteSessionView? RemoteSession = null, string? OfficeFolderPath = null);
