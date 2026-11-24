using System.Diagnostics;
using System.IO.Compression;
using System.Net;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Notifica.Agent;

internal sealed record DesktopRelease(string Version, string ZipSha256, string ManifestSha256)
{
    internal void Validate()
    {
        if (!Regex.IsMatch(Version, @"^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$") ||
            !Regex.IsMatch(ZipSha256, "^[a-f0-9]{64}$") || !Regex.IsMatch(ManifestSha256, "^[a-f0-9]{64}$"))
            throw new InvalidOperationException("INVALID_UPDATE_METADATA");
    }
    internal bool IsNewer => System.Version.Parse(Version) > typeof(Program).Assembly.GetName().Version!;
}

internal static class DesktopUpdate
{
    private const string Origin = "https://notificaia.cl";
    private const long MaximumZip = 1536L * 1024 * 1024;
    internal static readonly HashSet<string> PackageFiles = new(StringComparer.Ordinal) {
        "distribution.json", "payload.zip", "Install-Notifica.ps1", "ReleaseTools.psm1", "ManagedDistribution.psm1",
        "install-request.example.json", "INSTALACION.md", "Update-Notifica.ps1", "ManagedUpdate.psm1", "ACTUALIZACION.md"
    };
    private static HttpClient Client() => new(new HttpClientHandler { AllowAutoRedirect = false }) { Timeout = Timeout.InfiniteTimeSpan };
    internal static bool AllowedDownload(Uri uri) => uri.Scheme == "https" && uri.IsDefaultPort && uri.UserInfo.Length == 0 &&
        (uri.Host == "notificaia.cl" || uri.Host == "www.notificaia.cl" || uri.Host == "release-assets.githubusercontent.com");
    internal static async Task<DesktopRelease?> Check(CancellationToken ct)
    {
        using var client = Client();
        var uri = new Uri(Origin + "/api/signing/device/update-manifest");
        HttpResponseMessage? received = null;
        for (int redirect = 0; redirect < 4; redirect++) {
            if (!AllowedDownload(uri) || uri.Host == "release-assets.githubusercontent.com") throw new IOException("UNTRUSTED_UPDATE_METADATA");
            received = await client.GetAsync(uri, HttpCompletionOption.ResponseHeadersRead, ct);
            if ((int)received.StatusCode is not (301 or 302 or 307 or 308)) break;
            var location = received.Headers.Location; received.Dispose(); received = null;
            uri = new Uri(uri, location ?? throw new IOException());
        }
        using var response = received ?? throw new IOException("UPDATE_REDIRECT_LIMIT");
        if (response.StatusCode == HttpStatusCode.NoContent) return null;
        response.EnsureSuccessStatusCode();
        await response.Content.LoadIntoBufferAsync(16 * 1024, ct);
        var release = JsonSerializer.Deserialize<DesktopRelease>(await response.Content.ReadAsStringAsync(ct), Configuration.Json)
            ?? throw new InvalidOperationException("INVALID_UPDATE_METADATA");
        release.Validate(); return release;
    }
    internal static string InstalledExecutable()
    {
        string root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "NotificaIA", "Agent");
        string executable = Path.GetFullPath(Environment.ProcessPath!);
        if (!executable.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("MANAGED_INSTALLATION_REQUIRED");
        RejectReparseParents(executable);
        string recordPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "NotificaIA", "Agent", "managed-installation.json");
        RejectReparseParents(recordPath);
        using var record = JsonDocument.Parse(File.ReadAllText(recordPath));
        if (record.RootElement.GetProperty("status").GetString() != "installed" ||
            record.RootElement.GetProperty("mode").GetString() != "operator-managed-unsigned" ||
            !string.Equals(executable, Path.Combine(record.RootElement.GetProperty("target").GetString()!, "agent", "Notifica.Agent.exe"), StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("MANAGED_INSTALLATION_REQUIRED");
        return executable;
    }
    internal static void Launch()
    {
        var start = new ProcessStartInfo(InstalledExecutable()) { UseShellExecute = true, Verb = "runas" };
        start.ArgumentList.Add("--install-published-update");
        Process.Start(start)?.Dispose();
    }
    private static void RejectReparseParents(string path)
    {
        for (string? current = path; current is not null; current = Path.GetDirectoryName(current))
            if ((File.Exists(current) || Directory.Exists(current)) && (File.GetAttributes(current) & FileAttributes.ReparsePoint) != 0)
                throw new InvalidOperationException("UPDATE_REPARSE_PATH");
    }
    internal static async Task VerifyHash(string path, string expected, CancellationToken ct)
    {
        await using var stream = File.OpenRead(path);
        if (Convert.ToHexStringLower(await SHA256.HashDataAsync(stream, ct)) != expected)
            throw new InvalidOperationException("UPDATE_CHECKSUM_MISMATCH");
    }
    internal static void ExtractPackage(string zip, string destination)
    {
        using var archive = ZipFile.OpenRead(zip);
        var seen = new HashSet<string>(StringComparer.Ordinal);
        long total = 0;
        foreach (var entry in archive.Entries) {
            // Exact filenames forbid traversal, alternate streams, symlinks and duplicate entries.
            if (!PackageFiles.Contains(entry.FullName) || !seen.Add(entry.FullName) || entry.Length < 0 ||
                (entry.FullName != "payload.zip" && entry.Length > 1024 * 1024) || (total += entry.Length) > MaximumZip)
                throw new InvalidOperationException("INVALID_UPDATE_ARCHIVE");
            entry.ExtractToFile(Path.Combine(destination, entry.FullName), overwrite: false);
        }
        if (!seen.SetEquals(PackageFiles)) throw new InvalidOperationException("INCOMPLETE_UPDATE_ARCHIVE");
    }
    private static async Task Download(string path, CancellationToken ct)
    {
        using var client = Client();
        var uri = new Uri(Origin + "/api/signing/device/update-download");
        for (int redirect = 0; redirect < 5; redirect++) {
            if (!AllowedDownload(uri)) throw new InvalidOperationException("UNTRUSTED_UPDATE_DOWNLOAD");
            using var response = await client.GetAsync(uri, HttpCompletionOption.ResponseHeadersRead, ct);
            if ((int)response.StatusCode is 301 or 302 or 303 or 307 or 308) {
                uri = new Uri(uri, response.Headers.Location ?? throw new IOException()); continue;
            }
            response.EnsureSuccessStatusCode();
            if (response.Content.Headers.ContentLength > MaximumZip) throw new IOException("UPDATE_TOO_LARGE");
            await using var input = await response.Content.ReadAsStreamAsync(ct);
            await using var output = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None);
            byte[] buffer = new byte[128 * 1024]; long total = 0; int count;
            while ((count = await input.ReadAsync(buffer, ct)) != 0) {
                if ((total += count) > MaximumZip) throw new IOException("UPDATE_TOO_LARGE");
                await output.WriteAsync(buffer.AsMemory(0, count), ct);
            }
            return;
        }
        throw new IOException("UPDATE_REDIRECT_LIMIT");
    }
    internal static async Task Install(Action<string> progress)
    {
        using var identity = WindowsIdentity.GetCurrent();
        if (!new WindowsPrincipal(identity).IsInRole(WindowsBuiltInRole.Administrator)) throw new InvalidOperationException("ADMINISTRATOR_REQUIRED");
        _ = InstalledExecutable();
        using var timeout = new CancellationTokenSource(TimeSpan.FromMinutes(30));
        var ct = timeout.Token;
        progress("Comprobando la versión publicada…");
        // Re-fetch trusted metadata AFTER elevation; no user-controlled URL, script or hash is accepted.
        var release = await Check(ct) ?? throw new InvalidOperationException("NO_PUBLISHED_UPDATE");
        if (!release.IsNewer) throw new InvalidOperationException("ALREADY_CURRENT");
        string parent = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "NotificaIA", "Agent");
        string stage = Path.Combine(parent, "update-" + Guid.NewGuid().ToString("N"));
        RejectReparseParents(parent);
        var security = new DirectorySecurity();
        security.SetAccessRuleProtection(true, false);
        foreach (var sid in new[] { WellKnownSidType.BuiltinAdministratorsSid, WellKnownSidType.LocalSystemSid })
            security.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(sid, null), FileSystemRights.FullControl,
                InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit, PropagationFlags.None, AccessControlType.Allow));
        FileSystemAclExtensions.CreateDirectory(security, stage);
        string zip = Path.Combine(stage, "download.zip"), package = Path.Combine(stage, "package");
        Directory.CreateDirectory(package);
        progress("Descargando y verificando la actualización…");
        await Download(zip, ct);
        await VerifyHash(zip, release.ZipSha256, ct);
        await Task.Run(() => ExtractPackage(zip, package), ct);
        await VerifyHash(Path.Combine(package, "distribution.json"), release.ManifestSha256, ct);
        using (var manifest = JsonDocument.Parse(await File.ReadAllTextAsync(Path.Combine(package, "distribution.json"), ct))) {
            if (manifest.RootElement.GetProperty("version").GetString() != release.Version) throw new InvalidOperationException("UPDATE_VERSION_MISMATCH");
        }
        // All executable bytes are pinned by the verified archive before running any script.
        // The existing updater verifies its manifest/files again and owns locking, idle checks and rollback.
        progress("Instalando… No apagues el equipo. Se conservarán tus documentos e inscripción.");
        var start = new ProcessStartInfo(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "WindowsPowerShell", "v1.0", "powershell.exe")) {
            UseShellExecute = false, CreateNoWindow = true, WorkingDirectory = package,
            RedirectStandardOutput = true, RedirectStandardError = true
        };
        foreach (string arg in new[] { "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", Path.Combine(package, "Update-Notifica.ps1"), "-ExpectedManifestSha256", release.ManifestSha256 })
            start.ArgumentList.Add(arg);
        using var process = Process.Start(start) ?? throw new IOException("UPDATE_START_FAILED");
        var stdout = process.StandardOutput.ReadToEndAsync(); var stderr = process.StandardError.ReadToEndAsync();
        // Never cancel/kill an installation transaction mid-switch; its updater has bounded operations and rollback.
        await process.WaitForExitAsync();
        var output = await stdout; _ = await stderr;
        await File.WriteAllTextAsync(Path.Combine(stage, "result.txt"), output);
        if (process.ExitCode != 0) {
            if (output.Contains("REVIEW_ACTIVE_WORK")) throw new InvalidOperationException("REVIEW_ACTIVE_WORK");
            throw new InvalidOperationException("UPDATE_FAILED");
        }
        File.Delete(zip); // Keep the verified package for explicit interrupted-update recovery.
        progress("Actualización instalada. Abre NOTIFICA desde la bandeja y habilita nuevamente la sesión de firma.");
    }
}
