using System.IO.Compression;
using System.Security.Cryptography;
using System.Text.Json;

namespace Notifica.Agent;

internal static class DesktopUpdateSelfTest
{
    internal static async Task<int> Run()
    {
        int checks = 0;
        void Require(bool value) { if (!value) throw new InvalidOperationException("UPDATE_TEST_FAILED"); checks++; }
        string root = Path.Combine(Path.GetTempPath(), "notifica-update-test-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        try {
            var current = new DesktopRelease(typeof(Program).Assembly.GetName().Version!.ToString(3), new string('a', 64), new string('b', 64));
            current.Validate(); Require(!current.IsNewer);
            Require((current with { Version = "99.0.0" }).IsNewer);
            foreach (var invalid in new[] { current with { Version = "1.0.0;evil" }, current with { ZipSha256 = "bad" } }) {
                try { invalid.Validate(); throw new Exception("ACCEPTED"); } catch (InvalidOperationException) { checks++; }
            }
            foreach (string url in new[] { "http://notificaia.cl/file", "https://evil.invalid/file", "https://notificaia.cl.evil.invalid/file", "https://user@notificaia.cl/file", "https://notificaia.cl:444/file" })
                Require(!DesktopUpdate.AllowedDownload(new Uri(url)));
            Require(DesktopUpdate.AllowedDownload(new Uri("https://release-assets.githubusercontent.com/file")));
            string file = Path.Combine(root, "bytes"); await File.WriteAllTextAsync(file, "verified bytes");
            string hash = Convert.ToHexStringLower(SHA256.HashData(await File.ReadAllBytesAsync(file)));
            await DesktopUpdate.VerifyHash(file, hash, CancellationToken.None); checks++;
            await File.AppendAllTextAsync(file, "changed");
            try { await DesktopUpdate.VerifyHash(file, hash, CancellationToken.None); throw new Exception("ACCEPTED"); }
            catch (InvalidOperationException) { checks++; }
            foreach (string extra in new[] { "../escaped.ps1", "Update-Notifica.ps1", "payload.zip:evil", "extra.ps1", "" }) {
                string zip = Path.Combine(root, Guid.NewGuid() + ".zip");
                using (var archive = ZipFile.Open(zip, ZipArchiveMode.Create)) {
                    foreach (var name in DesktopUpdate.PackageFiles) { using var writer = new StreamWriter(archive.CreateEntry(name).Open()); writer.Write("synthetic"); }
                    if (extra.Length > 0) archive.CreateEntry(extra);
                }
                string destination = Path.Combine(root, Guid.NewGuid().ToString("N")); Directory.CreateDirectory(destination);
                try { DesktopUpdate.ExtractPackage(zip, destination); Require(extra == ""); }
                catch (InvalidOperationException) { Require(extra != ""); }
            }
            Console.WriteLine(JsonSerializer.Serialize(new { passed = checks, realInstallationModified = false }, Configuration.Json));
            return 0;
        } finally { Directory.Delete(root, recursive: true); }
    }
}
