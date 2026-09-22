using System.Buffers.Binary;
using System.Security.Cryptography;

namespace Notifica.Agent.Signing;

// Only for an already authenticated local pipe or the owned signing child's
// redirected stdin. A PIN is never a JSON field and no textual encoding is used.
internal static class PinTransfer
{
    internal static async Task SendAsync(Stream stream, PinBuffer pin, CancellationToken cancellation)
    {
        try
        {
            byte[] length = new byte[2];
            BinaryPrimitives.WriteUInt16BigEndian(length, checked((ushort)pin.Memory.Length));
            await stream.WriteAsync(length, cancellation);
            await stream.WriteAsync(pin.Memory, cancellation);
            await stream.FlushAsync(cancellation);
        }
        finally { pin.Dispose(); }
    }

    internal static async Task<PinBuffer> ReceiveAsync(Stream stream, CancellationToken cancellation)
    {
        byte[] prefix = new byte[2];
        await stream.ReadExactlyAsync(prefix, cancellation);
        int length = BinaryPrimitives.ReadUInt16BigEndian(prefix);
        if (length is < 1 or > PinBuffer.MaximumBytes) throw new SigningFailure(SigningError.PinFormat);
        byte[] bytes = GC.AllocateUninitializedArray<byte>(length, pinned: true);
        try
        {
            await stream.ReadExactlyAsync(bytes, cancellation);
            return new PinBuffer(bytes);
        }
        finally { CryptographicOperations.ZeroMemory(bytes); }
    }
}
