# Firefly III

Firefly III is registered in the root Flux entrypoint and in the application
index. It runs independently of Actual Budget; no bank transactions are imported
automatically.

## Components

- Firefly III 6.7.9 at `https://firefly.orriborri.com`.
- Data Importer 2.3.5 at `https://firefly-import.orriborri.com`.
- Dedicated PostgreSQL 18.7, available only through the `firefly-postgres`
  ClusterIP service in `default`. This avoids depending on the shared PostgreSQL
  Kustomization, which is absent from the root Flux entrypoint.
- Two Synology iSCSI volumes: 10 GiB for PostgreSQL and 5 GiB for uploads.
- Daily cron at 03:00 Europe/Helsinki for scheduled transactions and budgets.
- Application key, database password and cron token in SOPS-encrypted
  `apps/firefly/secrets.yaml`. Preserve these keys when restoring data.

## Access and initial setup

Both web applications use ingress class `private`, whose configured address is
`192.168.11.99`. Reach them from the home network or an existing VPN that can
route there. ExternalDNS observes the ingress and can publish the hostnames;
verify both resolve to the private ingress address. If DNS has not reconciled,
temporarily map both names to that address in the client's hosts file. TLS uses
the existing `orriborri-com-tls` Secret in `default`.

Open Firefly and register your account; the first account is the administrator.
Choose EUR as your currency. Outbound email is disabled until SMTP is configured.
This deployment does not create a login password or copy data from Actual.

To connect the importer, create an OAuth client under Firefly's **Profile / OAuth**
page. Use `https://firefly-import.orriborri.com/callback` as the redirect URL,
and enable the public-client option. Enter its client ID in the importer and
authorize it. The importer's internal Firefly URL is `http://firefly`; its vanity
URL is the external HTTPS URL above. Export and retain your import configuration
after setup; importer sessions and temporary files are not persistent.

For the OP CSV exports in Downloads, select UTF-8, semicolon delimiter, decimal
comma and dates `Y-m-d`. Map the archive identifier (`Arkistointitunnus`) to
External ID, recipient/payer to opposing account name, recipient IBAN/BIC to
opposing account IBAN/BIC, reference to internal reference, and message to notes.
Review a preview before importing overlapping statement periods.

## Validation and recovery

```bash
kubectl kustomize apps/firefly >/dev/null
kubectl kustomize clusters/homelab >/dev/null
flux get kustomization firefly -n flux-system
kubectl -n default get deployment,pod,pvc,ingress -l app=firefly
kubectl -n default get deployments firefly firefly-postgres firefly-importer
kubectl -n default get pvc firefly-postgres-data firefly-uploads
kubectl -n default logs deployment/firefly --tail=80
```

Back up PostgreSQL using `pg_dump` and back up the uploads volume. Keep the
encrypted secrets and their decryption key. PVCs opt out of Flux pruning, and
the `syno-storage` class retains PVs; removing the app does not delete its data.
The database password is used during PostgreSQL initialization: rotating it in
the Secret alone will not change the existing database role's password.

Pinned upstream references:
[Firefly environment](https://github.com/firefly-iii/firefly-iii/blob/v6.7.9/.env.example),
[importer environment](https://github.com/firefly-iii/data-importer/blob/v2.3.5/.env.example),
[Docker deployment](https://github.com/firefly-iii/docker/blob/main/docker-compose-importer.yml).
