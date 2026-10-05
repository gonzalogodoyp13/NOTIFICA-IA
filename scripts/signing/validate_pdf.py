"""Server-owned, offline pyHanko 0.37 validator. Never trusts agent verdicts.

Configuration and paths are supplied by the server, never by a device. No AIA,
OCSP, CRL or PDF URL is fetched: fresh external evidence for B must be provisioned
by the operator. LT/LTA must validate using embedded evidence alone.
"""
import asyncio
import hashlib
import io
import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

logging.disable(logging.CRITICAL)

class RevokedSigner(Exception):
    pass


def limit_resources():
    # Uploaded PDFs are untrusted parser input. Limit memory as well as the
    # parent's wall-clock timeout; never create an unbounded validation worker.
    if sys.platform != 'win32':
        import resource
        resource.setrlimit(resource.RLIMIT_AS, (1024 ** 3, 1024 ** 3))
        resource.setrlimit(resource.RLIMIT_CPU, (45, 45))
        return
    import ctypes as c
    from ctypes import wintypes as w
    class Basic(c.Structure):
        _fields_ = [('process_time', c.c_longlong), ('job_time', c.c_longlong), ('flags', w.DWORD),
                    ('min_working', c.c_size_t), ('max_working', c.c_size_t), ('active', w.DWORD),
                    ('affinity', c.c_size_t), ('priority', w.DWORD), ('scheduling', w.DWORD)]
    class Extended(c.Structure):
        _fields_ = [('basic', Basic), ('io', c.c_ulonglong * 6), ('process_memory', c.c_size_t),
                    ('job_memory', c.c_size_t), ('peak_process', c.c_size_t), ('peak_job', c.c_size_t)]
    kernel = c.WinDLL('kernel32', use_last_error=True)
    kernel.CreateJobObjectW.restype = w.HANDLE
    kernel.CreateJobObjectW.argtypes = [c.c_void_p, w.LPCWSTR]
    kernel.GetCurrentProcess.restype = w.HANDLE
    kernel.SetInformationJobObject.argtypes = [w.HANDLE, c.c_int, c.c_void_p, w.DWORD]
    kernel.AssignProcessToJobObject.argtypes = [w.HANDLE, w.HANDLE]
    handle = kernel.CreateJobObjectW(None, None)
    limits = Extended(); limits.basic.flags = 0x100 | 2
    limits.process_memory = 768 * 1024 * 1024; limits.basic.process_time = 45 * 10_000_000
    if not handle or not kernel.SetInformationJobObject(handle, 9, c.byref(limits), c.sizeof(limits)) or not kernel.AssignProcessToJobObject(handle, kernel.GetCurrentProcess()):
        raise RuntimeError('RESOURCE_LIMIT_FAILED')
    # Keep the handle open for this process's lifetime; Windows reclaims it.


def check(value):
    if not value:
        raise ValueError('VALIDATION_FAILED')


