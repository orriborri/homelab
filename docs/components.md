# Homelab components

Reviewed against repository manifests on 2026-10-31. “Enabled” means registered
in the cluster Kustomizations; it does not establish live readiness. Storage
status was updated from live checks on 2026-11-08; the Synology CSI registration
is included in the root cluster entrypoint.

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
| Storage | NFS subdirectory provisioner (`nfs-client`); Synology CSI (`syno-storage`, explicit opt-in) |
| Monitoring | Observability stack (Prometheus, Grafana, Alertmanager, Loki, Alloy), InfluxDB 2 for Home Assistant and RTL433, metrics-server |
| Controllers and UI | Reloader, Reflector, Capacitor and its LoadBalancer |
| Flux notifications | GitHub receiver |

Discord notification provider and image automation
have files but are not registered in this list. Renovate configuration is stored
in the repository; successful update automation is not verified by this audit.

## Enabled applications

The [application registration list](../clusters/homelab/apps/kustomization.yaml)
includes podinfo, Audiobookshelf, Mosquitto, PostgreSQL, Home Assistant, Actual,
Sump-it, ingress-proxy, Jellyfin, Mealie, SparkyFitness, kia-poller, and KitchenOwl.
Other application directories and commented registrations are retained examples
or disabled workloads.

## Networking and storage

[MetalLB's pool](../infrastructure/networking/metallb/config/metallb-config.yaml) is `192.168.11.0/24`.
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

Live checks on 2026-11-08 found `nfs-client` and `homelab-nfs`, and four bound
Audiobookshelf volumes using NFS on `192.168.1.244`. Synology CSI was then deployed
with `syno-storage`: iSCSI, ext4, `/volume1`, `Retain`, expansion enabled, and
not a default class. All three nodes run `iscsi-tools v0.2.0` and the CSI node
plugin. A 1 GiB volume passed write/read on worker 1 and retained its data after
reattachment to worker 2. Temporary test resources were removed. Existing
application volumes were not migrated. See the [setup record](talos-proxmox-setup.md)
for installation and verification details, including GitOps registration.

## Physical platform

The historical inventory lists a Minisforum UM580, Synology DS420+, UniFi
networking, and Talos virtual machines on Proxmox VE. Hardware, VM counts,
resource allocations, backups, and recovery times cannot be established from
these Kubernetes manifests and have not been verified.

See [configuration](configuration.md) for changes and local validation.

## Observability replacement

The previous separate monitoring manifests were replaced with a single
[observability stack](observability.md). Its registration, together with Synology
CSI, is included in the root cluster entrypoint used by live Flux. The nested
infrastructure list alone is not included by that entrypoint. Flux reconciles the
committed registration. Home Assistant (`192.168.10.96`) and Pi (`192.168.10.67`)
metrics/log collection remains pending; their MQTT migration is complete.

## MQTT migration

Mosquitto now runs in Kubernetes at `192.168.11.4:1883`, with authenticated access
and a 1 GiB iSCSI volume. RTL433, Theengs, and Home Assistant use this endpoint;
the old Pi broker is stopped and its Quadlet disabled. See the
[MQTT guide](mqtt.md) for configuration, verification, and rollback backups.

## Home Assistant history

Home Assistant now writes new state changes to the InfluxDB 2 bucket with 90-day
retention. Grafana has a read-only datasource for that bucket. This is separate
from Recorder and does not import Recorder history. See the
[InfluxDB guide](influxdb.md) for configuration and live verification.

## 433 MHz radio history

Telegraf stores RTL433 event messages from the Pi's MQTT topic in a separate
InfluxDB bucket; Grafana has an RTL433 datasource and device dashboard. See the
[RTL433 guide](rtl433.md).
