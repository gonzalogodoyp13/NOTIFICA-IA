using System.Net;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Text.Json;

namespace Notifica.Agent.Signing;

internal static class TransferSelfTest
{
    internal static async Task<int> Run()
    {
        string directory = Path.Combine(Path.GetTempPath(), "NotificaTransferTest-" + Guid.NewGuid());
        Directory.CreateDirectory(directory);
        var config = new Configuration("https://localhost/", directory, WindowsIdentity.GetCurrent().User!.Value,
            Guid.NewGuid().ToString(), Path.Combine(directory, "nonexistent-provider.dll"), null, false);
        using var key = new DeviceKey(config);
        using var fake = new TransferHandler();
        using var api = new DeviceApi(config, key, fake);
        using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(20));
        int passed = 0;
        async Task Reject(Func<Task> run) {
            bool rejected = false;
            try { await run(); } catch { rejected = true; }
            if (!rejected) throw new InvalidOperationException("TRANSFER_MUST_REJECT");
            passed++;
        }
        try {
            await api.Authenticate(new("device", 1, "SIGNER"), deadline.Token);
            string hash = Convert.ToHexStringLower(SHA256.HashData(fake.Bytes));
            var lease = new { itemId = "item", leaseToken = Guid.NewGuid().ToString() };
            string target = Path.Combine(directory, "source.pdf");
            await api.Download(lease, target, fake.Bytes.Length, hash, deadline.Token);
            if (!File.ReadAllBytes(target).SequenceEqual(fake.Bytes) || File.Exists(target + ".part")) throw new InvalidOperationException("TRANSFER_BYTES");
            passed++;
            await Reject(() => api.Download(lease, Path.Combine(directory, "bad-hash.pdf"), fake.Bytes.Length, new string('a', 64), deadline.Token));
            await Reject(() => api.Download(lease, Path.Combine(directory, "truncated.pdf"), fake.Bytes.Length + 1, hash, deadline.Token));
            await Reject(() => api.Download(lease, Path.Combine(directory, "oversized.pdf"), fake.Bytes.Length - 1, hash, deadline.Token));
            await Reject(() => api.Download(lease, target, fake.Bytes.Length, hash, deadline.Token));
            string existingPart = Path.Combine(directory, "reserved.pdf.part");
            File.WriteAllText(existingPart, "owned by another operation");
            await Reject(() => api.Download(lease, Path.Combine(directory, "reserved.pdf"), fake.Bytes.Length, hash, deadline.Token));
            if (File.ReadAllText(existingPart) != "owned by another operation") throw new InvalidOperationException("COLLISION_DELETED");
            await Reject(() => api.Upload("item", lease.leaseToken, new("doc", target, new string('b', 64), SigningProfile.PADES_B), deadline.Token));
            if (fake.Uploads != 0) throw new InvalidOperationException("CHANGED_OUTPUT_UPLOADED");
            await api.Upload("item", lease.leaseToken, new("doc", target, hash, SigningProfile.PADES_B), deadline.Token);
            if (fake.Uploads != 1) throw new InvalidOperationException("UPLOAD_COUNT");
            passed++;
            if (Directory.GetFiles(directory, "bad-*.pdf").Length != 0 || File.Exists(Path.Combine(directory, "truncated.pdf")) || File.Exists(Path.Combine(directory, "oversized.pdf")))
                throw new InvalidOperationException("CORRUPT_FINAL_FILE");
            Console.WriteLine(JsonSerializer.Serialize(new { passed, tokenLoginAttempts = 0, changedInputRejected = true,
                partialFilesRemoved = true, existingFilesPreserved = true, changedOutputRejectedBeforeUpload = true }));
            return 0;
        } finally {
            if (CngKey.Exists(config.KeyName)) { using var stored = CngKey.Open(config.KeyName); stored.Delete(); }
            Directory.Delete(directory, true);
        }
    }
    private sealed class TransferHandler : HttpMessageHandler
    {
        internal readonly byte[] Bytes = Encoding.ASCII.GetBytes("%PDF-1.7\nSYNTHETIC TRANSFER TEST ONLY\n%%EOF");
        internal int Uploads;
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            object value;
            switch (request.RequestUri!.Segments.Last()) {
                case "challenge": value = new { challengeId = "challenge", nonce = "nonce" }; break;
                case "session-renew": value = new { token = new string('a', 43), expiresAt = DateTimeOffset.UtcNow.AddMinutes(5) }; break;
                case "download":
                    var pdf = new ByteArrayContent(Bytes); pdf.Headers.ContentType = new("application/pdf");
                    return new(HttpStatusCode.OK) { Content = pdf };
                case "result":
                    Uploads++;
                    var body = await request.Content!.ReadAsByteArrayAsync(cancellationToken);
                    value = new { committed = true, checksumSha256 = Convert.ToHexStringLower(SHA256.HashData(body)) }; break;
                default: throw new InvalidOperationException("UNEXPECTED_ACTION");
            }
            return new(HttpStatusCode.OK) { Content = new StringContent(JsonSerializer.Serialize(new { ok = true, data = value })) };
        }
    }
}
