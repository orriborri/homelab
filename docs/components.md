# Homelab components

Reviewed against repository manifests on 2026-10-31. “Enabled” means registered
in the cluster Kustomizations; it does not establish live readiness.

## Reconciliation

[Flux tracks `main`](../clusters/homelab/flux-system/gotk-sync.yaml) in
`orriborri/homelab` and reconciles `clusters/homelab`. The GitRepository polls
every minute; the root Kustomization has a ten-minute interval. A configured
[GitHub receiver](../infrastructure/flux/notification-receiver/kustomization.yaml)
can request earlier reconciliation if the external webhook is installed.

The [cluster entrypoint](../clusters/homelab/kustomization.yaml) includes shared
configuration, encrypted secrets, infrastructure, and applications. Child Flux
Kustomizations select workload paths, SOPS decryption, substitutions, and dependencies.
Files elsewhere in the repository are not necessarily reconciled.

## Enabled infrastructure

The source of truth is the [infrastructure registration list](../clusters/homelab/infrastructure/kustomization.yaml).

| Area | Registered components |
| --- | --- |
| Sources | Helm and image sources |
| Networking | MetalLB, external-dns, public and private ingress-nginx |
| Certificates | cert-manager and custom resources under `infrastructure/crds` |
| Storage | NFS subdirectory provisioner (`nfs-client` StorageClass) |
| Monitoring | kube-prometheus-stack, Grafana, metrics-server |
| Controllers and UI | Reloader, Reflector, Capacitor and its LoadBalancer |
| Flux notifications | GitHub receiver |

Synology CSI, Discord notification provider, Loki, InfluxDB, and image automation
have files but are not registered in this list. Renovate configuration is stored
in the repository; successful update automation is not verified by this audit.

## Enabled applications

The [application registration list](../clusters/homelab/apps/kustomization.yaml)
includes podinfo, Audiobookshelf, Mosquitto, PostgreSQL, Home Assistant, Actual,
Sump-it, ingress-proxy, Jellyfin, Mealie, SparkyFitness, kia-poller, and KitchenOwl.
Other application directories and commented registrations are retained examples
or disabled workloads.

## Networking and storage

[MetalLB's pool](../infrastructure/crds/metallb-config.yaml) is `192.168.11.0/24`.
The public ingress requests `192.168.11.1`, and the private ingress requests
`192.168.11.99`. Router forwarding and LAN reachability require separate verification.

[external-dns](../infrastructure/networking/external-dns/deployment.yaml) uses
Cloudflare, watches services and ingresses, filters to `orriborri.com` and
`vetelainen.fi`, and excludes objects annotated with
`external-dns.alpha.kubernetes.io/exclude: "true"`.

The [active NFS manifest](../infrastructure/storage/nfs-subdir-external-provisioner/nfs-subdir-external-provisioner.yaml)
uses `${NFS_SERVER}` and `${NFS_PATH}` and creates `nfs-client`. The neighboring
`release.yaml` is not included by its local Kustomization. Some workloads use
static volumes; inspect their manifests before assuming dynamic provisioning.

## Physical platform

The historical inventory lists a Minisforum UM580, Synology DS420+, UniFi
networking, and Talos virtual machines on Proxmox VE. Hardware, VM counts,
resource allocations, backups, and recovery times cannot be established from
these Kubernetes manifests and have not been verified.

See [configuration](configuration.md) for changes and local validation.