def main():
    limit_resources()
    config = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8-sig'))
    if config.get('dependencies'):
        sys.path.insert(0, config['dependencies'])
    from importlib.metadata import version
    check(version('pyHanko') == '0.37.0')
    from asn1crypto import x509, crl, pem
    from pyhanko.pdf_utils.reader import PdfFileReader
    from pyhanko.pdf_utils import generic
    from pyhanko.sign.diff_analysis import DEFAULT_DIFF_POLICY, DiffResult, ModificationLevel
    from pyhanko.sign.validation import validate_pdf_signature, async_validate_pdf_timestamp
    from pyhanko.sign.validation.dss import DocumentSecurityStore
    from pyhanko.sign.validation.status import SignatureCoverageLevel
    from pyhanko_certvalidator import ValidationContext
    from pyhanko_certvalidator.policy_decl import CertRevTrustPolicy, RevocationCheckingPolicy, RevocationCheckingRule

    def cert(path):
        data = Path(path).read_bytes()
        return x509.Certificate.load(pem.unarmor(data)[2] if pem.detect(data) else data)

    request = json.loads(sys.stdin.buffer.read(16385))
    source = Path(request['sourcePath']).read_bytes()
    signed = Path(request['signedPath']).read_bytes()
    check(8 <= len(source) < len(signed) <= 32 * 1024 * 1024)
    check(signed.startswith(source))
    check(hashlib.sha256(source).hexdigest() == request['sourceChecksum'])
    level = request['requestedLevel']
    check(level in ('PADES_B', 'PADES_LT', 'PADES_LTA'))
    original = PdfFileReader(io.BytesIO(source), strict=True)
    reader = PdfFileReader(io.BytesIO(signed), strict=True)
    check(not original.encrypted and not reader.encrypted and not original.embedded_signatures)
    signatures = [s for s in reader.embedded_signatures if s.sig_object.get('/Type') != '/DocTimeStamp']
    timestamps = [s for s in reader.embedded_signatures if s.sig_object.get('/Type') == '/DocTimeStamp']
    check(len(signatures) == 1)
    signature = signatures[0]
    check(signature.sig_object.get('/SubFilter') == '/ETSI.CAdES.detached')
    check(signature.md_algorithm == 'sha256')
    fingerprint = hashlib.sha256(signature.signer_cert.dump()).hexdigest()
    check(fingerprint == request['signerFingerprint'])
    check(signature.signer_cert.public_key.algorithm == 'rsa')
    check(bool(set(signature.signer_cert.key_usage_value.native) & {'digital_signature', 'non_repudiation'}))
    # Prefix equality alone is insufficient: an attacker could append new page
    # contents and then sign. Review EVERY revision since the exact source.
    base = original.xrefs.total_revisions - 1
    check(reader.xrefs.get_startxref_for_revision(base) == original.xrefs.get_startxref_for_revision(base))
    baseline = reader.get_historical_resolver(base)
    # DSS creates a direct AcroForm for PDFs without one. pyHanko's diff rule
    # expects dictionaries on both sides. An absent form is semantically empty;
    # normalize only that absence in the in-memory historical view, never bytes.
    if '/AcroForm' not in baseline.root:
        baseline.root[generic.pdf_name('/AcroForm')] = generic.DictionaryObject({
            generic.pdf_name('/SigFlags'): generic.NumberObject(3),
            generic.pdf_name('/Fields'): generic.ArrayObject(),
        })
    diff = DEFAULT_DIFF_POLICY.review_file(reader, baseline)
    check(isinstance(diff, DiffResult) and diff.modification_level <= ModificationLevel.FORM_FILLING)
    check(diff.changed_form_fields <= {s.field_name for s in reader.embedded_signatures})

    roots = [cert(p) for p in config['roots']]
    check(bool(roots))
    rule = RevocationCheckingRule.CRL_OR_OCSP_REQUIRED
    policy = CertRevTrustPolicy(RevocationCheckingPolicy(rule, rule))
    settings = dict(trust_roots=roots, allow_fetching=False, revinfo_policy=policy)
    if level == 'PADES_B':
        settings['other_certs'] = [cert(p) for p in config.get('certificates', [])]
        settings['crls'] = [crl.CertificateList.load(Path(p).read_bytes()) for p in config.get('crls', [])]
        context = ValidationContext(**settings)
    else:
        dss = DocumentSecurityStore.read_dss(reader)
        check(bool(dss.crls or dss.ocsps))
        context = dss.as_validation_context(settings)
    status = validate_pdf_signature(signature, signer_validation_context=context, ts_validation_context=context)
    if status.revoked:
        raise RevokedSigner()
    check(status.bottom_line and status.intact and status.valid and status.trusted and status.docmdp_ok)
    check(status.coverage in (SignatureCoverageLevel.ENTIRE_FILE, SignatureCoverageLevel.ENTIRE_REVISION))
    attrs = {a['type'].native for a in signature.signer_info['signed_attrs']}
    check('signing_certificate_v2' in attrs)
    timestamp_at = None
    stamp_attrs = [a for a in signature.signer_info['unsigned_attrs'] if a['type'].native == 'signature_time_stamp_token']
    if level != 'PADES_B' or stamp_attrs:
        check(len(stamp_attrs) == 1 and len(stamp_attrs[0]['values']) == 1)
        stamp = stamp_attrs[0]['values'][0]['content']['encap_content_info']['content'].parsed
        imprint = stamp['message_imprint']
        check(imprint['hash_algorithm']['algorithm'].native == 'sha256')
        check(imprint['hashed_message'].native == hashlib.sha256(signature.signer_info['signature'].native).digest())
        ts = status.timestamp_validity
        check(ts is not None and ts.valid and ts.intact and ts.trusted)
        timestamp_at = stamp['gen_time'].native.isoformat()
    if level == 'PADES_LTA':
        check(bool(timestamps))
    for stamp in timestamps:
        archive_info = stamp.signed_data['encap_content_info']['content'].parsed
        check(archive_info['message_imprint']['hash_algorithm']['algorithm'].native == 'sha256'
              and stamp.signed_revision > signature.signed_revision)
        ts = asyncio.run(async_validate_pdf_timestamp(stamp, validation_context=context))
        check(ts.intact and ts.valid and ts.trusted)
    if level == 'PADES_LTA':
        # Require the final archive timestamp to cover the entire current file,
        # including the embedded validation store, without unsigned trailing data.
        check(timestamps[-1].evaluate_signature_coverage() == SignatureCoverageLevel.ENTIRE_FILE)
        historic = reader.get_historical_resolver(timestamps[-1].signed_revision)
        check('/DSS' in historic.root)
    now = datetime.now(timezone.utc).isoformat()
    return dict(signerFingerprint=fingerprint, certificateIssuer=signature.signer_cert.issuer.human_friendly,
                providerType='PYHANKO_0_37_SERVER', level=level, timestampAt=timestamp_at,
                revocationCheckedAt=now, validatedAt=now, sourceChecksum=hashlib.sha256(source).hexdigest(),
                signedChecksum=hashlib.sha256(signed).hexdigest(), validator='pyHanko 0.37.0',
                sourcePreserved=True, offline=True, archiveTimestampCount=len(timestamps))


try:
    print(json.dumps({'ok': True, 'evidence': main()}))
except RevokedSigner:
    print(json.dumps({'ok': False, 'error': 'CERT_REVOKED'}))
    sys.exit(1)
except Exception:
    # No raw parser errors, local paths, certificate contents or document data.
    print(json.dumps({'ok': False, 'error': 'VALIDATION_FAILED'}))
    sys.exit(1)
