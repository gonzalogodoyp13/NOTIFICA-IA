"""Independent offline current-time validation of controlled LT/LTA test outputs.

Uses pyHanko 0.37.0 with explicit test trust roots. This is not an archival
proof-of-existence assessment and does not modify the signed PDF or system trust.
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--dependencies', required=True)
parser.add_argument('--root', action='append', required=True)
parser.add_argument('--output', required=True)
parser.add_argument('pdf', nargs='+')
args = parser.parse_args()
sys.path.insert(0, args.dependencies)

from asn1crypto import x509, pem
from pyhanko.pdf_utils.reader import PdfFileReader
from pyhanko.sign.validation import validate_pdf_signature
from pyhanko.sign.validation.dss import DocumentSecurityStore
from pyhanko_certvalidator.policy_decl import (
    CertRevTrustPolicy, RevocationCheckingPolicy, RevocationCheckingRule,
)

roots = []
for name in args.root:
    data = Path(name).read_bytes()
    roots.append(x509.Certificate.load(pem.unarmor(data)[2] if pem.detect(data) else data))
rule = RevocationCheckingRule.CRL_OR_OCSP_REQUIRED
policy = CertRevTrustPolicy(RevocationCheckingPolicy(rule, rule))
results = []
all_passed = True
for name in args.pdf:
    result = {'file': str(Path(name).resolve()), 'validator': 'pyHanko 0.37.0',
              'onlineFetching': False, 'scope': 'Current-time signature, timestamp, chain and required revocation',
              'sha256': hashlib.sha256(Path(name).read_bytes()).hexdigest(), 'signatures': []}
    try:
        with open(name, 'rb') as stream:
            reader = PdfFileReader(stream)
            dss = DocumentSecurityStore.read_dss(reader)
            raw = reader.root['/DSS']
            result['embeddedEvidence'] = {key: len(raw[key]) if key in raw else 0 for key in ['/Certs', '/CRLs', '/OCSPs']}
            context = dss.as_validation_context({'trust_roots': roots, 'allow_fetching': False, 'revinfo_policy': policy})
            for signature in reader.embedded_signatures:
                if signature.sig_object.get('/Type') == '/DocTimeStamp':
                    continue
                status = validate_pdf_signature(signature, signer_validation_context=context, ts_validation_context=context)
                timestamp_status = status.timestamp_validity
                timestamps = [attr['values'][0]['content']['encap_content_info']['content'].parsed
                              for attr in signature.signer_info['unsigned_attrs']
                              if attr['type'].native == 'signature_time_stamp_token']
                if len(timestamps) != 1 or timestamp_status is None:
                    raise ValueError('Expected one signature timestamp')
                timestamp = timestamps[0]
                imprint = timestamp['message_imprint']
                item = {'intact': status.intact, 'valid': status.valid, 'trusted': status.trusted,
                        'bottomLine': status.bottom_line, 'signatureDigest': signature.md_algorithm,
                        'timestampDigest': imprint['hash_algorithm']['algorithm'].native,
                        'timestampImprintMatches': imprint['hashed_message'].native == hashlib.sha256(signature.signer_info['signature'].native).digest(),
                        'timestampValid': timestamp_status.valid, 'timestampIntact': timestamp_status.intact,
                        'timestampTrusted': timestamp_status.trusted, 'timestampPolicy': timestamp['policy'].dotted,
                        'certificateSha256': hashlib.sha256(signature.signer_cert.dump()).hexdigest(),
                        'docmdpOK': status.docmdp_ok}
                item['passed'] = all(item[key] for key in ['intact', 'valid', 'trusted', 'bottomLine',
                    'timestampImprintMatches', 'timestampValid', 'timestampIntact', 'timestampTrusted', 'docmdpOK']) and (
                    item['signatureDigest'] == 'sha256' and item['timestampDigest'] == 'sha256')
                result['signatures'].append(item)
            result['passed'] = len(result['signatures']) == 1 and all(s['passed'] for s in result['signatures']) and (
                result['embeddedEvidence']['/CRLs'] + result['embeddedEvidence']['/OCSPs'] > 0)
    except Exception as error:
        result['passed'] = False
        result['error'] = type(error).__name__
    all_passed &= result['passed']
    results.append(result)
output = {'passed': all_passed, 'results': results}
Path(args.output).write_text(json.dumps(output, indent=2) + '\n', encoding='utf-8')
print(json.dumps(output, indent=2))
sys.exit(0 if all_passed else 1)
