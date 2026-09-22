import java.io.*;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.logging.*;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.cos.*;
import org.bouncycastle.tsp.TimeStampToken;
import org.bouncycastle.cms.CMSSignedData;
import eu.europa.esig.dss.enumerations.*;
import eu.europa.esig.dss.model.*;
import eu.europa.esig.dss.model.x509.CertificateToken;
import eu.europa.esig.dss.pades.PAdESSignatureParameters;
import eu.europa.esig.dss.pades.signature.PAdESService;
import eu.europa.esig.dss.spi.DSSUtils;
import eu.europa.esig.dss.spi.validation.*;
import eu.europa.esig.dss.spi.x509.*;
import eu.europa.esig.dss.service.crl.OnlineCRLSource;
import eu.europa.esig.dss.service.ocsp.OnlineOCSPSource;
import eu.europa.esig.dss.service.tsp.OnlineTSPSource;
import eu.europa.esig.dss.service.http.commons.CommonsDataLoader;
import eu.europa.esig.dss.validation.SignedDocumentValidator;
import eu.europa.esig.dss.validation.reports.Reports;
import eu.europa.esig.dss.alert.ExceptionOnStatusAlert;

/** Pinned DSS 6.5 bridge. Receives public data and a signature, NEVER a token PIN
 * or private key. One invocation handles one PDF; the native parent owns the
 * authorized batch's token session and hard deadline. */
