using System.Security.Cryptography;
using System.Runtime.InteropServices;

namespace Notifica.Agent.Signing;

// Never turn a PIN into a managed string, JSON value, exception or log field.
// The UI, pipe and worker each own a bounded buffer and clear it when transferred.
internal sealed class PinBuffer : IDisposable
{
    internal const int MaximumBytes = 256;
    private readonly byte[] bytes = GC.AllocateUninitializedArray<byte>(MaximumBytes, pinned: true);
    private int length;
    private bool disposed;
    internal PinBuffer(ReadOnlySpan<byte> value)
    {
        CryptographicOperations.ZeroMemory(bytes);
        if (value.Length is < 1 or > MaximumBytes || value.Contains((byte)0))
            throw new SigningFailure(SigningError.PinFormat);
        value.CopyTo(bytes);
        length = value.Length;
    }
    internal ReadOnlySpan<byte> Span
    {
        get { ObjectDisposedException.ThrowIf(disposed, this); return bytes.AsSpan(0, length); }
    }
    internal bool IsCleared => disposed && bytes.All(b => b == 0);
    internal ReadOnlyMemory<byte> Memory
    {
        get { ObjectDisposedException.ThrowIf(disposed, this); return bytes.AsMemory(0, length); }
    }
    internal uint UseNative(Func<IntPtr, uint, uint> operation)
    {
        ObjectDisposedException.ThrowIf(disposed, this);
        var handle = GCHandle.Alloc(bytes, GCHandleType.Pinned);
        try { return operation(handle.AddrOfPinnedObject(), checked((uint)length)); }
        finally { handle.Free(); }
    }
    public void Dispose()
    {
        CryptographicOperations.ZeroMemory(bytes);
        length = 0;
        disposed = true;
    }
    public override string ToString() => "[PIN REDACTED]";
}
