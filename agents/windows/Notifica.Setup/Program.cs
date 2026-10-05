using System.Diagnostics;
using System.Reflection;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text.RegularExpressions;

internal static class Program
{
    private static int Main(string[] args)
    {
        try {
            var assembly = Assembly.GetExecutingAssembly();
            string publisher = assembly.GetCustomAttributes<AssemblyMetadataAttribute>().Single(a => a.Key == "PublisherSha256").Value ?? "";
            if (!Regex.IsMatch(publisher, "^[a-f0-9]{64}$")) throw new InvalidOperationException("PUBLISHER_NOT_PROVISIONED");
            if (args.Length != 2 || args[0] != "--request") throw new InvalidOperationException("USAGE_SETUP_REQUEST_JSON");
            if (!new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator)) throw new InvalidOperationException("ADMINISTRATOR_REQUIRED");
            var input = new FileInfo(Path.GetFullPath(args[1]));
            if (input.Length > 65536) throw new InvalidOperationException("REQUEST_TOO_LARGE");
            byte[] request = File.ReadAllBytes(input.FullName);
            string root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "NotificaIA", "Setup");
            for (var ancestor = new DirectoryInfo(root); ancestor != null; ancestor = ancestor.Parent)
                if (ancestor.Exists && ancestor.Attributes.HasFlag(FileAttributes.ReparsePoint)) throw new InvalidOperationException("REPARSE_POINT_REJECTED");
            var acl = new DirectorySecurity();
            acl.SetAccessRuleProtection(true, false);
            foreach (string sid in new[] { "S-1-5-18", "S-1-5-32-544" })
                acl.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(sid), FileSystemRights.FullControl,
                    InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit, PropagationFlags.None, AccessControlType.Allow));
            var directory = new DirectoryInfo(root);
            directory.Create(acl); directory.SetAccessControl(acl);
            string staging = Path.Combine(root, Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(staging);
            foreach (string resource in new[] { "SetupOperation.ps1", "ReleaseTools.psm1" }) {
                using var content = assembly.GetManifestResourceStream(resource) ?? throw new InvalidOperationException("SETUP_RESOURCE_MISSING");
                using var target = new FileStream(Path.Combine(staging, resource), FileMode.CreateNew, FileAccess.Write, FileShare.None);
                content.CopyTo(target); target.Flush(true);
            }
            string requestPath = Path.Combine(staging, "request.json");
            File.WriteAllBytes(requestPath, request);
            var start = new ProcessStartInfo(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "System32", "WindowsPowerShell", "v1.0", "powershell.exe"))
                { UseShellExecute = false, CreateNoWindow = true, WorkingDirectory = Environment.GetFolderPath(Environment.SpecialFolder.System) };
            start.EnvironmentVariables["PSModulePath"] = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "WindowsPowerShell", "v1.0", "Modules");
            start.Arguments = string.Join(" ", new[] { "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", Path.Combine(staging, "SetupOperation.ps1"),
                "-RequestFile", requestPath, "-PublisherSha256", publisher, "-Bootstrapper", Process.GetCurrentProcess().MainModule!.FileName! }.Select(Quote));
            // Bypass applies only to our embedded script. That script verifies this
            // signed executable and a pinned, trusted, timestamped release manifest.
            using var process = Process.Start(start) ?? throw new InvalidOperationException("SETUP_START_FAILED");
            process.WaitForExit();
            return process.ExitCode;
        } catch (Exception error) {
            Console.Error.WriteLine(Regex.IsMatch(error.Message, "^[A-Z][A-Z_]{3,90}$") ? error.Message : "SETUP_FAILED");
            return 1;
        }
    }
    private static string Quote(string value)
    {
        var result = new System.Text.StringBuilder("\"");
        int slashes = 0;
        foreach (char c in value) {
            if (c == '\\') { slashes++; continue; }
            result.Append('\\', c == '"' ? slashes * 2 + 1 : slashes);
            result.Append(c); slashes = 0;
        }
        result.Append('\\', slashes * 2); result.Append('"'); return result.ToString();
    }
}
