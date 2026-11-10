# MQTT in Kubernetes

Migrated from the Raspberry Pi to Kubernetes on 2026-11-10.

## Broker and clients

- LAN broker: `192.168.11.4:1883`, a MetalLB LoadBalancer named `mqtt`.
- Kubernetes broker: `mqtt.default.svc.cluster.local:1883`.
- Deployment: `default/mosquitto`, one replica with a `Recreate` strategy.
- The existing MQTT account and password were preserved. Anonymous access is
  disabled. Password hashes are stored in the SOPS-encrypted
  [Secret](../apps/mosquitto/auth-secret.yaml); plaintext passwords are not in Git.
- Persistence: `default/mosquitto-data`, 1 GiB on `syno-storage`, with NAS volume
  retention inherited from the storage class. Mosquitto saves every 60 seconds
  and on graceful shutdown.
- Image: the same Mosquitto 2.1.2 build as the Pi, pinned by its multi-architecture
  digest in the [deployment](../apps/mosquitto/mosquitto.yaml).

The broker uses the existing MQTT protocol on port 1883. No public DNS record or
Internet ingress was created. Use the LAN address above for external clients.

The following clients were moved to `192.168.11.4`, with credentials unchanged:

| Client | Host | Configuration |
| --- | --- | --- |
| RTL433 | Pi `192.168.10.67`, hostname `rpi3b` | `/etc/rtl_433/rtl_433.conf` |
| Theengs Gateway | Pi `192.168.10.67` | `/etc/theengs/theengsgw.conf` |
| Home Assistant | `192.168.10.96`, SSH user `root` | Existing MQTT integration entry |

RTL433 and Theengs continue running on the Pi for its radio/Bluetooth hardware.
Their Podman Quadlet definitions no longer require the local Mosquitto service.
The Pi broker was stopped and its Quadlet renamed to
`/etc/containers/systemd/mosquitto.container.disabled`, preserving the old setup
for rollback.

## Migration and verification

The Pi broker was asked to flush its database, then its 20,239-byte
`/var/lib/mosquitto/mosquitto.db` was copied into the cluster volume before the
new broker started. Startup restored 41 retained messages. The password-file
Secret is copied into a private, broker-owned memory volume at startup, with
mode `0600`; the broker could not open the projected Secret file directly.

Authenticated publish/subscribe passed from both the administration machine and
the Pi. Anonymous connections were rejected. Both Pi clients showed established
connections to the cluster address. The broker client count confirmed three
real clients plus the temporary verification connection. No clients remained
on the old Pi listener before it was stopped.
After stopping the Pi broker, the authentication and publish/subscribe checks
passed again, all three real clients remained connected, the Deployment was
`1/1` ready, and the PVC was `Bound`.

Home Assistant's configuration check passed. Its SSH add-on token could not
change the integration through the API, so Core was briefly stopped, the
existing MQTT entry's broker address was updated in place, and Core restarted.
The entry ID and credentials were preserved. MQTT entities loaded after restart.

## Backups and rollback

Sensitive backups remain on their original hosts, outside Git:

- Pi client configuration backup:
  `/root/mqtt-migration-backup-20261110-102447/`.
- Pi broker data and password file remain in `/var/lib/mosquitto` and
  `/etc/mosquitto`; its disabled Quadlet remains in `/etc/containers/systemd`.
- Home Assistant integration backup:
  `/backup/mqtt-migration-20261110-221657/core.config_entries`.

For rollback, stop the cluster broker first, restore and start the Pi Quadlet,
then restore the client configuration backups and restart those clients.
Home Assistant's integration backup must be restored with Core stopped. The old
Pi database predates the cutover; rolling back to it would discard later retained
message changes unless the current cluster database is migrated back first.

## Operations and GitOps

```bash
kubectl --kubeconfig .talos-local/kubeconfig -n default get deployment mosquitto
kubectl --kubeconfig .talos-local/kubeconfig -n default get service mqtt
kubectl --kubeconfig .talos-local/kubeconfig -n default get pvc mosquitto-data
kubectl --kubeconfig .talos-local/kubeconfig -n default logs deployment/mosquitto -c mosquitto --tail=30
```

Edit the auth Secret with SOPS and restart the deployment after changing it so
the private password-file copy is refreshed. One replica is intentional: this
broker and its data volume do not provide active-active high availability.

The broker was applied directly for the migration. Its Flux registration is
included in the root cluster entrypoint and depends on `synology-csi`. Repository
changes become managed by Flux after publication and reconciliation. The
migration itself used direct application of the manifests.
