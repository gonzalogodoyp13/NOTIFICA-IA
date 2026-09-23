"""Opt-in cryptographic regression: real fixtures plus hostile signed revisions.
Never opens the USB provider and never sends a PIN or private key anywhere.
"""
import hashlib
import io
import json
import subprocess
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

config_path, real_request_path, profiles_path, output_parent = map(Path, sys.argv[1:])
config = json.loads(config_path.read_text(encoding='utf-8-sig'))
sys.path.insert(0, config['dependencies'])
from asn1crypto import x509 as ax509, keys
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID
from pyhanko.pdf_utils import generic
from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
from pyhanko.sign import signers, fields
from pyhanko_certvalidator.registry import SimpleCertificateStore

directory = output_parent / ('validator-tests-' + uuid.uuid4().hex)
directory.mkdir(parents=True)
request = json.loads(real_request_path.read_text(encoding='utf-8-sig'))
profiles = json.loads(profiles_path.read_text(encoding='utf-8-sig'))
checks = []


def run(name, value, settings, expected):
    cfg = directory / (name + '.json')
    cfg.write_text(json.dumps(settings), encoding='utf-8')
    result = subprocess.run([sys.executable, '-I', str(Path(__file__).with_name('validate_pdf.py')), str(cfg)],
                            input=json.dumps(value), text=True, capture_output=True, timeout=95)
    passed = result.returncode == 0 and json.loads(result.stdout).get('ok') is True
    checks.append(dict(check=name, passed=passed == expected, accepted=passed))
    if passed != expected:
        raise AssertionError(name + ': ' + result.stdout + result.stderr)


try:
    run('real-token-lt', request, config, True)
    run('wrong-certificate', {**request, 'signerFingerprint': 'a' * 64}, config, False)
    run('wrong-source-checksum', {**request, 'sourceChecksum': 'b' * 64}, config, False)
    run('untrusted-root', request, {**config, 'roots': [str(Path(profiles['output']['outputPath']).parent / 'synthetic-trust.cer')]}, False)
    raw = bytearray(Path(request['signedPath']).read_bytes())
    raw[50] ^= 1
    changed = directory / 'tampered.pdf'
    changed.write_bytes(raw)
    run('tampered-output', {**request, 'signedPath': str(changed)}, config, False)
    for profile, field in [('PADES_B', 'output'), ('PADES_LT', 'longTerm'), ('PADES_LTA', 'archival')]:
        result = profiles[field]
        parent = Path(result['outputPath']).parent
        cert_path = parent / 'synthetic-trust.cer'
        value = dict(sourcePath=str(parent / 'controlled-input.pdf'), signedPath=result['outputPath'],
                     sourceChecksum=hashlib.sha256((parent / 'controlled-input.pdf').read_bytes()).hexdigest(),
                     signerFingerprint=hashlib.sha256(cert_path.read_bytes()).hexdigest(), requestedLevel=profile)
        run('valid-' + profile, value, {**config, 'roots': [str(cert_path), *config['roots']]}, True)
        if profile == 'PADES_B':
            run('no-timestamp-for-lt', {**value, 'requestedLevel': 'PADES_LT'}, {**config, 'roots': [str(cert_path)]}, False)

    # A genuine signature over altered page contents must not be accepted merely
    # because the file starts with the exact unsigned source bytes.
    now = datetime.now(timezone.utc)
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, 'Phase 7 synthetic CA')])
    ca = x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key()).serial_number(10).not_valid_before(now - timedelta(days=1)).not_valid_after(now + timedelta(days=1)).add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True).sign(key, hashes.SHA256())
    leaf_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    leaf_name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, 'Phase 7 synthetic signer')])
    leaf = x509.CertificateBuilder().subject_name(leaf_name).issuer_name(name).public_key(leaf_key.public_key()).serial_number(20).not_valid_before(now - timedelta(hours=1)).not_valid_after(now + timedelta(hours=12)).add_extension(x509.KeyUsage(True, True, False, False, False, False, False, False, False), critical=True).sign(key, hashes.SHA256())
    ca_file = directory / 'ca.der'; ca_file.write_bytes(ca.public_bytes(serialization.Encoding.DER))
    leaf_der = leaf.public_bytes(serialization.Encoding.DER)
    registry = SimpleCertificateStore(); registry.register(ax509.Certificate.load(ca_file.read_bytes()))
    signer = signers.SimpleSigner(signing_cert=ax509.Certificate.load(leaf_der),
        signing_key=keys.PrivateKeyInfo.load(leaf_key.private_bytes(serialization.Encoding.DER, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())), cert_registry=registry)
    clean_crl = x509.CertificateRevocationListBuilder().issuer_name(name).last_update(now - timedelta(minutes=1)).next_update(now + timedelta(hours=1))
    crl_file = directory / 'good.crl'; crl_file.write_bytes(clean_crl.sign(key, hashes.SHA256()).public_bytes(serialization.Encoding.DER))
    settings = {**config, 'roots': [str(ca_file)], 'crls': [str(crl_file)]}
    base = Path(request['sourcePath']).read_bytes()

    def sign(data, destination):
        writer = IncrementalPdfFileWriter(io.BytesIO(data))
        metadata = signers.PdfSignatureMetadata(field_name='Phase7', md_algorithm='sha256', subfilter=fields.SigSeedSubFilter.PADES)
        with destination.open('wb') as output:
            signers.sign_pdf(writer, metadata, signer=signer, output=output)

    basic = directory / 'basic.pdf'; sign(base, basic)
    value = {**request, 'signedPath': str(basic), 'requestedLevel': 'PADES_B', 'signerFingerprint': hashlib.sha256(leaf_der).hexdigest()}
    run('basic-with-current-revocation', value, settings, True)
    run('basic-without-revocation', value, {**settings, 'crls': []}, False)
    revoked = x509.RevokedCertificateBuilder().serial_number(20).revocation_date(now - timedelta(minutes=30)).build()
    revoked_file = directory / 'revoked.crl'
    revoked_file.write_bytes(clean_crl.add_revoked_certificate(revoked).sign(key, hashes.SHA256()).public_bytes(serialization.Encoding.DER))
    run('revoked-signer', value, {**settings, 'crls': [str(revoked_file)]}, False)
    writer = IncrementalPdfFileWriter(io.BytesIO(base))
    page = writer.root['/Pages']['/Kids'][0].get_object()
    page[generic.pdf_name('/Contents')] = writer.add_object(generic.StreamObject(stream_data=b'BT /F1 18 Tf 60 750 Td (ALTERED DOCUMENT) Tj ET'))
    writer.mark_update(page.container_ref)
    altered = io.BytesIO(); writer.write(altered)
    hostile = directory / 'altered-but-validly-signed.pdf'; sign(altered.getvalue(), hostile)
    run('valid-signature-over-altered-source', {**value, 'signedPath': str(hostile)}, settings, False)
finally:
    (directory / 'results.json').write_text(json.dumps({'checks': checks, 'passed': all(c['passed'] for c in checks)}, indent=2), encoding='utf-8')
    print(json.dumps({'directory': str(directory), 'checks': checks}))
