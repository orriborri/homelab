# Shared PostgreSQL

The homelab deploys the `shared-postgres` CloudNativePG cluster in `default` on a retained Synology volume. Clients use the internal `shared-postgres-rw` Service. Firefly uses its existing dedicated `firefly-postgres` instance and is not migrated.

Sump-it starts with a fresh `sump_it` database and owns only that database. The operator generates its login Secret (`shared-postgres-app`); the API verifies TLS using the CA certificate only. PostgreSQL accepts TLS connections from that login only to `sump_it`; other remote application connections are rejected. Do not reuse this login for another workload. For each future app, provision its own database and non-superuser login, revoke database `CONNECT` from `PUBLIC`, and add a specific database/role TLS rule above the reject rule.

This is one PostgreSQL instance, not HA. Retained storage is not a backup. Before migrating historical data or onboarding critical apps, configure off-volume backups and test a restore. Do not assume old data was recovered by this deployment.
