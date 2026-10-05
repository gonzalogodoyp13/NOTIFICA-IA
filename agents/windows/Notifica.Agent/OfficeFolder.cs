using System.Collections.Concurrent;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text.Json;
using System.Text.RegularExpressions;
using Notifica.Agent.Signing;

namespace Notifica.Agent;

internal sealed record OfficeFile(string SignatureId, string DocumentId, string SignedVersionId, string FileName,
    string Name, string Rol, DateTimeOffset SignedAt, string ChecksumSha256, long SizeBytes)
{
    internal void Validate()
    {
        foreach (string id in new[] { SignatureId, DocumentId, SignedVersionId })
            if (id is null || !Regex.IsMatch(id, "^[a-zA-Z0-9_-]{1,80}$")) throw new IOException("INVALID_OFFICE_FILE");
        if (FileName is null || !Regex.IsMatch(FileName, "^[a-zA-Z0-9_-]{1,160}\\.pdf$") ||
            Regex.IsMatch(FileName, "^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])\\.", RegexOptions.IgnoreCase) ||
            !Regex.IsMatch(ChecksumSha256 ?? "", "^[a-f0-9]{64}$") || SizeBytes is < 8 or > 32 * 1024 * 1024)
            throw new IOException("INVALID_OFFICE_FILE");
    }
    internal object Request => new { signatureId = SignatureId, checksumSha256 = ChecksumSha256 };
}
internal sealed record FolderCursor(DateTimeOffset At, string Id);
internal sealed record OfficePage(int OfficeId, int WindowDays, DateTimeOffset AsOf, DateTimeOffset Cutoff, FolderCursor? NextCursor, OfficeFile[] Documents);
internal sealed record OfficeFolderState(string DeviceId, int OfficeId, string Directory, OfficeFile[] Documents);

internal sealed class OfficeFolder(Configuration config, DeviceApi api, Func<Identity?> identity) : IDisposable
{
    private readonly ConcurrentDictionary<string, OfficeFile> files = new();
    private CloudFiles? cloud;
    private Identity? connected;
    private string? folder;
    internal string? ErrorCode { get; private set; }
    internal string? DirectoryPath => connected is null ? null : folder;
    private string StatePath => Path.Combine(config.DataDirectory, "office-folder-state.json");
    internal static string Folder(Configuration config, int officeId) => Path.Combine(ReceiverMirror.Folder(config), "Oficina-" + officeId);

