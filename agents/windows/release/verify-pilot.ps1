#Requires -Version 7.0
param([Parameter(Mandatory)][string]$Evidence)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
if ((Get-Item -LiteralPath $Evidence).Length -gt 1MB) { throw 'EVIDENCE_TOO_LARGE' }
$e=Get-Content -LiteralPath $Evidence -Raw | ConvertFrom-Json
$base=Split-Path -Parent ([IO.Path]::GetFullPath($Evidence))
function Verify-EvidenceFile($Reference) {
    if (-not $Reference.path -or $Reference.sha256 -cnotmatch '^[a-f0-9]{64}$') { throw 'EVIDENCE_REFERENCE_REQUIRED' }
    $path=if ([IO.Path]::IsPathRooted($Reference.path)) { $Reference.path } else { Join-Path $base $Reference.path }
    if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -cne $Reference.sha256) { throw 'EVIDENCE_HASH_MISMATCH' }
}
$required=@('automatic-workflow','manual-date-range','token-before-claim','token-during-processing','incorrect-pin',
    'certificate-expired','certificate-revoked','tsa-unavailable','ocsp-unknown','download-interrupted','upload-interrupted',
    'duplicate-completion','restart-active-lease','partial-batch','receiver-reconnect','receiver-disk-full',
    'local-modified','local-deleted','device-revoked','certificate-renewed')
if ($e.format -ne 1 -or $e.officeId -le 0 -or -not $e.operator.name -or $e.operator.accepted -isnot [bool] -or -not $e.operator.accepted -or
    -not $e.operator.acceptedAt -or [DateTimeOffset]::Parse($e.operator.acceptedAt) -gt [DateTimeOffset]::UtcNow -or $e.signature.profile -ne 'PADES_LT' -or $e.signature.sha256 -cnotmatch '^[a-f0-9]{64}$' -or
    $e.signature.independentlyValidated -isnot [bool] -or -not $e.signature.independentlyValidated -or
    $e.signature.hardwareToken -isnot [bool] -or -not $e.signature.hardwareToken -or
    -not $e.signature.sourceVersionId -or -not $e.signature.signedVersionId -or $e.signature.signerFingerprint -cnotmatch '^[a-f0-9]{64}$') { throw 'PILOT_ACCEPTANCE_INCOMPLETE' }
$machines=@($e.receivers | ForEach-Object { $_.computerId } | Where-Object { $_ } | Sort-Object -Unique)
if ($machines.Count -lt 2 -or @($e.receivers.deviceId | Where-Object { $_ } | Sort-Object -Unique).Count -lt 2 -or
    @($e.receivers | Where-Object { $_.sha256 -cne $e.signature.sha256 -or $_.automaticallyDelivered -isnot [bool] -or -not $_.automaticallyDelivered }).Count) { throw 'TWO_MATCHING_RECEIVERS_REQUIRED' }
Verify-EvidenceFile $e.signature.validationReport
Verify-EvidenceFile $e.signature.authoritativePdf
if ($e.signature.authoritativePdf.sha256 -cne $e.signature.sha256) { throw 'AUTHORITATIVE_PDF_MISMATCH' }
foreach ($receiver in $e.receivers) {
    Verify-EvidenceFile $receiver.manifest
    Verify-EvidenceFile $receiver.receivedPdf
    if ($receiver.receivedPdf.sha256 -cne $e.signature.sha256) { throw 'RECEIVER_PDF_MISMATCH' }
}
foreach ($scenario in $required) {
    $matches=@($e.scenarios | Where-Object { $_.id -ceq $scenario })
    if ($matches.Count -ne 1 -or $matches[0].status -cne 'passed' -or -not $matches[0].evidence) { throw "PILOT_SCENARIO_INCOMPLETE_$scenario" }
    Verify-EvidenceFile $matches[0].evidence
}
foreach ($gate in @('installer','upgrade','rollback','uninstall','securityReview','build','lint','integration','endToEnd')) {
    if ($e.gates.$gate.status -cne 'passed' -or -not $e.gates.$gate.evidence) { throw "PILOT_GATE_INCOMPLETE_$gate" }
    Verify-EvidenceFile $e.gates.$gate.evidence
}
Write-Output 'PILOT_RECORD_COMPLETE_REQUIRES_HUMAN_EVIDENCE_REVIEW'
