# Talos cluster setup on Proxmox

Initial setup completed and runtime health verified on 2026-11-04, with iSCSI
installation and live storage tests recorded on 2026-11-08. This is the record of
the installation performed on 2026-11-03–04, including the configuration changes
needed to use the repository's existing cluster identity.

## Installed layout

| VM ID | Hostname | Proxmox host | Address | vCPUs | RAM | Disk |
| --- | --- | --- | --- | --- | --- | --- |
| 201 | talos-controlplane-1 | proxmox (`192.168.10.2`) | `192.168.10.21` | 2 | 4 GiB | 32 GiB |
| 202 | talos-worker-1 | proxmox (`192.168.10.2`) | `192.168.10.22` | 2 | 8 GiB | 32 GiB |
| 203 | talos-worker-2 | proxmox2 (`192.168.10.3`) | `192.168.10.23` | 2 | 8 GiB | 32 GiB |

- Proxmox VE: `9.2.2`; cluster name: `Homelab`.
- Talos Linux: `v1.13.12`.
- Kubernetes: `v1.36.2`; cluster name: `home-lab`.
- Kubernetes API: `https://192.168.10.21:6443`.
- VM disks: each host's `local-lvm`, with discard and SSD emulation enabled.
- Network: VirtIO NIC on `vmbr0`; Talos interface name: `ens18`.
- Node addresses: static `/23`, gateway and DNS server `192.168.10.1`.
- Pod network: `10.244.0.0/16`; service network: `10.96.0.0/12`.
- Pod networking: Talos's default Flannel; cluster DNS: CoreDNS.

The owner confirmed `.21`–`.23` were reserved and available. The `/23` prefix was
taken from the guests' initial DHCP configuration. Addresses are configured in
Talos; this procedure did not create router DHCP reservations.

During initial setup, Synology shared storage and Proxmox HA were **not**
configured. Kubernetes iSCSI storage was added in the follow-up below; VM disks remain
local to their hosts. With one control plane, losing `proxmox` also loses the
Kubernetes API until that host or VM is recovered. Home Assistant is a separate,
pre-existing VM (100) on the same host.

## 1. Establish API access and inspect capacity

Both hosts expose the API at `https://HOST:8006/api2/json/`. Credentials were
provided through `PROXMOX_TOKEN_ID` and `PROXMOX_TOKEN_SECRET`, without putting
their values in repository files.

The token initially authenticated but had no effective permissions: node status
returned `403` for `Sys.Audit`, and storage and guest lists were empty. Assigning
`PVEAdmin` at `/`, with propagation, to **both the user and the privilege-separated
token** enabled VM provisioning. This is broad cluster management access, not a
minimal custom provisioning role.

Before creating guests, inspect `/cluster/resources`, each node's `/network`, and
`/storage`. Both hosts had an active `vmbr0`, `local` ISO storage, and `local-lvm`
disk storage. `proxmox` had approximately 19.4 GiB RAM and `proxmox2` 15.5 GiB;
the placement above left room for the hosts and existing Home Assistant VM.

The API checks used TLS certificate verification disabled for the homelab's
certificates. This does not establish certificate trust; configure trusted
certificates for a permanent API client.

## 2. Obtain the installation ISO

The installed image was the standard official release ISO, without extensions:

