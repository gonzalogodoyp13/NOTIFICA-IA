using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Text.Json;

namespace Notifica.Agent.Signing;

internal static class DssSelfTest
{
    internal static async Task<int> Run(string engineConfiguration)
    {
        var configured = JsonSerializer.Deserialize<DssEngineOptions>(File.ReadAllText(engineConfiguration), Configuration.Json)
            ?? throw new SigningFailure(SigningError.InvalidBatch);
        string directory = Path.Combine(configured.OutputDirectory, "software-test-" + Guid.NewGuid().ToString("N"));
        LocalSigningFiles.RequireLocalPath(directory);
        Directory.CreateDirectory(directory);
        using var key = RSA.Create(2048);
        var request = new CertificateRequest("CN=NOTIFICA synthetic signing test", key, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        request.CertificateExtensions.Add(new X509KeyUsageExtension(X509KeyUsageFlags.DigitalSignature, true));
        request.CertificateExtensions.Add(new X509BasicConstraintsExtension(false, false, 0, true));
        using var certificate = request.CreateSelfSigned(DateTimeOffset.UtcNow.AddDays(-1), DateTimeOffset.UtcNow.AddDays(2));
        string root = Path.Combine(directory, "synthetic-trust.cer");
        await File.WriteAllBytesAsync(root, certificate.RawData);
        string source = Path.Combine(directory, "controlled-input.pdf");
        await File.WriteAllBytesAsync(source, SimplePdf());
        var document = new SigningDocument("synthetic-pdf", source, Convert.ToHexStringLower(SHA256.HashData(await File.ReadAllBytesAsync(source))));
        var options = configured with { OutputDirectory = directory, TrustedCertificateFiles = [root], TimestampUrl = null, TimestampPolicyOid = null };
        using var token = new SoftwareToken(key, certificate.RawData);
        using var deadline = new CancellationTokenSource(TimeSpan.FromMinutes(2));
        var adapter = new DssSignerAdapter(options);
        SignedPdf result = await adapter.SignAsync(document, SigningProfile.PADES_B, token, deadline.Token);
        if (token.Signatures != 1 || result.Profile != SigningProfile.PADES_B || !File.Exists(result.OutputPath))
            throw new InvalidOperationException("DSS_BASIC_FAILED");
        try { await adapter.SignAsync(document with { SourceSha256 = new string('a', 64) }, SigningProfile.PADES_B, token, deadline.Token); throw new InvalidOperationException("INPUT_MISMATCH_ACCEPTED"); }
        catch (SigningFailure failure) when (failure.Code == SigningError.InputChanged) { }
        try { await adapter.SignAsync(document, SigningProfile.PADES_LT, token, deadline.Token); throw new InvalidOperationException("LT_WITHOUT_TSA_ACCEPTED"); }
        catch (SigningFailure failure) when (failure.Code == SigningError.TimestampUnavailable) { }
        if (token.Signatures != 1) throw new InvalidOperationException("UNEXPECTED_PRIVATE_KEY_OPERATION");
        SignedPdf? longTerm = null;
        SignedPdf? archival = null;
        if (configured.TimestampUrl is not null)
        {
            var ltAdapter = new DssSignerAdapter(options with { TimestampUrl = configured.TimestampUrl,
                TimestampPolicyOid = configured.TimestampPolicyOid, TrustedCertificateFiles = [root, .. configured.TrustedCertificateFiles] });
            longTerm = await ltAdapter.SignAsync(document, SigningProfile.PADES_LT, token, deadline.Token);
            if (longTerm.Profile != SigningProfile.PADES_LT || token.Signatures != 2) throw new InvalidOperationException("DSS_LT_FAILED");
            archival = await ltAdapter.SignAsync(document, SigningProfile.PADES_LTA, token, deadline.Token);
            if (archival.Profile != SigningProfile.PADES_LTA || token.Signatures != 3) throw new InvalidOperationException("DSS_LTA_FAILED");
        }
        Console.WriteLine(JsonSerializer.Serialize(new { passed = longTerm is null ? 3 : 5, realTokenLoginAttempts = 0, output = result, longTerm, archival,
            trust = "Synthetic leaf is explicitly trusted for this software test only; no system trust change", checks = new[] {
                "Real DSS/PDFBox creates and validates a SHA-256 PAdES-B PDF from a software RSA signature",
                "Tampered source digest rejected before private-key operation", "LT without TSA rejected before private-key operation" },
            ltValidated = longTerm is not null, ltaValidated = archival is not null }, Configuration.Json));
        return 0;
    }
    private static byte[] SimplePdf()
    {
        string content = "BT /F1 18 Tf 60 750 Td (NOTIFICA - SYNTHETIC SIGNING TEST ONLY) Tj ET\n";
        string[] objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
            "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", $"<< /Length {content.Length} >>\nstream\n{content}endstream"];
        var pdf = new StringBuilder("%PDF-1.7\n");
        var offsets = new List<int>();
        for (int i = 0; i < objects.Length; i++) { offsets.Add(pdf.Length); pdf.Append($"{i + 1} 0 obj\n{objects[i]}\nendobj\n"); }
        int xref = pdf.Length;
        pdf.Append($"xref\n0 {objects.Length + 1}\n0000000000 65535 f \n");
        foreach (int offset in offsets) pdf.Append(offset.ToString("D10", System.Globalization.CultureInfo.InvariantCulture) + " 00000 n \n");
        pdf.Append($"trailer\n<< /Size {objects.Length + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n");
        return Encoding.ASCII.GetBytes(pdf.ToString());
    }
    private sealed class SoftwareToken(RSA key, byte[] certificate) : ISigningToken
    {
        internal int Signatures;
        public byte[] Certificate => certificate;
        public IReadOnlyList<byte[]> CertificateChain => [certificate];
        public void Authenticate(PinBuffer pin) => throw new InvalidOperationException("NO_TOKEN_LOGIN_IN_SOFTWARE_TEST");
        public byte[] SignSha256(ReadOnlySpan<byte> data) { Signatures++; return key.SignData(data, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1); }
        public void Dispose() { }
    }
}