    private void Connect(Identity device)
    {
        if (connected is not null) {
            if (connected != device) throw new IOException("FOLDER_IDENTITY_CHANGED");
            return;
        }
        string path = Path.GetFullPath(Folder(config, device.OfficeId));
        CloudFiles.RequireRoot(path);
        if (!string.Equals(new DriveInfo(Path.GetPathRoot(path)!).DriveFormat, "NTFS", StringComparison.OrdinalIgnoreCase))
            throw new IOException("CLOUD_FOLDER_REQUIRES_NTFS");
        Directory.CreateDirectory(path);
        if (File.Exists(StatePath)) {
            if (new FileInfo(StatePath).Length > 64 * 1024 * 1024) throw new IOException("INVALID_FOLDER_STATE");
            var state = JsonSerializer.Deserialize<OfficeFolderState>(File.ReadAllText(StatePath), Configuration.Json)!;
            if (state.DeviceId != device.DeviceId || state.OfficeId != device.OfficeId || state.Directory != path) throw new IOException("FOLDER_IDENTITY_CHANGED");
            foreach (var file in state.Documents) { file.Validate(); files[file.SignatureId] = file; }
        } else if (Directory.EnumerateFileSystemEntries(path).Any() || File.GetAttributes(path).HasFlag(FileAttributes.ReparsePoint)) {
            // Never claim an existing user folder or another provider's files.
            throw new IOException("LOCAL_CONFLICT");
        }
        // Give the virtual service account access before removing inheritance.
        // Only the enrolled Windows user receives read access to the office view.
        if (config.MachineKey) {
            using var service = WindowsIdentity.GetCurrent();
            var acl = new DirectorySecurity(); acl.SetAccessRuleProtection(true, false);
            foreach (string sid in new[] { "S-1-5-18", "S-1-5-32-544", service.User!.Value }.Distinct())
                acl.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(sid), FileSystemRights.FullControl,
                    InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit, PropagationFlags.None, AccessControlType.Allow));
            acl.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(config.AllowedUserSid), FileSystemRights.ReadAndExecute,
                InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit, PropagationFlags.None, AccessControlType.Allow));
            new DirectoryInfo(path).SetAccessControl(acl);
        }
        // Persist ownership before first registration/placeholder creation.
        ReceiverMirror.SaveJson(StatePath, new OfficeFolderState(device.DeviceId, device.OfficeId, path, files.Values.ToArray()));
        cloud = new CloudFiles(path, $"NOTIFICA:{device.OfficeId}:{device.DeviceId}", Fetch);
        folder = path; connected = device;
    }
    private async Task<byte[]> Fetch(string signatureId, CancellationToken ct)
    {
        var device = identity();
        if (device is null || device != connected || !files.TryGetValue(signatureId, out var file) || file.SignedAt < DateTimeOffset.UtcNow.AddDays(-50))
            throw new IOException("FOLDER_ACCESS_DENIED");
        try {
            await api.Authenticate(device, ct);
            return await api.DownloadOfficeFile(file, ct);
        } catch { ErrorCode = "NETWORK"; throw; }
    }
    internal async Task Tick(CancellationToken ct)
    {
        var device = identity();
        if (device is null) return;
        // Authentication precedes exposing a persisted folder after restart.
        await api.Authenticate(device, ct);
        var next = new Dictionary<string, OfficeFile>();
        FolderCursor? cursor = null; DateTimeOffset? asOf = null;
        var cursors = new HashSet<string>();
        do {
            object request = asOf is null ? new { } : new { asOf = asOf.Value.UtcDateTime.ToString("O"),
                cursor = cursor is null ? null : new { at = cursor.At.UtcDateTime.ToString("O"), id = cursor.Id } };
            var raw = await api.Post("office-folder", request, ct, true);
            var page = raw.Deserialize<OfficePage>(Configuration.Json) ?? throw new IOException("INVALID_FOLDER_PAGE");
            if (page.OfficeId != device.OfficeId || page.WindowDays != 50 || page.Documents.Length > 100 ||
                asOf is not null && page.AsOf != asOf) throw new IOException("INVALID_FOLDER_PAGE");
            asOf = page.AsOf;
            foreach (var file in page.Documents) {
                file.Validate();
                if (file.SignedAt < page.Cutoff || file.SignedAt > page.AsOf || !next.TryAdd(file.SignatureId, file)) throw new IOException("INVALID_FOLDER_PAGE");
            }
            cursor = page.NextCursor;
            if (cursor is not null && !cursors.Add(JsonSerializer.Serialize(cursor, Configuration.Json))) throw new IOException("INVALID_FOLDER_CURSOR");
        } while (cursor is not null);
        if (next.Values.Select(f => f.FileName).Distinct(StringComparer.OrdinalIgnoreCase).Count() != next.Count) throw new IOException("LOCAL_CONFLICT");
        Connect(device);
        CloudFiles.RequireRoot(folder!);
        // Only a complete, authenticated catalog can evict missing entries.
        // A failed page/network request leaves the prior view untouched.
        Exception? reconciliationError = null;
        var blocked = new HashSet<string>();
        foreach (var prior in files.Values) {
            if (next.TryGetValue(prior.SignatureId, out var current) && current.FileName == prior.FileName &&
                current.ChecksumSha256 == prior.ChecksumSha256) continue;
            try { RemoveOwned(prior); files.TryRemove(prior.SignatureId, out _); }
            catch (Exception error) { reconciliationError ??= error; blocked.Add(prior.SignatureId); }
        }
        foreach (var file in next.Values.Where(f => !blocked.Contains(f.SignatureId))) files[file.SignatureId] = file;
        ReceiverMirror.SaveJson(StatePath, new OfficeFolderState(device.DeviceId, device.OfficeId, folder!, files.Values.ToArray()));
        foreach (var file in next.Values.Where(f => !blocked.Contains(f.SignatureId))) {
            try {
                string path = Path.Combine(folder!, file.FileName);
                if (File.Exists(path)) {
                    if (!CloudFiles.Owns(path, file.SignatureId)) throw new IOException("LOCAL_CONFLICT");
                } else cloud!.Create(folder!, file);
            } catch (Exception error) { reconciliationError ??= error; }
        }
        // One open/locked/conflicting file must not starve the rest of the office.
        if (reconciliationError is not null) throw reconciliationError;
        ErrorCode = null;
    }
    private void RemoveOwned(OfficeFile file)
    {
        string path = Path.Combine(folder!, file.FileName);
        if (!File.Exists(path)) return;
        if (!CloudFiles.Owns(path, file.SignatureId)) throw new IOException("LOCAL_CONFLICT");
        File.SetAttributes(path, File.GetAttributes(path) & ~FileAttributes.ReadOnly);
        File.Delete(path); // Only a provider-owned placeholder/cache; never remote storage.
    }
    internal void RevokeLocalAccess()
    {
        try {
            // A revoked device can restart with a warm cache but no valid session.
            // Load only its protected manifest; never register or enumerate a new
            // root in response to denied authorization.
            var device = identity();
            if (connected is null && device is not null && File.Exists(StatePath)) {
                if (new FileInfo(StatePath).Length > 64 * 1024 * 1024) throw new IOException("INVALID_FOLDER_STATE");
                var state = JsonSerializer.Deserialize<OfficeFolderState>(File.ReadAllText(StatePath), Configuration.Json)!;
                string expected = Path.GetFullPath(Folder(config, device.OfficeId));
                if (state.DeviceId != device.DeviceId || state.OfficeId != device.OfficeId || state.Directory != expected) throw new IOException("FOLDER_IDENTITY_CHANGED");
                CloudFiles.RequireRoot(expected); folder = expected;
                foreach (var file in state.Documents) { file.Validate(); files[file.SignatureId] = file; }
            }
            if (folder is not null) {
                CloudFiles.RequireRoot(folder);
                foreach (var file in files.Values) {
                    try { RemoveOwned(file); files.TryRemove(file.SignatureId, out _); }
                    catch { /* Open files or conflicts remain in the journal for the next cycle. */ }
                }
            }
        } finally { cloud?.Dispose(); cloud = null; connected = null; }
    }
    internal async Task Run(CancellationToken ct)
    {
        int failures = 0;
        while (!ct.IsCancellationRequested) {
            try { await Tick(ct); failures = 0; }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { break; }
            catch (Exception error) {
                ErrorCode = FailurePolicy.TransferCode(error); failures++;
                if (error is ApiFailure { Status: System.Net.HttpStatusCode.Unauthorized or System.Net.HttpStatusCode.Forbidden }) {
                    // Revoke local exposure as well as denying future hydration.
                    try { RevokeLocalAccess(); } catch { /* Never touch an unsafe or mismatched root. */ }
                }
                FailurePolicy.Log(config, ErrorCode, Guid.NewGuid());
            }
            await Task.Delay(FailurePolicy.Delay(failures), ct);
        }
    }
    public void Dispose() { cloud?.Dispose(); }
}
