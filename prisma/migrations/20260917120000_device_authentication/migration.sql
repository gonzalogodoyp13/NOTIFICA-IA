ALTER TABLE public.signing_devices ADD COLUMN "diskFreeBytes" bigint,
  ADD COLUMN "healthErrorCode" text, ADD COLUMN "lastSuccessfulContactAt" timestamp(3);
ALTER TABLE public.signing_devices ADD CONSTRAINT device_disk_free_check CHECK ("diskFreeBytes" IS NULL OR "diskFreeBytes" >= 0);
CREATE TABLE public.device_challenges (
  id text PRIMARY KEY, "officeId" integer NOT NULL, "deviceId" text NOT NULL,
  "nonceHash" text NOT NULL, "expiresAt" timestamp(3) NOT NULL, "consumedAt" timestamp(3),
  CONSTRAINT device_challenges_device_fkey FOREIGN KEY ("deviceId", "officeId") REFERENCES public.signing_devices(id,"officeId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX device_challenges_expires_idx ON public.device_challenges("expiresAt");
CREATE INDEX device_challenges_device_idx ON public.device_challenges("deviceId","officeId");
CREATE TABLE public.device_sessions (
  id text PRIMARY KEY, "officeId" integer NOT NULL, "deviceId" text NOT NULL,
  "tokenHash" text NOT NULL UNIQUE, "expiresAt" timestamp(3) NOT NULL, "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT device_sessions_device_fkey FOREIGN KEY ("deviceId", "officeId") REFERENCES public.signing_devices(id,"officeId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX device_sessions_expires_idx ON public.device_sessions("expiresAt");
CREATE INDEX device_sessions_device_idx ON public.device_sessions("deviceId","officeId");
CREATE TABLE public.device_rate_limits (key text PRIMARY KEY, "windowAt" timestamp(3) NOT NULL, count integer NOT NULL CHECK (count > 0));
CREATE INDEX device_rate_limits_window_idx ON public.device_rate_limits("windowAt");
ALTER TABLE public.device_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.device_challenges, public.device_sessions, public.device_rate_limits FROM PUBLIC, anon, authenticated, service_role;
