"""Exercise the real private worker over loopback HTTP (production adds TLS proxy)."""
import hashlib
import http.client
import json
import os
import secrets
import subprocess
import sys
from pathlib import Path

config, request_file, results_file = sys.argv[1:4]
expected_error = sys.argv[4] if len(sys.argv) > 4 else None
token = secrets.token_urlsafe(32)
process = subprocess.Popen([sys.executable, '-I', str(Path(__file__).with_name('validator_service.py')), config, '0'],
                           env={**os.environ, 'SIGNING_VALIDATOR_TOKEN': token}, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
checks = []
try:
    ready = json.loads(process.stdout.readline())
    request = json.loads(Path(request_file).read_text(encoding='utf-8-sig'))
    source = Path(request['sourcePath']).read_bytes(); signed = Path(request['signedPath']).read_bytes()
    def call(name, secret, body, status):
        connection = http.client.HTTPConnection('127.0.0.1', ready['port'], timeout=100)
        try:
            connection.request('POST', '/validate', body=body, headers={
                'Authorization': 'Bearer ' + secret, 'Content-Type': 'application/octet-stream',
                'X-Source-Length': str(len(source)), 'X-Source-Sha256': request['sourceChecksum'],
                'X-Signer-Sha256': request['signerFingerprint'], 'X-Requested-Level': request['requestedLevel']})
            result = connection.getresponse(); data = json.loads(result.read())
            passed = result.status == status
            if status == 200 and passed:
                passed &= data['evidence']['signedChecksum'] == hashlib.sha256(signed).hexdigest()
            if name == 'independent-validation-over-http' and expected_error:
                passed &= data.get('error') == expected_error
            checks.append({'check': name, 'passed': passed})
            assert passed, name
        finally:
            connection.close()
    call('server-bearer-required', '', source + signed, 401)
    call('wrong-server-bearer-rejected', 'a' * 43, source + signed, 401)
    call('independent-validation-over-http', token, source + signed, 422 if expected_error else 200)
    call('tampered-pdf-rejected-over-http', token, source + signed[:50] + b'X' + signed[51:], 422)
finally:
    process.terminate(); process.wait(timeout=10)
    Path(results_file).write_text(json.dumps({'passed': len(checks) == 4 and all(c['passed'] for c in checks), 'checks': checks}, indent=2), encoding='utf-8')
    print(json.dumps({'checks': checks}))
