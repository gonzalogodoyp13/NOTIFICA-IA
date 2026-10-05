using System.Security.Principal;
using System.Text.Json;
using System.Security.Cryptography;

namespace Notifica.Agent;

internal static class Retirement
{
    internal static async Task<int> Run(Configuration config)
    {
        if (!config.MachineKey || !new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator))
            throw new InvalidOperationException("ADMINISTRATOR_REQUIRED");
        if (ServiceHost.ProcessId() != 0) throw new InvalidOperationException("STOP_SERVICE_FIRST");
        // Never destroy recovery evidence. Setup must stop the service first.
        if (File.Exists(Path.Combine(config.DataDirectory, "signing-work.json"))) throw new InvalidOperationException("REVIEW_ACTIVE_WORK");
        string identityPath = Path.Combine(config.DataDirectory, "identity.json");
        if (!CngKey.Exists(config.KeyName, CngProvider.MicrosoftSoftwareKeyStorageProvider, CngKeyOpenOptions.MachineKey)) {
            if (!File.Exists(identityPath)) return 0;
            var previous = JsonSerializer.Deserialize<Identity>(File.ReadAllText(identityPath), Configuration.Json)
                ?? throw new InvalidOperationException("IDENTITY_REQUIRED");
            using var receipt = JsonDocument.Parse(File.ReadAllText(Path.Combine(config.DataDirectory, "retirement.json")));
            if (receipt.RootElement.GetProperty("revoked").GetBoolean() && receipt.RootElement.GetProperty("deviceId").GetString() == previous.DeviceId) return 0;
            throw new InvalidOperationException("RETIREMENT_NOT_CONFIRMED");
        }
        using var key = new DeviceKey(config);
        if (File.Exists(identityPath))
        {
            var identity = JsonSerializer.Deserialize<Identity>(File.ReadAllText(identityPath), Configuration.Json)
                ?? throw new InvalidOperationException("IDENTITY_REQUIRED");
            using var api = new DeviceApi(config, key);
            using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(25));
            var result = await api.Post("retire", new { deviceId = identity.DeviceId,
                signature = key.Sign($"NOTIFICA-DEVICE-RETIRE-V1\n{identity.DeviceId}") }, deadline.Token);
            if (!result.GetProperty("revoked").GetBoolean() || result.GetProperty("deviceId").GetString() != identity.DeviceId)
                throw new InvalidOperationException("RETIREMENT_NOT_CONFIRMED");
            // The shared-folder files are managed caches. Preserve user exports,
            // old receiver copies and signing journals while clearing this view.
            using (var folder = new OfficeFolder(config, api, () => identity)) folder.RevokeLocalAccess();
            ReceiverMirror.SaveJson(Path.Combine(config.DataDirectory, "retirement.json"), new { identity.DeviceId, revoked = true, at = DateTimeOffset.UtcNow });
        }
        // Only the software device identity is removed; never the USB key.
        key.DeleteTestKey();
        return 0;
    }
}
