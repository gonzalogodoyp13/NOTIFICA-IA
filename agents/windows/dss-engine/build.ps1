param(
    [Parameter(Mandatory)][string]$Jdk,
    [Parameter(Mandatory)][string]$Libraries
)
$ErrorActionPreference = 'Stop'
$compiler = Join-Path $Jdk 'bin/javac.exe'
$jar = Join-Path $Jdk 'bin/jar.exe'
$output = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../artifacts/dss-engine'))
$classes = Join-Path $output 'classes'
New-Item -ItemType Directory -Force -Path $classes | Out-Null
& $compiler --release 21 -encoding UTF-8 -classpath (Join-Path $Libraries '*') -d $classes (Join-Path $PSScriptRoot 'src/NotificaDss.java')
if ($LASTEXITCODE -ne 0) { throw 'DSS bridge compilation failed' }
& $jar --create --file (Join-Path $output 'notifica-dss-6.5.jar') -C $classes '.'
if ($LASTEXITCODE -ne 0) { throw 'DSS bridge packaging failed' }
Get-FileHash -LiteralPath (Join-Path $output 'notifica-dss-6.5.jar') -Algorithm SHA256
