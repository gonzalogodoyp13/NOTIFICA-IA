using System.Diagnostics;
using System.Net;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text.Json;

namespace Notifica.Agent;

internal static class OfficeFolderSelfTest
{
    internal static int Read(string path, string expected)
    {
        try { return Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(path))) == expected ? 0 : 2; }
        catch { return 3; }
    }
    private static void Require(bool value, string code) { if (!value) throw new IOException(code); }
    private static async Task<int> Open(string path, string hash)
    {
        using var child = new Process { StartInfo = new ProcessStartInfo(Environment.ProcessPath!) { UseShellExecute = false, CreateNoWindow = true } };
        child.StartInfo.ArgumentList.Add("--office-folder-read-test"); child.StartInfo.ArgumentList.Add(path); child.StartInfo.ArgumentList.Add(hash);
        child.Start(); using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(60));
        try { await child.WaitForExitAsync(deadline.Token); return child.ExitCode; }
        catch { if (!child.HasExited) child.Kill(); throw; }
    }
    internal static async Task<int> Run()
    {
        CloudFiles.AssertAbi();
        string root = Path.Combine(Path.GetTempPath(), "NotificaOfficeFolderTest-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        var config = new Configuration("https://localhost/", root, WindowsIdentity.GetCurrent().User!.Value, Guid.NewGuid().ToString(),
            Path.Combine(root, "missing.dll"), null, false, ReceiverDirectory: Path.Combine(root, "Firmados"));
        using var key = new DeviceKey(config); using var handler = new Handler(); using var api = new DeviceApi(config, key, handler);
        var identity = new Identity("signing-laptop", 5, "SIGNER");
        string folder = OfficeFolder.Folder(config, 5);
        try {
            using (var provider = new OfficeFolder(config, api, () => identity)) {
                await provider.Tick(CancellationToken.None);
                string file = Path.Combine(folder, handler.File.FileName);
                Require(File.Exists(file) && CloudFiles.Owns(file, handler.File.SignatureId), "NATIVE_PLACEHOLDER_CREATED");
                Require(handler.Downloads == 0 && new FileInfo(file).Length == handler.File.SizeBytes, "LISTING_HAS_NO_PDF_DOWNLOADS");
                Require(await Open(file, handler.File.ChecksumSha256) == 0 && handler.Downloads == 1, "OPEN_HYDRATES_VERIFIED_PDF");
                await provider.Tick(CancellationToken.None);
                Require(handler.Downloads == 1, "REFRESH_DOES_NOT_DOWNLOAD");
                File.WriteAllText(Path.Combine(folder, "personal.txt"), "preserve");
                handler.FailPage = true;
                try { await provider.Tick(CancellationToken.None); throw new IOException("EXPECTED_OFFLINE"); } catch (HttpRequestException) { }
                Require(File.Exists(file), "FAILED_LIST_PRESERVES_VIEW"); handler.FailPage = false;
            }
            using (var restarted = new OfficeFolder(config, api, () => identity)) {
                await restarted.Tick(CancellationToken.None);
                Require(handler.Downloads == 1, "RESTART_PRESERVES_CACHE");
                handler.Empty = true; await restarted.Tick(CancellationToken.None);
                Require(!File.Exists(Path.Combine(folder, handler.File.FileName)), "WINDOW_EXPIRY_REMOVES_PLACEHOLDER");
                Require(File.ReadAllText(Path.Combine(folder, "personal.txt")) == "preserve", "USER_FILE_PRESERVED");
                handler.Empty = false; handler.Corrupt = true; await restarted.Tick(CancellationToken.None);
                Require(await Open(Path.Combine(folder, handler.File.FileName), handler.File.ChecksumSha256) != 0, "CORRUPTION_DENIED");
                handler.Corrupt = false;
                Require(await Open(Path.Combine(folder, handler.File.FileName), handler.File.ChecksumSha256) == 0, "RETRY_AFTER_CORRUPTION");
            }
            using (var revokedAfterRestart = new OfficeFolder(config, api, () => identity)) {
                revokedAfterRestart.RevokeLocalAccess();
                Require(!File.Exists(Path.Combine(folder, handler.File.FileName)), "REVOCATION_CLEARS_PERSISTED_CACHE");
                Require(File.Exists(Path.Combine(folder, "personal.txt")), "REVOCATION_PRESERVES_USER_FILES");
            }
            Console.WriteLine(JsonSerializer.Serialize(new { passed = 12, nativeCloudFiles = true, signerFolder = true, onDemand = true,
                expiration = true, corruptionRejected = true, restart = true, userFilesPreserved = true }));
            return 0;
        } finally {
            key.DeleteTestKey();
            _ = CloudFiles.CfUnregisterSyncRoot(folder);
            // Exact isolated test root; no production folder or user files involved.
            foreach (var file in Directory.EnumerateFiles(root, "*", SearchOption.AllDirectories)) File.SetAttributes(file, FileAttributes.Normal);
            Directory.Delete(root, true);
        }
    }
    private sealed class Handler : HttpMessageHandler
    {
        private readonly byte[] bytes = "%PDF-1.7\nNative office folder test\n%%EOF"u8.ToArray();
        internal int Downloads; internal bool Empty, FailPage, Corrupt;
        internal OfficeFile File => new("signature", "document", "version", "C-123-Notificacion-version.pdf", "Notificación", "C-123", DateTimeOffset.UtcNow.AddDays(-1),
            Convert.ToHexStringLower(SHA256.HashData(bytes)), bytes.Length);
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            object value;
            switch (request.RequestUri!.Segments.Last()) {
                case "challenge": value = new { challengeId = "challenge", nonce = "nonce" }; break;
                case "session-renew": value = new { token = new string('a', 43), expiresAt = DateTimeOffset.UtcNow.AddMinutes(5) }; break;
                case "office-folder":
                    if (FailPage) throw new HttpRequestException("OFFLINE");
                    value = new OfficePage(5, 50, DateTimeOffset.UtcNow, DateTimeOffset.UtcNow.AddDays(-50), null, Empty ? [] : [File]); break;
                case "office-folder-download":
                    Downloads++;
                    var content = new ByteArrayContent(Corrupt ? "%PDF-corrupt"u8.ToArray() : bytes); content.Headers.ContentType = new("application/pdf");
                    return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = content });
                default: throw new IOException("UNEXPECTED_ACTION");
            }
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(JsonSerializer.Serialize(new { ok = true, data = value }, Configuration.Json)) });
        }
    }
}
