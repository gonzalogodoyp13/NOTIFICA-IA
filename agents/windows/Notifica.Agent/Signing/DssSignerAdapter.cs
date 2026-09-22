using System.Buffers.Binary;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;

namespace Notifica.Agent.Signing;

internal sealed record DssEngineOptions(string JavaExecutable, string BridgeJar, string LibrariesDirectory,
    string OutputDirectory, string[] TrustedCertificateFiles, string? TimestampUrl = null, string? TimestampPolicyOid = null)
{
    internal void Validate()
    {
        foreach (string path in new[] { JavaExecutable, BridgeJar, LibrariesDirectory, OutputDirectory }.Concat(TrustedCertificateFiles))
            LocalSigningFiles.RequireLocalPath(path);
        if (TrustedCertificateFiles.Length is < 1 or > 20 || !File.Exists(JavaExecutable) || !File.Exists(BridgeJar)
            || !File.Exists(Path.Combine(LibrariesDirectory, "dss-pades-6.5.jar"))) throw new SigningFailure(SigningError.EngineFailure);
        if (TimestampUrl is not null && (!Uri.TryCreate(TimestampUrl, UriKind.Absolute, out var uri)
            || uri.Scheme != "https" || uri.UserInfo.Length > 0 || uri.Fragment.Length > 0))
            throw new SigningFailure(SigningError.TimestampUnavailable);
        if (TimestampPolicyOid is not null && !System.Text.RegularExpressions.Regex.IsMatch(TimestampPolicyOid, "^[0-9]+(\\.[0-9]+)+$"))
            throw new SigningFailure(SigningError.TimestampUnavailable);
    }
}

internal static class LocalSigningFiles
{
    internal static void RequireLocalPath(string path)
    {
        if (!Path.IsPathFullyQualified(path) || path.StartsWith(@"\\", StringComparison.Ordinal)
            || path.IndexOf(':', 2) >= 0) throw new SigningFailure(SigningError.InvalidBatch);
        for (FileSystemInfo? current = File.Exists(path) ? new FileInfo(path) : new DirectoryInfo(path);
             current is not null; current = current is FileInfo file ? file.Directory : ((DirectoryInfo)current).Parent)
            if (current.Exists && current.Attributes.HasFlag(FileAttributes.ReparsePoint))
                throw new SigningFailure(SigningError.InvalidBatch);
    }
}

