"""Private validation worker for a Node/Vercel backend.

Run behind an HTTPS proxy. It accepts only a server bearer token and bounded PDF
bytes, never database/storage credentials, client paths, arbitrary URLs or PINs.
It binds to loopback; TLS deployment and secret provisioning are operator tasks.
"""
import hmac
import json
import os
import re
import subprocess
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

MAX_PDF = 4 * 1024 * 1024
slots = threading.BoundedSemaphore(2)
config_path = Path(sys.argv[1]).resolve()
settings = json.loads(config_path.read_text(encoding='utf-8-sig'))
secret = os.environ.get('SIGNING_VALIDATOR_TOKEN', '')
if not re.fullmatch(r'[A-Za-z0-9_-]{43,128}', secret):
    raise SystemExit('VALIDATOR_TOKEN_REQUIRED')


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass  # Never log headers, bearer, paths or uploaded content.

    def answer(self, status, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Connection', 'close')
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        self.connection.settimeout(30)
        self.close_connection = True
        if self.path != '/validate' or not hmac.compare_digest(self.headers.get('Authorization', ''), 'Bearer ' + secret):
            return self.answer(401, {'ok': False, 'error': 'UNAUTHORIZED'})
        if not slots.acquire(blocking=False):
            return self.answer(503, {'ok': False, 'error': 'VALIDATOR_BUSY'})
        try:
            total = int(self.headers.get('Content-Length', '0'))
            length = int(self.headers.get('X-Source-Length', '0'))
            source_hash = self.headers.get('X-Source-Sha256', '')
            fingerprint = self.headers.get('X-Signer-Sha256', '')
            level = self.headers.get('X-Requested-Level', '')
            if (self.headers.get('Content-Type') != 'application/octet-stream' or self.headers.get('Transfer-Encoding')
                or not 8 <= length <= MAX_PDF or not 8 <= total - length <= MAX_PDF
                or not re.fullmatch('[a-f0-9]{64}', source_hash) or not re.fullmatch('[a-f0-9]{64}', fingerprint)
                or level not in ('PADES_B', 'PADES_LT', 'PADES_LTA')):
                return self.answer(400, {'ok': False, 'error': 'INVALID_REQUEST'})
            data = self.rfile.read(total)
            if len(data) != total:
                return self.answer(400, {'ok': False, 'error': 'INVALID_REQUEST'})
            with tempfile.TemporaryDirectory(prefix='notifica-validation-') as temporary:
                source = Path(temporary) / 'source.pdf'; signed = Path(temporary) / 'signed.pdf'
                source.write_bytes(data[:length]); signed.write_bytes(data[length:])
                request = dict(sourcePath=str(source), signedPath=str(signed), sourceChecksum=source_hash,
                               signerFingerprint=fingerprint, requestedLevel=level)
                # Separate constrained process for every untrusted PDF.
                clean_env = {k: os.environ[k] for k in ('SystemRoot', 'WINDIR') if k in os.environ}
                clean_env.update(TEMP=temporary, TMP=temporary)
                result = subprocess.run([settings.get('python', sys.executable), '-I', str(Path(__file__).with_name('validate_pdf.py')), str(config_path)],
                    input=json.dumps(request), text=True, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=90, env=clean_env)
                if len(result.stdout) > 32768:
                    return self.answer(422, {'ok': False, 'error': 'VALIDATION_FAILED'})
                value = json.loads(result.stdout)
                if result.returncode or value.get('ok') is not True:
                    return self.answer(422, {'ok': False, 'error': 'CERT_REVOKED' if value.get('error') == 'CERT_REVOKED' else 'VALIDATION_FAILED'})
                return self.answer(200, value)
        except Exception:
            return self.answer(422, {'ok': False, 'error': 'VALIDATION_FAILED'})
        finally:
            slots.release()


server = ThreadingHTTPServer(('127.0.0.1', int(sys.argv[2]) if len(sys.argv) > 2 else 8789), Handler)
print(json.dumps({'ready': True, 'port': server.server_port}), flush=True)
server.serve_forever()
