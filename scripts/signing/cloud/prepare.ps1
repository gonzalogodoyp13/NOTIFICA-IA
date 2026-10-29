[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$TrustConfiguration,
    [Parameter(Mandatory)][string]$Output
)
$ErrorActionPreference = 'Stop'
if (Test-Path -LiteralPath $Output) { throw 'CHOOSE_NEW_OUTPUT_DIRECTORY' }
$trust = Get-Content -LiteralPath $TrustConfiguration -Raw | ConvertFrom-Json
if (@($trust.roots).Count -ne 2) { throw 'EXPECTED_ECERT_AND_TSA_ROOTS' }
New-Item -ItemType Directory -Path (Join-Path $Output 'api'), (Join-Path $Output 'trust') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'api/validate.py') -Destination (Join-Path $Output 'api/validate.py')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'vercel.json') -Destination $Output
foreach ($name in @('validator_service.py', 'validate_pdf.py', 'requirements.txt')) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot "../$name") -Destination $Output
}
Copy-Item -LiteralPath $trust.roots[0] -Destination (Join-Path $Output 'trust/ecert-root.pem')
Copy-Item -LiteralPath $trust.roots[1] -Destination (Join-Path $Output 'trust/freetsa-root.pem')
[IO.File]::WriteAllText((Join-Path ([IO.Path]::GetFullPath($Output)) '.python-version'), "3.12`n")
Write-Output 'VALIDATOR_PACKAGE_PREPARED_NO_SECRETS'
