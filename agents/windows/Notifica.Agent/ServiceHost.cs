using System.Runtime.InteropServices;
using System.ServiceProcess;

namespace Notifica.Agent;

internal static class ServiceHost
{
    internal const string Name = "NotificaSigningAgent";
    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern IntPtr OpenSCManager(string? machine, string? database, uint access);
    [DllImport("advapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)] private static extern IntPtr OpenService(IntPtr manager, string name, uint access);
    [DllImport("advapi32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool QueryServiceStatusEx(IntPtr service, int level, [Out] uint[] buffer, uint size, out uint needed);
    [DllImport("advapi32.dll")] [return: MarshalAs(UnmanagedType.Bool)] private static extern bool CloseServiceHandle(IntPtr handle);
    internal static uint ProcessId()
    {
        IntPtr manager = OpenSCManager(null, null, 1);
        if (manager == IntPtr.Zero) return 0;
        try
        {
            IntPtr service = OpenService(manager, Name, 4);
            if (service == IntPtr.Zero) return 0;
            try { uint[] status = new uint[9]; return QueryServiceStatusEx(service, 0, status, 36, out _) ? status[7] : 0; }
            finally { _ = CloseServiceHandle(service); }
        }
        finally { _ = CloseServiceHandle(manager); }
    }
    internal static void Run(Func<CancellationToken, Task> run, Action<Exception> reportFailure)
    {
        using var service = new AgentService(run, reportFailure);
        ServiceBase.Run(service);
    }
    private sealed class AgentService : ServiceBase
    {
        private readonly Func<CancellationToken, Task> run;
        private readonly Action<Exception> reportFailure;
        private readonly CancellationTokenSource cancellation = new();
        private Task? worker;
        internal AgentService(Func<CancellationToken, Task> run, Action<Exception> reportFailure)
        {
            this.run = run; this.reportFailure = reportFailure;
            ServiceName = Name; CanStop = true; CanShutdown = true; AutoLog = false;
        }
        protected override void OnStart(string[] args)
        {
            worker = Task.Run(async () => {
                try
                {
                    await run(cancellation.Token);
                    if (!cancellation.IsCancellationRequested) throw new InvalidOperationException("SERVICE_WORKER_EXITED");
                }
                catch (OperationCanceledException) when (cancellation.IsCancellationRequested) { }
                catch (Exception error)
                {
                    ExitCode = 1;
                    try { reportFailure(error); } catch { /* Diagnostics must not prevent SCM shutdown. */ }
                    // Stop on a separate thread: OnStop waits for this worker.
                    ThreadPool.QueueUserWorkItem(_ => Stop());
                }
            });
        }
        protected override void OnStop()
        {
            cancellation.Cancel();
            worker?.GetAwaiter().GetResult();
        }
        protected override void OnShutdown() => OnStop();
        protected override void Dispose(bool disposing)
        {
            if (disposing) cancellation.Dispose();
            base.Dispose(disposing);
        }
    }
}
