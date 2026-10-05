# Completeness-verifier tests. Generated records are fictional and never acceptance.
#Requires -Version 7.0
param([string]$Output=(Join-Path $PSScriptRoot '../artifacts/phase11/pilot-verifier-tests'))
$ErrorActionPreference='Stop'
New-Item -ItemType Directory -Path $Output -Force | Out-Null
$Output=[IO.Path]::GetFullPath($Output)
$path=Join-Path $Output 'synthetic-record.json';$proof=Join-Path $Output 'fictional-evidence.txt'
'FICTIONAL VERIFIER TEST ONLY; NOT PILOT ACCEPTANCE' | Set-Content -LiteralPath $proof
$hash=(Get-FileHash $proof -Algorithm SHA256).Hash.ToLowerInvariant()
$reference=@{path=$proof;sha256=$hash}
$e=Get-Content (Join-Path $PSScriptRoot '../../../docs/signing/phase11-pilot.template.json') -Raw | ConvertFrom-Json
function Save { $e | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $path -Encoding UTF8 }
function Reject([string]$Expected) {
    Save
    $caught=$null;try { & (Join-Path $PSScriptRoot 'verify-pilot.ps1') -Evidence $path | Out-Null } catch { $caught=$_.Exception.Message }
    if ($caught -cne $Expected) { throw "Expected $Expected, got $caught" }
}
Reject 'PILOT_ACCEPTANCE_INCOMPLETE'
$e.officeId=1;$e.operator.name='FICTIONAL TEST OPERATOR';$e.operator.accepted=$true;$e.operator.acceptedAt=[DateTimeOffset]::UtcNow.AddMinutes(-1).ToString('O')
$e.signature.sha256=$hash;$e.signature.independentlyValidated=$true;$e.signature.hardwareToken=$true
$e.signature.sourceVersionId='synthetic-source';$e.signature.signedVersionId='synthetic-signed';$e.signature.signerFingerprint='a'*64
$e.signature.authoritativePdf=$reference;$e.signature.validationReport=$reference
$i=0;foreach ($receiver in $e.receivers) { $receiver.computerId='ONE-PC';$receiver.deviceId='device-'+(++$i);$receiver.sha256=$hash;$receiver.automaticallyDelivered=$true;$receiver.manifest=$reference;$receiver.receivedPdf=$reference }
Reject 'TWO_MATCHING_RECEIVERS_REQUIRED'
$e.receivers[1].computerId='TWO-PC'
Reject 'PILOT_SCENARIO_INCOMPLETE_automatic-workflow'
foreach ($scenario in $e.scenarios) { $scenario.status='passed';$scenario.evidence=$reference }
Reject 'PILOT_GATE_INCOMPLETE_installer'
foreach ($gate in $e.gates.PSObject.Properties) { $gate.Value.status='passed';$gate.Value.evidence=$reference }
Save
& (Join-Path $PSScriptRoot 'verify-pilot.ps1') -Evidence $path | Out-Null
'TAMPERED FICTIONAL EVIDENCE' | Set-Content -LiteralPath $proof
Reject 'EVIDENCE_HASH_MISMATCH'
@{passed=6;actualPilotAccepted=$false} | ConvertTo-Json | Set-Content (Join-Path $Output 'results.json') -Encoding UTF8
Write-Output '6 pilot-record verifier checks passed; no actual pilot acceptance'
