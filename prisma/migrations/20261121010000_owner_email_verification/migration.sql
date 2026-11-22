-- Additive. Existing owners retain TOTP; email verification requires explicit provisioning.
ALTER TABLE platform_grants ADD COLUMN "verificationMethod" TEXT NOT NULL DEFAULT 'TOTP';
ALTER TABLE platform_grants ADD COLUMN "verificationEmail" TEXT;
ALTER TABLE platform_grants ADD CONSTRAINT platform_verification_method
  CHECK ("verificationMethod" IN ('TOTP', 'EMAIL') AND ("verificationMethod" <> 'EMAIL' OR "verificationEmail" IS NOT NULL));
CREATE TABLE owner_email_sessions (
  id TEXT PRIMARY KEY, "userId" TEXT NOT NULL,
  "codeHash" TEXT, "codeExpiresAt" TIMESTAMP(3), attempts INTEGER NOT NULL DEFAULT 0,
  "sentAt" TIMESTAMP(3), "verifiedAt" TIMESTAMP(3), "verifiedUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "owner_email_sessions_userId_createdAt_idx" ON owner_email_sessions("userId", "createdAt");
CREATE INDEX "owner_email_sessions_updatedAt_idx" ON owner_email_sessions("updatedAt");
ALTER TABLE owner_email_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON owner_email_sessions FROM anon, authenticated;