public final class NotificaDss {
    private static final int MAGIC = 0x4e445331; // NDS1
    private static final int MAX_PDF = 32 * 1024 * 1024;
    private static final DataInputStream input = new DataInputStream(System.in);
    private static final DataOutputStream output = new DataOutputStream(System.out);
    private static String stage = "EngineFailure";
    private static class Failure extends Exception {
        final String code;
        Failure(String code) { this.code = code; }
    }
    private static byte[] readBytes(int maximum) throws Exception {
        int length = input.readInt();
        if (length < 0 || length > maximum) throw new Failure("InvalidBatch");
        byte[] bytes = input.readNBytes(length);
        if (bytes.length != length) throw new EOFException();
        return bytes;
    }
    private static String readString(int maximum) throws Exception {
        return new String(readBytes(maximum), StandardCharsets.UTF_8);
    }
    private static void writeBytes(byte[] value) throws IOException {
        output.writeInt(value.length); output.write(value); output.flush();
    }
    private static void writeString(String value) throws IOException { writeBytes(value.getBytes(StandardCharsets.UTF_8)); }
    private static String hash(byte[] value) throws Exception { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value)); }
    private static List<CertificateToken> readCertificates() throws Exception {
        int count = input.readInt();
        if (count < 1 || count > 20) throw new Failure("InvalidBatch");
        List<CertificateToken> result = new ArrayList<>();
        for (int i = 0; i < count; i++) result.add(DSSUtils.loadCertificate(readBytes(65536)));
        return result;
    }
    private static CommonsDataLoader loader(String contentType) {
        CommonsDataLoader loader = new CommonsDataLoader(contentType);
        loader.setTimeoutConnection(10000);
        loader.setTimeoutConnectionRequest(10000);
        loader.setTimeoutResponse(20000);
        loader.setTimeoutSocket(20000);
        loader.setRedirectsEnabled(false);
        loader.setUseSystemProperties(false);
        return loader;
    }
    private static CommonCertificateVerifier verifier(List<CertificateToken> roots, List<CertificateToken> chain, boolean online) {
        CommonTrustedCertificateSource trusted = new CommonTrustedCertificateSource();
        for (CertificateToken root : roots) trusted.addCertificate(root);
        CommonCertificateSource adjunct = new CommonCertificateSource();
        for (CertificateToken certificate : chain) adjunct.addCertificate(certificate);
        CommonCertificateVerifier verifier = new CommonCertificateVerifier();
        verifier.setTrustedCertSources(trusted);
        verifier.setAdjunctCertSources(adjunct);
        verifier.setAlertOnInvalidSignature(new ExceptionOnStatusAlert());
        verifier.setAlertOnInvalidTimestamp(new ExceptionOnStatusAlert());
        verifier.setAlertOnMissingRevocationData(new ExceptionOnStatusAlert());
        verifier.setAlertOnRevokedCertificate(new ExceptionOnStatusAlert());
        verifier.setAlertOnExpiredCertificate(new ExceptionOnStatusAlert());
        verifier.setAlertOnNotYetValidCertificate(new ExceptionOnStatusAlert());
        if (online) {
            verifier.setCrlSource(new OnlineCRLSource(loader(null)));
            verifier.setOcspSource(new OnlineOCSPSource(loader("application/ocsp-request")));
            verifier.setRevocationDataLoadingStrategyFactory(new CRLFirstRevocationDataLoadingStrategyFactory());
        }
        return verifier;
    }
    private static void validate(DSSDocument document, SignatureLevel expected, List<CertificateToken> roots,
        List<CertificateToken> chain, String fingerprint) throws Exception {
        stage = "ValidationFailed";
        SignedDocumentValidator validator = SignedDocumentValidator.fromDocument(document);
        validator.setTokenExtractionStrategy(TokenExtractionStrategy.EXTRACT_TIMESTAMPS_ONLY);
        // LT/LTA must validate using embedded revocation evidence, not a fresh
        // network fetch that could disguise a missing DSS dictionary.
        validator.setCertificateVerifier(verifier(roots, chain, expected == SignatureLevel.PAdES_BASELINE_B));
        Reports reports = validator.validateDocument();
        var simple = reports.getSimpleReport();
        if (simple.getSignaturesCount() != 1) throw new Failure("ValidationFailed");
        String id = simple.getFirstSignatureId();
        if (simple.getIndication(id) != Indication.TOTAL_PASSED || simple.getSignatureFormat(id) != expected)
            throw new Failure("ValidationFailed");
        var diagnostic = reports.getDiagnosticData();
        if (diagnostic.getFirstSignatureDigestAlgorithm() != DigestAlgorithm.SHA256
            || diagnostic.getFirstSignatureEncryptionAlgorithm() != EncryptionAlgorithm.RSA)
            throw new Failure("ValidationFailed");
        for (var timestamp : diagnostic.getTimestampList()) {
            TimeStampToken token = new TimeStampToken(new CMSSignedData(timestamp.getBinaries()));
            if (!"2.16.840.1.101.3.4.2.1".equals(token.getTimeStampInfo().getMessageImprintAlgOID().getId()))
                throw new Failure("ValidationFailed");
        }
        byte[] pdf;
        try (InputStream content = document.openStream()) { pdf = content.readNBytes(MAX_PDF + 1); }
        if (pdf.length > MAX_PDF) throw new Failure("ValidationFailed");
        try (PDDocument parsed = Loader.loadPDF(pdf)) {
            var signatures = parsed.getSignatureDictionaries();
            var signature = signatures.stream().filter(s -> !"ETSI.RFC3161".equals(s.getSubFilter())).findFirst().orElseThrow();
            CMSSignedData cms = new CMSSignedData(signature.getContents(pdf));
            var signer = cms.getSignerInfos().getSigners().iterator().next();
            @SuppressWarnings("unchecked")
            Collection<org.bouncycastle.cert.X509CertificateHolder> matches = cms.getCertificates().getMatches(signer.getSID());
            if (matches.size() != 1 || !hash(matches.iterator().next().getEncoded()).equals(fingerprint))
                throw new Failure("ValidationFailed");
            if (expected != SignatureLevel.PAdES_BASELINE_B) {
                COSBase raw = parsed.getDocumentCatalog().getCOSObject().getDictionaryObject(COSName.getPDFName("DSS"));
                if (!(raw instanceof COSDictionary dss)) throw new Failure("ValidationFailed");
                COSArray crls = dss.getCOSArray(COSName.getPDFName("CRLs"));
                COSArray ocsps = dss.getCOSArray(COSName.getPDFName("OCSPs"));
                if ((crls == null || crls.size() == 0) && (ocsps == null || ocsps.size() == 0)) throw new Failure("ValidationFailed");
                if (diagnostic.getTimestampList().isEmpty()) throw new Failure("ValidationFailed");
            }
        }
    }
    private static void run() throws Exception {
        if (input.readInt() != MAGIC) throw new Failure("InvalidBatch");
        String profile = readString(20);
        SignatureLevel level = switch (profile) {
            case "PADES_B" -> SignatureLevel.PAdES_BASELINE_B;
            case "PADES_LT" -> SignatureLevel.PAdES_BASELINE_LT;
            case "PADES_LTA" -> SignatureLevel.PAdES_BASELINE_LTA;
            default -> throw new Failure("InvalidBatch");
        };
        Path source = Path.of(readString(32768));
        Path destination = Path.of(readString(32768));
        String sourceHash = readString(64), fingerprint = readString(64);
        CertificateToken certificate = DSSUtils.loadCertificate(readBytes(65536));
        List<CertificateToken> chain = readCertificates(), roots = readCertificates();
        String tsaUrl = readString(2048), tsaPolicy = readString(128);
        if (!source.isAbsolute() || !destination.isAbsolute() || source.equals(destination)
            || !sourceHash.matches("[a-f0-9]{64}") || !fingerprint.equals(hash(certificate.getEncoded())))
            throw new Failure("InvalidBatch");
        if (Files.exists(destination)) throw new Failure("OutputCollision");
        if (Files.size(source) > MAX_PDF) throw new Failure("InvalidBatch");
        byte[] sourceBytes;
        try (InputStream stream = Files.newInputStream(source)) { sourceBytes = stream.readNBytes(MAX_PDF + 1); }
        if (sourceBytes.length > MAX_PDF || !hash(sourceBytes).equals(sourceHash)) throw new Failure("InputChanged");
        try (PDDocument pdf = Loader.loadPDF(sourceBytes)) {
            if (pdf.isEncrypted() || !pdf.getSignatureDictionaries().isEmpty()) throw new Failure("InvalidBatch");
        }
        PAdESSignatureParameters parameters = new PAdESSignatureParameters();
        parameters.setSignatureLevel(level);
        parameters.setDigestAlgorithm(DigestAlgorithm.SHA256);
        parameters.setEncryptionAlgorithm(EncryptionAlgorithm.RSA);
        parameters.setSigningCertificate(certificate);
        parameters.setCertificateChain(chain);
        parameters.setContentSize(32768);
        parameters.getSignatureTimestampParameters().setDigestAlgorithm(DigestAlgorithm.SHA256);
        parameters.getArchiveTimestampParameters().setDigestAlgorithm(DigestAlgorithm.SHA256);
        PAdESService service = new PAdESService(verifier(roots, chain, true));
        if (level != SignatureLevel.PAdES_BASELINE_B) {
            URI uri = URI.create(tsaUrl);
            if (!"https".equals(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null || uri.getFragment() != null)
                throw new Failure("TimestampUnavailable");
            OnlineTSPSource tsa = new OnlineTSPSource(tsaUrl, loader("application/timestamp-query"));
            if (!tsaPolicy.isEmpty()) tsa.setPolicyOid(tsaPolicy);
            service.setTspSource(tsa);
        }
        DSSDocument document = new InMemoryDocument(sourceBytes, "controlled.pdf", MimeTypeEnum.PDF);
        stage = "RevocationUnavailable";
        ToBeSigned toSign = service.getDataToSign(document, parameters);
        writeString("TO_SIGN"); writeBytes(toSign.getBytes());
        SignatureValue signature = new SignatureValue(SignatureAlgorithm.RSA_SHA256, readBytes(16384));
        if (!service.isValidSignatureValue(toSign, signature, certificate)) throw new Failure("SignatureInvalid");
        stage = level == SignatureLevel.PAdES_BASELINE_B ? "EngineFailure" : "TimestampUnavailable";
        DSSDocument signed = service.signDocument(document, parameters, signature);
        validate(signed, level, roots, chain, fingerprint);
        // Only a validated output can be materialized. CREATE_NEW never replaces
        // an existing file. Parent promotes its private .part path separately.
        stage = "EngineFailure";
        try (InputStream content = signed.openStream(); OutputStream file = Files.newOutputStream(destination, StandardOpenOption.CREATE_NEW)) {
            content.transferTo(file);
        }
        writeString("OK"); writeString(hash(Files.readAllBytes(destination))); writeString(profile);
    }
    public static void main(String[] args) {
        LogManager.getLogManager().reset();
        Logger.getLogger("").setLevel(java.util.logging.Level.OFF);
        // Library output is never forwarded to the agent log. The binary channel
        // uses its captured stdout handle; all accidental console text is discarded.
        System.setOut(new PrintStream(OutputStream.nullOutputStream()));
        System.setErr(new PrintStream(OutputStream.nullOutputStream()));
        try { run(); }
        catch (Throwable error) {
            try { writeString("ERROR"); writeString(error instanceof Failure failure ? failure.code : stage); }
            catch (IOException ignored) { }
            System.exit(1);
        }
    }
}
