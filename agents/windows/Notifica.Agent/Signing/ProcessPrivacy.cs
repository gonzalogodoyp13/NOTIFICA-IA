using System.Runtime.InteropServices;

namespace Notifica.Agent.Signing;

internal static class ProcessPrivacy
{
    // Windows SDK WerApi.h: NOHEAP, NO_HEAP_ON_QUEUE, DISABLE_SNAPSHOT_CRASH,
    // DISABLE_SNAPSHOT_HANG. Applies to this process only, not Windows settings.
    private const uint PrivateMemoryFlags = 1 | 64 | 128 | 256;
    [DllImport("kernel32.dll")] private static extern int WerSetFlags(uint flags);
    [DllImport("kernel32.dll")] private static extern int WerGetFlags(IntPtr process, out uint flags);
    [DllImport("kernel32.dll")] private static extern uint GetErrorMode();
    [DllImport("kernel32.dll")] private static extern uint SetErrorMode(uint mode);
    internal static void Apply()
    {
        // SEM_NOGPFAULTERRORBOX suppresses system WER invocation for this
        // process. Preserve all other inherited error-mode flags.
        _ = SetErrorMode(GetErrorMode() | 2);
        if ((GetErrorMode() & 2) == 0) throw new InvalidOperationException("PRIVATE_MEMORY_POLICY_FAILED");
        if (WerGetFlags(new IntPtr(-1), out uint previous) < 0 || WerSetFlags(previous | PrivateMemoryFlags) < 0
            || WerGetFlags(new IntPtr(-1), out uint actual) < 0 || (actual & PrivateMemoryFlags) != PrivateMemoryFlags)
            throw new InvalidOperationException("PRIVATE_MEMORY_POLICY_FAILED");
    }
}
