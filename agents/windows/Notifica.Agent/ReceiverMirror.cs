using System.Security.Cryptography;
using System.Text.Json;
using System.Text.RegularExpressions;
using Notifica.Agent.Signing;

namespace Notifica.Agent;

internal sealed record Delivery(string DeliveryId, string DocumentId, string SignedVersionId, string ChecksumSha256, long SizeBytes)
{
    internal void Validate()
    {
        foreach (var id in new[] { DeliveryId, DocumentId, SignedVersionId })
            if (id is null || !Regex.IsMatch(id, "^[a-zA-Z0-9_-]{1,80}$")) throw new InvalidOperationException("INVALID_DELIVERY");
        if (!Regex.IsMatch(ChecksumSha256 ?? "", "^[a-f0-9]{64}$") || SizeBytes is < 8 or > 4 * 1024 * 1024)
            throw new InvalidOperationException("INVALID_DELIVERY");
    }
    internal object Request => new { deliveryId = DeliveryId, checksumSha256 = ChecksumSha256 };
}
internal sealed record MirrorState(string DeviceId, int OfficeId, string Directory, string? Cursor, Delivery[] Pending);
internal sealed class DeliveryAcknowledgementUncertain(Exception inner) : Exception("ACKNOWLEDGEMENT_UNCERTAIN", inner);
internal sealed class ReceiverMirror(Configuration config, DeviceApi api, Func<Identity?> identity)
{
    internal string? ErrorCode { get; private set; }
    private string StatePath => Path.Combine(config.DataDirectory, "receiver-state.json");
    internal static string Folder(Configuration config) => File.Exists(Path.Combine(config.DataDirectory, "receiver-folder.json"))
        ? JsonSerializer.Deserialize<string>(File.ReadAllText(Path.Combine(config.DataDirectory, "receiver-folder.json")), Configuration.Json)!
        : config.ReceiverDirectory ?? Path.Combine(config.DataDirectory, "Firmados");
    internal static void SaveJson(string path, object value)
    {
        LocalSigningFiles.RequireLocalPath(path);
        string temporary = path + ".part";
        LocalSigningFiles.RequireLocalPath(temporary);
        using (var stream = new FileStream(temporary, FileMode.Create, FileAccess.Write, FileShare.None)) {
            JsonSerializer.Serialize(stream, value, Configuration.Json); stream.Flush(true);
        }
        File.Move(temporary, path, true);
    }
    private static async Task<bool> Matches(string path, Delivery delivery, CancellationToken ct)
    {
        LocalSigningFiles.RequireLocalPath(path);
        if (!File.Exists(path)) return false;
        using var file = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read);
        return file.Length == delivery.SizeBytes && Convert.ToHexStringLower(await SHA256.HashDataAsync(file, ct)) == delivery.ChecksumSha256;
    }
    internal async Task Tick(CancellationToken ct)
    {
        var device = identity();
        if (device is null || device.Role is not ("RECEIVER" or "SIGNER_RECEIVER")) return;
        await api.Authenticate(device, ct);
        string configuredFolder = Folder(config);
        LocalSigningFiles.RequireLocalPath(configuredFolder);
        string folder = Path.GetFullPath(configuredFolder);
        Directory.CreateDirectory(folder);
        MirrorState state;
        if (File.Exists(StatePath)) {
            if (new FileInfo(StatePath).Length > 65536) throw new InvalidOperationException("INVALID_MIRROR_STATE");
            state = JsonSerializer.Deserialize<MirrorState>(File.ReadAllText(StatePath), Configuration.Json)!;
            if (state.DeviceId != device.DeviceId || state.OfficeId != device.OfficeId || state.Directory != folder || state.Pending.Length > 20)
                throw new InvalidOperationException("MIRROR_IDENTITY_CHANGED");
        } else state = new(device.DeviceId, device.OfficeId, folder, null, []);
        if (state.Pending.Length == 0) {
            var result = await api.Post("deliveries", new { cursor = state.Cursor }, ct, true);
            var pending = result.GetProperty("deliveries").Deserialize<Delivery[]>(Configuration.Json)!;
            if (pending.Length > 20) throw new InvalidOperationException("INVALID_DELIVERY");
            foreach (var d in pending) d.Validate();
            state = state with { Cursor = result.GetProperty("nextCursor").GetString(), Pending = pending };
            SaveJson(StatePath, state);
        }
        foreach (var delivery in state.Pending) {
            delivery.Validate();
            try {
                await api.Post("delivery-begin", delivery.Request, ct, true);
                await Materialize(folder, delivery, ct);
                ErrorCode = null;
            } catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
            catch (DeliveryAcknowledgementUncertain) { throw; } // Keep the local file and journal for an idempotent ack replay.
            catch (ApiFailure e) when (e.Code == "AGENT_UPDATE_REQUIRED") { throw; } // Keep pending state; this is not a failed transfer.
            catch (ApiFailure e) when (e.Code is "DELIVERY_NOT_READY" or "DELIVERY_OPERATOR_REQUIRED") {
                // Drop only the pending-page entry, not the file. Server state controls
                // backoff/manual recovery; do not turn a deferred attempt into a new failure.
                ErrorCode = e.Code == "DELIVERY_OPERATOR_REQUIRED" ? "UNKNOWN" : ErrorCode;
            }
            catch (Exception e) {
                ErrorCode = FailurePolicy.TransferCode(e);
                FailurePolicy.Log(config, ErrorCode, Guid.NewGuid());
                await api.Post("delivery-fail", new { deliveryId = delivery.DeliveryId, checksumSha256 = delivery.ChecksumSha256, errorCode = ErrorCode }, ct, true);
            }
            // After an uncertain ack/failure reply this write is not reached; restart replays safely.
            state = state with { Pending = state.Pending.Where(d => d.DeliveryId != delivery.DeliveryId).ToArray() };
            SaveJson(StatePath, state);
        }
    }
    private async Task Materialize(string folder, Delivery delivery, CancellationToken ct)
    {
        string baseName = $"{delivery.DocumentId}-{delivery.SignedVersionId}-firmado";
        string destination = Path.Combine(folder, baseName + ".pdf");
        // Existing different bytes are never overwritten; the hash suffix is stable across restarts.
        for (int collision = 0; File.Exists(destination) && !await Matches(destination, delivery, ct); collision++) {
            if (collision >= 100) throw new IOException("LOCAL_CONFLICT");
            destination = Path.Combine(folder, $"{baseName}-{delivery.ChecksumSha256}{(collision == 0 ? "" : "-" + collision)}.pdf");
        }
        LocalSigningFiles.RequireLocalPath(destination);
        if (!await Matches(destination, delivery, ct)) {
            // Staging belongs to this protected device state, never the user's existing mirror files.
            string stage = Path.Combine(config.DataDirectory, "receiver-" + delivery.DeliveryId + ".download");
            LocalSigningFiles.RequireLocalPath(stage);
            LocalSigningFiles.RequireLocalPath(stage + ".part");
            if (File.Exists(stage + ".part")) File.Delete(stage + ".part");
            if (!await Matches(stage, delivery, ct)) {
                if (File.Exists(stage)) File.Delete(stage);
                await api.Download(delivery.Request, stage, delivery.SizeBytes, delivery.ChecksumSha256, ct, "delivery-download");
            }
            // Stage in the destination filesystem to make final publication an atomic rename.
            string localPart = destination + "." + Guid.NewGuid().ToString("N") + ".part";
            try {
                LocalSigningFiles.RequireLocalPath(folder);
                using (var source = new FileStream(stage, FileMode.Open, FileAccess.Read, FileShare.Read))
                using (var output = new FileStream(localPart, FileMode.CreateNew, FileAccess.Write, FileShare.None)) {
                    await source.CopyToAsync(output, ct); output.Flush(true);
                }
                if (!await Matches(localPart, delivery, ct)) throw new InvalidOperationException("CHECKSUM_MISMATCH");
                File.Move(localPart, destination, false);
            } finally { if (File.Exists(localPart)) File.Delete(localPart); }
            File.Delete(stage);
        }
        // Keep bytes protected from local writes/deletion through the acknowledgement.
        using var verified = new FileStream(destination, FileMode.Open, FileAccess.Read, FileShare.Read);
        if (verified.Length != delivery.SizeBytes || Convert.ToHexStringLower(await SHA256.HashDataAsync(verified, ct)) != delivery.ChecksumSha256)
            throw new InvalidOperationException("CHECKSUM_MISMATCH");
        try {
            var acknowledgement = await api.Post("ack", delivery.Request, ct, true);
            if (!acknowledgement.GetProperty("delivered").GetBoolean()) throw new InvalidOperationException("INVALID_ACKNOWLEDGEMENT");
        } catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
        catch (Exception error) { throw new DeliveryAcknowledgementUncertain(error); }
        string manifest = Path.Combine(config.DataDirectory, "receiver-manifest");
        Directory.CreateDirectory(manifest);
        SaveJson(Path.Combine(manifest, delivery.DeliveryId + ".json"), new { delivery.DocumentId, delivery.SignedVersionId,
            delivery.ChecksumSha256, fileName = Path.GetFileName(destination), deliveredAt = DateTimeOffset.UtcNow });
    }
    internal async Task Run(CancellationToken ct)
    {
        int failures = 0;
        while (!ct.IsCancellationRequested) {
            try { await Tick(ct); failures = 0; }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { break; }
            catch (Exception error) { ErrorCode = FailurePolicy.TransferCode(error); failures++; FailurePolicy.Log(config, ErrorCode, Guid.NewGuid()); }
            await Task.Delay(FailurePolicy.Delay(failures), ct);
        }
    }
}