- [Talos v1.13.12 release](https://github.com/siderolabs/talos/releases/tag/v1.13.12)
- Asset: `metal-amd64.iso` (335,884,288 bytes).
- Verified SHA-256:
  `facf971fe38f27642c3b8d821c471dd47229f50c2a0482f6500bb554a2d00713`.

For this pinned release, a repeat download can be verified locally:

```bash
mkdir -p /tmp/homelab-talos-images
curl -fL --output /tmp/homelab-talos-images/metal-amd64.iso \
  https://github.com/siderolabs/talos/releases/download/v1.13.12/metal-amd64.iso
curl -fL --output /tmp/homelab-talos-images/sha256sum.txt \
  https://github.com/siderolabs/talos/releases/download/v1.13.12/sha256sum.txt
(
  cd /tmp/homelab-talos-images
  awk '$2 == "metal-amd64.iso" || $2 == "*metal-amd64.iso"' sha256sum.txt |
    sha256sum --check --strict
)
```

The server-side Proxmox `download-url` API returned `403`. A custom Talos Factory
ISO containing the QEMU guest agent also failed to download. Instead, the official
ISO was downloaded and checksum-verified locally, then uploaded through each
host's `local` storage upload API as `talos-v1.13.12-amd64.iso`.

The equivalent UI operation is **host → local → ISO Images → Upload**, once on
each host. `local` is not shared storage.

## 3. Create and boot the VMs

The VMs were created through the Proxmox API. For a manual repeat, use **Create
VM** on the host listed in the table and configure:

| Setting | Value |
| --- | --- |
| OS type | Linux (`l26`) |
| CPU | `x86-64-v2-AES`, 1 socket, 2 cores |
| Memory | Fixed allocation from the table; ballooning disabled |
| SCSI controller | VirtIO SCSI (`virtio-scsi-pci`) |
| System disk | SCSI 0, `local-lvm`, 32 GiB, discard and SSD enabled |
| NIC | VirtIO, bridge `vmbr0` |
| Serial port | `serial0`, socket |
| Start at boot | Enabled |
| Initial CD/DVD | `local:iso/talos-v1.13.12-amd64.iso` |
| Initial boot order | `scsi0;ide2;net0` |

The standard ISO has no QEMU guest agent, so Proxmox could not report guest IPs.
Read the Talos dashboard in each VM's graphical console instead. The serial
console did not provide the dashboard during this installation.

The observed maintenance addresses were `.112` for VM 201, `.32` for VM 202, and
`.12` for VM 203. These were temporary DHCP leases: **read the consoles again
before applying configurations on a future installation**. Verify the VM identity
and `/dev/sda` installation disk before proceeding.

```bash
# Replace this address with the intended VM's current maintenance address.
talosctl --nodes 192.168.10.112 get links --insecure
talosctl --nodes 192.168.10.112 get disks --insecure
```

## 4. Prepare private machine configurations

The root `controlplane.yaml`, `worker.yaml`, and `talosconfig` were not overwritten.
They contain the existing identity but are **not the final installed configuration**:

- Root machine files pin Kubernetes `1.37.2`, which Talos `1.13.12` rejected.
- The root Talos admin certificate expired on 2026-09-05.
- Root machine files do not contain the per-node static network configuration.
- The historical `talos-machine-patch.yaml` extension patch was not used.

Private working files are in `.talos-local/`, with directory mode `0700`, file
mode `0600`, and a directory-local `.gitignore` containing `*`. Keep and back up
these files securely; do not commit their credentials or copy their contents
into tickets or logs.

To reproduce the credential preparation **in a fresh private output directory**:

```bash
mkdir -p .talos-local
chmod 700 .talos-local
printf '*\n' > .talos-local/.gitignore
umask 077
talosctl gen secrets --from-controlplane-config controlplane.yaml \
  --output-file .talos-local/secrets.yaml
talosctl gen config home-lab https://192.168.10.21:6443 \
  --with-secrets .talos-local/secrets.yaml \
  --output-types talosconfig --output .talos-local/talosconfig
talosctl --talosconfig .talos-local/talosconfig config endpoint 192.168.10.21
```

These commands preserve the original cluster identity and create a fresh Talos
admin credential. They do not generate the final machine files: those were
prepared by copying the root role configurations and applying these changes:

- All nodes: retain installer `ghcr.io/siderolabs/installer:v1.13.12`, installation
  disk `/dev/sda`, and `wipe: false`.
- All nodes: set kubelet to `ghcr.io/siderolabs/kubelet:v1.36.2`.
- Control plane: set API server, controller manager, scheduler, and kube-proxy
  images to `registry.k8s.io/COMPONENT:v1.36.2`.
- Set the hostname and static address for each VM according to the layout table.

For example, worker 2's network section is:

```yaml
machine:
  network:
    hostname: talos-worker-2
    nameservers:
      - 192.168.10.1
    interfaces:
      - interface: ens18
        dhcp: false
        addresses:
          - 192.168.10.23/23
        routes:
          - network: 0.0.0.0/0
            gateway: 192.168.10.1
```

The resulting files are `talos-controlplane-1.yaml`, `talos-worker-1.yaml`, and
`talos-worker-2.yaml` inside `.talos-local/`. The administration commands used the
installed `talosctl v1.11.2`; the server validated the submitted configurations.

## 5. Install Talos and bootstrap Kubernetes

Only run maintenance-mode apply commands against the intended new VMs. The
addresses below are the leases observed during this installation, not guaranteed
addresses for a rebuild.

```bash
talosctl --nodes 192.168.10.112 apply-config --insecure \
  --file .talos-local/talos-controlplane-1.yaml
talosctl --nodes 192.168.10.32 apply-config --insecure \
  --file .talos-local/talos-worker-1.yaml
talosctl --nodes 192.168.10.12 apply-config --insecure \
  --file .talos-local/talos-worker-2.yaml
```

An apply response saying “without a reboot” means the configuration was accepted;
installation and its subsequent reboot still need time to finish. The addresses
change to `.21`–`.23`. Workers can wait for control-plane certificates while the
first control plane is not yet available.

Check the control-plane services, then bootstrap **once**, after Talos reports
that etcd is waiting for the first bootstrap:

```bash
talosctl --talosconfig .talos-local/talosconfig --nodes 192.168.10.21 services
talosctl --talosconfig .talos-local/talosconfig --nodes 192.168.10.21 bootstrap
talosctl --talosconfig .talos-local/talosconfig --nodes 192.168.10.21 \
  kubeconfig .talos-local/kubeconfig
chmod 600 .talos-local/kubeconfig
```

Do not bootstrap again as a general repair step. Initial API connection refusals,
missing node registrations, and startup restarts cleared as etcd, the API server,
bootstrap RBAC, and kubelet certificates became available.

One correction was needed after bootstrap: the running kube-proxy DaemonSet still
used `v1.37.2` after the control-plane configuration was updated. Its image was
explicitly aligned with the rest of the cluster:

```bash
kubectl --kubeconfig .talos-local/kubeconfig -n kube-system set image \
  daemonset/kube-proxy kube-proxy=registry.k8s.io/kube-proxy:v1.36.2
kubectl --kubeconfig .talos-local/kubeconfig -n kube-system \
  rollout status daemonset/kube-proxy --timeout=45s
```

After installation, all three CD/DVD drives were set to `none,media=cdrom`, and
the boot order changed to `scsi0;net0`. Installation ISOs remain in host storage,
but are no longer attached to the guests.

## 6. Verify and operate the cluster

```bash
kubectl --kubeconfig .talos-local/kubeconfig get nodes -o wide
kubectl --kubeconfig .talos-local/kubeconfig get pods -A
talosctl --talosconfig .talos-local/talosconfig \
  --nodes 192.168.10.21,192.168.10.22,192.168.10.23 get machinestatus
```

At completion, all three Kubernetes nodes were `Ready` on `v1.36.2`, and all three
Talos machines reported stage `running`, ready `true`. CoreDNS, Flannel,
kube-proxy, API server, controller manager, and scheduler pods were running.
Controller manager and scheduler had startup restarts before bootstrap completed.

Flux, homelab applications, NAS-backed storage, and Proxmox HA were not deployed as
part of this setup. The repository's registered workloads describe desired
configuration, not the contents of this new cluster. Review prerequisites and
[secret handling](sops.md) before continuing with the README's Flux bootstrap.

## Follow-up: iSCSI tools installed

Verified on 2026-11-08: all three nodes report `iscsi-tools v0.2.0` and
Image Factory schematic
`c9078f9419961640c712a8bf2bb9174933dfcf1da383fd8ea2b7dc21493f8bac`.
Both workers already had the extension when this follow-up resumed. The control
plane was upgraded to the matching image, retaining Talos `v1.13.12`:

```bash
talosctl --talosconfig .talos-local/talosconfig --nodes 192.168.10.21 \
  upgrade --image factory.talos.dev/installer/c9078f9419961640c712a8bf2bb9174933dfcf1da383fd8ea2b7dc21493f8bac:v1.13.12 \
  --wait --timeout 10m
```

The upgrade completed with its post-check passing. After recovery, all three
Kubernetes nodes were `Ready` and all listed pods were `Running` with their
containers ready. The root `controlplane.yaml` and `worker.yaml` installer
references select this same image for future installations. Installing the
extension alone does not configure Synology CSI or verify iSCSI storage access.

The subsequent storage setup enabled the existing Synology CSI manifests using
the encrypted NAS credentials and Flux's SOPS key. `syno-storage` explicitly uses
iSCSI on `192.168.1.244`, `/volume1`, ext4, and a `Retain` reclaim policy. It is
not a default storage class. The node plugin tolerates the control-plane taint
and uses the absolute CSI socket endpoint `unix:///csi/csi.sock`.

A dedicated 1 GiB test claim successfully provisioned a NAS volume, attached and
mounted it on `talos-worker-1`, and passed a write/read test. The CSI controller
and all three node plugins were running. The same test volume was then detached
and mounted on `talos-worker-2`, where the original marker was successfully read.
Existing application volumes continue to use NFS. The live driver was applied
directly; GitOps registration takes effect after these repository changes are
committed and reconciled. The registrations are included in the root cluster
entrypoint.

The temporary test pod, claim, volume, and test storage class were removed after
verification. Final checks showed all CSI pods running and all nodes `Ready`.

## Interruption: first Proxmox host went offline

During setup, `proxmox` stopped responding to both SSH and HTTPS. The surviving
host's Corosync log recorded at `Nov 03 19:36:25` (host log time):

```text
Node 1 was shut down by sysadmin
```

This indicates an orderly cluster-service departure; it does not identify the
initiator or prove whether the entire host was shut down versus its cluster
service being stopped. No host shutdown or reboot command was issued during this
setup. The two-node cluster lost quorum while only `proxmox2` remained online.

A Wake-on-LAN request through Proxmox 2 was rejected because `PVEAdmin` did not
grant `Sys.PowerMgmt`. Three directed-broadcast magic packets were then sent from
the administration computer to `192.168.10.255:9`, targeting
`c8:5b:76:d2:65:d5`, the MAC inferred from the first host's NIC alternate name.
The host did not become reachable during that check. BIOS/NIC Wake-on-LAN support
and router broadcast forwarding were not verified.

The host was later confirmed online, with its VMs running, and setup resumed.
The exact shutdown trigger and the mechanism that brought it back were not
established. To investigate a repeat, inspect the affected host's previous-boot
journal locally once it is reachable; the surviving host's logs establish the
departure but not its cause.

## References

- [Talos installation on Proxmox](https://docs.siderolabs.com/talos/v1.13/platform-specific-installations/virtualized-platforms/proxmox)
- [Proxmox user and API-token permissions](https://github.com/proxmox/pve-docs/blob/master/pveum.adoc)
- [Proxmox node management and Wake-on-LAN](https://github.com/proxmox/pve-docs/blob/master/pvenode.adoc)