internal sealed class DssSignerAdapter(DssEngineOptions options) : IPdfSignerAdapter
{
    public async Task<SignedPdf> SignAsync(SigningDocument document, SigningProfile profile, ISigningToken token, CancellationToken cancellation)
    {
        options.Validate();
        LocalSigningFiles.RequireLocalPath(document.SourcePath);
        if (profile != SigningProfile.PADES_B && options.TimestampUrl is null) throw new SigningFailure(SigningError.TimestampUnavailable);
        // Keep the exact input open without write/delete sharing throughout the
        // helper invocation. Java also checks the checksum before preparing CMS.
        await using var source = new FileStream(document.SourcePath, FileMode.Open, FileAccess.Read, FileShare.Read);
        if (source.Length is < 8 or > 32 * 1024 * 1024) throw new SigningFailure(SigningError.InvalidBatch);
        string sourceHash = Convert.ToHexStringLower(await SHA256.HashDataAsync(source, cancellation));
        if (sourceHash != document.SourceSha256) throw new SigningFailure(SigningError.InputChanged);
        Directory.CreateDirectory(options.OutputDirectory);
        string output = Path.Combine(options.OutputDirectory, Guid.NewGuid().ToString("N") + ".pdf");
        string pending = output + ".part";
        using var process = new Process { StartInfo = new ProcessStartInfo(options.JavaExecutable) {
            UseShellExecute = false, CreateNoWindow = true, RedirectStandardInput = true,
            RedirectStandardOutput = true, RedirectStandardError = true,
            WorkingDirectory = options.OutputDirectory
        } };
        foreach (string variable in new[] { "JAVA_TOOL_OPTIONS", "_JAVA_OPTIONS", "JDK_JAVA_OPTIONS", "CLASSPATH" }) process.StartInfo.Environment.Remove(variable);
        foreach (string argument in new[] { "-Xmx256m", "-XX:-HeapDumpOnOutOfMemoryError", "-XX:+DisableAttachMechanism", "-cp",
            options.BridgeJar + Path.PathSeparator + Path.Combine(options.LibrariesDirectory, "*"), "NotificaDss" })
            process.StartInfo.ArgumentList.Add(argument);
        bool started = false;
        Task? drain = null;
        try
        {
            started = process.Start();
            drain = DiscardAsync(process.StandardError.BaseStream, cancellation);
            Stream request = process.StandardInput.BaseStream, response = process.StandardOutput.BaseStream;
            await WriteInteger(request, 0x4e445331, cancellation);
            foreach (string value in new[] { profile.ToString(), document.SourcePath, pending, sourceHash,
                Convert.ToHexStringLower(SHA256.HashData(token.Certificate)) }) await WriteString(request, value, cancellation);
            await WriteBytes(request, token.Certificate, cancellation);
            await WriteInteger(request, token.CertificateChain.Count, cancellation);
            foreach (byte[] certificate in token.CertificateChain) await WriteBytes(request, certificate, cancellation);
            await WriteInteger(request, options.TrustedCertificateFiles.Length, cancellation);
            foreach (string path in options.TrustedCertificateFiles)
            {
                using var root = X509CertificateLoader.LoadCertificateFromFile(path);
                await WriteBytes(request, root.RawData, cancellation);
            }
            await WriteString(request, options.TimestampUrl ?? "", cancellation);
            await WriteString(request, options.TimestampPolicyOid ?? "", cancellation);
            await request.FlushAsync(cancellation);
            await Expect(response, "TO_SIGN", cancellation);
            byte[] toSign = await ReadBytes(response, 128 * 1024, cancellation);
            cancellation.ThrowIfCancellationRequested();
            byte[] signature = token.SignSha256(toSign);
            await WriteBytes(request, signature, cancellation);
            await request.FlushAsync(cancellation);
            process.StandardInput.Close();
            await Expect(response, "OK", cancellation);
            string checksum = await ReadString(response, cancellation);
            string actualProfile = await ReadString(response, cancellation);
            await process.WaitForExitAsync(cancellation);
            await drain;
            if (process.ExitCode != 0 || actualProfile != profile.ToString() || !SigningBatch.IsSha256(checksum))
                throw new SigningFailure(SigningError.ValidationFailed);
            await using (var artifact = new FileStream(pending, FileMode.Open, FileAccess.Read, FileShare.None))
            {
                string actual = Convert.ToHexStringLower(await SHA256.HashDataAsync(artifact, cancellation));
                if (actual != checksum) throw new SigningFailure(SigningError.ValidationFailed);
            }
            cancellation.ThrowIfCancellationRequested();
            File.Move(pending, output, false);
            return new(document.Id, output, checksum, profile);
        }
        finally
        {
            if (started && !process.HasExited) { process.Kill(entireProcessTree: true); await process.WaitForExitAsync(CancellationToken.None); }
            if (drain is not null) { try { await drain; } catch (OperationCanceledException) { } }
            // Only this invocation's unpredictable, owned .part file is removed.
            if (File.Exists(pending)) File.Delete(pending);
        }
    }
    private static async Task DiscardAsync(Stream stream, CancellationToken cancellation)
    {
        byte[] buffer = new byte[4096];
        while (await stream.ReadAsync(buffer, cancellation) != 0) { /* no log/exception text retained */ }
    }
    private static async Task Expect(Stream stream, string expected, CancellationToken cancellation)
    {
        string status = await ReadString(stream, cancellation);
        if (status == "ERROR")
        {
            string value = await ReadString(stream, cancellation);
            throw new SigningFailure(Enum.TryParse<SigningError>(value, out var code) && Enum.IsDefined(code) ? code : SigningError.EngineFailure);
        }
        if (status != expected) throw new SigningFailure(SigningError.EngineFailure);
    }
    private static async Task WriteInteger(Stream stream, int value, CancellationToken cancellation)
    {
        byte[] bytes = new byte[4]; BinaryPrimitives.WriteInt32BigEndian(bytes, value);
        await stream.WriteAsync(bytes, cancellation);
    }
    private static async Task WriteBytes(Stream stream, byte[] value, CancellationToken cancellation)
    {
        await WriteInteger(stream, value.Length, cancellation); await stream.WriteAsync(value, cancellation);
    }
    private static Task WriteString(Stream stream, string value, CancellationToken cancellation) => WriteBytes(stream, Encoding.UTF8.GetBytes(value), cancellation);
    private static async Task<byte[]> ReadBytes(Stream stream, int maximum, CancellationToken cancellation)
    {
        byte[] prefix = new byte[4]; await stream.ReadExactlyAsync(prefix, cancellation);
        int length = BinaryPrimitives.ReadInt32BigEndian(prefix);
        if (length is < 0 || length > maximum) throw new SigningFailure(SigningError.EngineFailure);
        byte[] bytes = new byte[length]; await stream.ReadExactlyAsync(bytes, cancellation); return bytes;
    }
    private static async Task<string> ReadString(Stream stream, CancellationToken cancellation) => Encoding.UTF8.GetString(await ReadBytes(stream, 128, cancellation));
}
