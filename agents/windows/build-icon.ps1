# Reproducible vector-drawn white N; no font or external image dependency.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$assets = Join-Path $PSScriptRoot 'Notifica.Agent/Assets'
New-Item -ItemType Directory -Path $assets -Force | Out-Null
$frames = @()
foreach ($size in @(16, 20, 24, 32, 48, 64, 128, 256)) {
    $bitmap = [Drawing.Bitmap]::new($size, $size)
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    try {
        $graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
        $graphics.Clear([Drawing.Color]::FromArgb(24, 38, 57))
        $points = [Drawing.PointF[]]@(
            [Drawing.PointF]::new($size*.24,$size*.76),
            [Drawing.PointF]::new($size*.24,$size*.24),
            [Drawing.PointF]::new($size*.37,$size*.24),
            [Drawing.PointF]::new($size*.64,$size*.58),
            [Drawing.PointF]::new($size*.64,$size*.24),
            [Drawing.PointF]::new($size*.76,$size*.24),
            [Drawing.PointF]::new($size*.76,$size*.76),
            [Drawing.PointF]::new($size*.63,$size*.76),
            [Drawing.PointF]::new($size*.36,$size*.42),
            [Drawing.PointF]::new($size*.36,$size*.76)
        )
        $graphics.FillPolygon([Drawing.Brushes]::White, $points)
        $memory = [IO.MemoryStream]::new()
        try { $bitmap.Save($memory, [Drawing.Imaging.ImageFormat]::Png); $frames += ,$memory.ToArray() }
        finally { $memory.Dispose() }
    } finally { $graphics.Dispose(); $bitmap.Dispose() }
}
$stream = [IO.File]::Create((Join-Path $assets 'Notifica.ico'))
$writer = [IO.BinaryWriter]::new($stream)
try {
    $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$frames.Count)
    $offset = 6 + 16 * $frames.Count
    $sizes = @(16, 20, 24, 32, 48, 64, 128, 256)
    for ($i = 0; $i -lt $frames.Count; $i++) {
        $dimension = $sizes[$i] % 256
        $writer.Write([byte]$dimension); $writer.Write([byte]$dimension)
        $writer.Write([byte]0); $writer.Write([byte]0)
        $writer.Write([uint16]1); $writer.Write([uint16]32)
        $writer.Write([uint32]$frames[$i].Length); $writer.Write([uint32]$offset)
        $offset += $frames[$i].Length
    }
    foreach ($frame in $frames) { $writer.Write([byte[]]$frame) }
} finally { $writer.Dispose(); $stream.Dispose() }
