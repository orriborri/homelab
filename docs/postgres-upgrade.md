# Postgres upgrades

Bumping the image tag across a **major** version (18 -> 19) does not work: the
new server refuses the old data directory and the pod crash-loops. Renovate is
configured not to propose Postgres majors; minor/patch bumps within a major are
safe and still automerge.

Instances (check `grep -rn "postgres:" apps infrastructure`):

| Instance | Kind | Notes |
|---|---|---|
| `shared-postgres` (`infrastructure/database/shared-postgres`) | CloudNativePG | Preferred home for new databases. |
| `firefly-postgres`, `sparkyfitness` postgres | plain Deployment + PVC | Move to CNPG when next upgraded. |
| `apps/postgres` | `pgautoupgrade` image | Upgrades itself, still back up first. |

There are **no automated backups** today. Step 1 is always a manual dump.

## Procedure (dump/restore, any instance)

1. Backup: `kubectl exec <pod> -- pg_dumpall -U <user> > <scratchpad>/pre-upgrade.sql`.
   Check the file is non-empty and contains your tables. Keep it outside git.
2. Snapshot the PVC if the storage class supports it.
3. Stop the app (scale to 0) so nothing writes during the move.
4. Create the new major beside the old one: a **new** Deployment/Cluster and a
   **new** PVC (never reuse the old claim). For CNPG, use
   `bootstrap.initdb.import` with `type: microservice` and
   `source` pointing at the old cluster, which does the dump/restore for you.
5. Restore the dump (plain Deployments): `psql -U <user> < pre-upgrade.sql`.
6. Verify row counts on key tables against the old instance.
7. Point the app at the new service, scale it up, check logs and the UI.
8. Keep the old PVC and instance for at least a week, then delete.

Rollback: scale the app down, point it back at the old service, scale up. The
old data is untouched until step 8.

## Rules

- One major at a time is not required with dump/restore, but read the release
  notes for removed extensions and changed defaults.
- Major bumps ship in their own PR, never bundled with other changes.
- Initialisation sidecars such as `wait-for-postgres` use the same image as the
  server; bump them together.
