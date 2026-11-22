-- Infrastructure only: no jobs run until explicitly provisioned and activated.
-- Vault encrypts scheduler credentials at rest. pg_net briefly holds request
-- headers in its internal queue; database login access must remain restricted.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
