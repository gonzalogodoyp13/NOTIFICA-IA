using System.Drawing;

namespace Notifica.Agent;

internal static class Brand
{
    internal static readonly Color Navy = Color.FromArgb(24, 38, 57);
    internal static readonly Color Ink = Color.FromArgb(30, 44, 61);
    internal static readonly Color Muted = Color.FromArgb(83, 98, 115);
    internal static readonly Icon Icon = LoadIcon();
    internal static Bitmap CreateLogo()
    {
        using var stream = typeof(Brand).Assembly.GetManifestResourceStream("Notifica.Agent.Assets.Notifica.ico")!;
        using var logo = new Icon(stream, 48, 48);
        return logo.ToBitmap();
    }
    private static Icon LoadIcon()
    {
        using var stream = typeof(Brand).Assembly.GetManifestResourceStream("Notifica.Agent.Assets.Notifica.ico")
            ?? throw new InvalidOperationException("BRAND_ICON_MISSING");
        using var source = new Icon(stream, 32, 32);
        return (Icon)source.Clone();
    }
}
