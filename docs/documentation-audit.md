# Documentation audit

Repository-only audit, 2026-10-31. No live cluster, DNS, router, Amazon Q client, database contents, encrypted values, was inspected. Official Kubernetes environment-variable documentation and the MCP stdio specification were checked for the template and setup corrections. Findings describe committed desired configuration, not deployed state.

## Confirmed discrepancies corrected

- [PostgreSQL usage](postgresql-usage.md) called the shared instance PostgreSQL 17 on `syno-storage` with a LoadBalancer. The [active resources](../apps/postgres/postgres.yaml) instead select `pgautoupgrade:18.1-alpine3.22`, `homelab-nfs`, PVC `postgres17-data`, and ClusterIP. Its [Kustomization](../apps/postgres/kustomization.yaml) selects these resources. Updated version, storage, access, and workstation connection instructions.
- PostgreSQL guides presented Pinepods as an existing application and recommended sharing superuser credentials universally. No Pinepods directory or registration exists in [application registrations](../clusters/homelab/apps/kustomization.yaml). [Sparkyfitness](../apps/sparkyfitness/postgres-deployment.yaml) uses its own PostgreSQL deployment and secret in a separate namespace. Marked Pinepods illustrative and explained namespace scope and dedicated roles.
- The [usage guide](postgresql-usage.md) restore redirected a pod-local path in the local shell after copying the dump into the pod. Changed to stream the local dump with `kubectl exec -i`. Removed unsupported assurance that most applications create databases automatically.
- The [PostgreSQL template](postgresql-templates.md) declared `DATABASE_URL` before the environment variables it references. Moved it after dependencies and documented URL encoding requirements.
- [Amazon Q generation context](aws-q-homelab-context.md) used ingress class `nginx`, whereas the committed controllers define [`public`](../infrastructure/networking/ingress-nginx-public/release.yaml) and [`private`](../infrastructure/networking/ingress-nginx-private/release.yaml). Corrected the template and port range.
- [Amazon Q setup](aws-q-mcp-setup.md) claimed the [script](../scripts/setup-aws-q-mcp.sh) provided an automatic MCP context server, but it registers `cat`, which only prints a file rather than implementing an MCP server. Replaced the procedure with an explicit historical-status explanation; the script itself was not changed or run.
- [SOPS guide](sops.md) omitted recipient selection. [`.sops.yaml`](../.sops.yaml) contains encryption field rules without recipients; [Flux](../clusters/homelab/apps/postgres.yaml) expects `sops-gpg`. Added explicit recipient and key-provisioning prerequisites and separated replacement-secret instructions from normal encrypted editing.

## Remaining operational questions

- `homelab-nfs` is referenced by PostgreSQL and described in an [unregistered release file](../infrastructure/storage/nfs-subdir-external-provisioner/release.yaml). The [active Kustomization](../infrastructure/storage/nfs-subdir-external-provisioner/kustomization.yaml) selects [another release file](../infrastructure/storage/nfs-subdir-external-provisioner/nfs-subdir-external-provisioner.yaml) declaring `nfs-client`. Confirm whether `homelab-nfs` exists live before changing storage; this audit does not propose a PVC migration.
- [DNS guide](dns.md) home-IP records and router forwarding are external state. Added qualification and links to the Cloudflare [external-dns deployment](../infrastructure/networking/external-dns/deployment.yaml); actual records and forwarding remain unverified.
- PostgreSQL database names, existing users, backups, and actual server version require runtime inspection. Image tags establish intended configuration only.
- Talos-on-Proxmox topology in the Amazon Q context, current Amazon Q CLI options/configuration paths, and client context-loading behavior remain unverified. The replacement setup guide makes no claim that these have been tested.
- SOPS key availability and decryption success remain unverified. No secrets were decrypted or modified.

## Overview and configuration corrections

- [README](../README.md) now links the current inventory and qualifies the historical bootstrap instructions. Corrected the malformed attribution, invalid example control-plane IP, fork target, and explicit SOPS recipient selection.
- [Components](components.md) now distinguishes registered workloads from retained files, with links to both registration lists. Removed unverified recovery-time claims and qualified the historical hardware inventory.
- [Configuration](configuration.md) now names Cloudflare, points to the active NFS manifest, explains disabled Synology CSI and Discord registration, and separates local workload resources from child Flux registration. Removed an unverified hard-coded webhook certificate patch.
- The Amazon Q template now uses the registered NFS class and no longer depends on the disabled Synology CSI controller by default.

## Validation

- `kubectl kustomize clusters/homelab`: passed.
- All 26 registered child paths containing local Kustomizations: rendered successfully.
- Plain manifest paths were excluded from local Kustomize rendering.
- Local Markdown file links across README and docs: all resolve.
- `git diff --check`: passed.
- `pre-commit run --all-files`: failed because the secret hook reports existing unencrypted Kubernetes Secrets in `apps/sparkyfitness/secrets.yaml` and `apps/kia-poller/secrets.yaml`. These unchanged files were not decrypted, printed, or modified.
- No Kubernetes manifests, encrypted secrets, or live infrastructure were changed.

## Live follow-up: 2026-11-08

The earlier findings above record the repository-only audit on 2026-10-31.
This session subsequently inspected and changed the live cluster for iSCSI:

- Confirmed `iscsi-tools v0.2.0` on both workers, upgraded the control plane to
  the matching Talos `v1.13.12` Image Factory installer, and verified all three
  nodes `Ready` and `ext-iscsid` running.
- Decrypted existing Synology credentials with the live Flux SOPS key in a
  private temporary directory. No credential values or keys were printed;
  temporary key material was removed and encrypted source files were unchanged.
- Deployed Synology CSI directly, corrected the node socket endpoint, allowed
  scheduling on the control plane, and made `syno-storage` non-default. Its
  GitOps registration and installer references remain uncommitted.
- Provisioned a dedicated 1 GiB iSCSI volume on `192.168.1.244`; write/read on
  worker 1 and data persistence after reattachment to worker 2 passed. Removed
  the test pod, PVC, PV, and test class. No application volumes were migrated.
- Verified all CSI pods running, all nodes `Ready`, and all listed existing Flux
  Kustomizations ready. Synology CSI was not yet a live Flux Kustomization.
- Confirmed live `homelab-nfs` and `nfs-client` storage classes and four bound
  Audiobookshelf NFS volumes. This resolves class-existence uncertainty only;
  PostgreSQL runtime state and other historical questions remain unverified.
- Local rendering of Synology CSI and the cluster entrypoint and
  `git diff --check` passed. Secret hooks were not rerun for these changes.

See [configuration](configuration.md#synology-csi) and the
[setup record](talos-proxmox-setup.md#follow-up-iscsi-tools-installed).

## MQTT migration: 2026-11-10

The [MQTT guide](mqtt.md) records the completed broker move to Kubernetes,
credential and retained-message migration, Pi client and Home Assistant changes,
and rollback locations. The root entrypoint now registers Mosquitto; these
repository changes remain uncommitted. External Pi/Home Assistant observability
collection is still pending.

## Publication follow-up

Storage, observability, and MQTT registrations are included in the root cluster
entrypoint. Earlier notes about uncommitted changes describe the migration
checkpoints; publication and Flux reconciliation supersede that state.
