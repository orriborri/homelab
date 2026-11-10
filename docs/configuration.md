# Further configuration

Reviewed against repository manifests on 2026-10-31. See the
[current component inventory](components.md) for enabled registrations. These
instructions describe configuration changes; they do not confirm deployed health.
Components already registered do not need to be added again. The Synology CSI
section includes live verification from 2026-11-08 and GitOps registration.

## Configuration approaches

For each app and infrastructure manifest, make sure you understand roughly what you are about to deploy and what configuration values the deployment will use.

There are a few different approaches to configuration in the k8s ecosystem. In this repo you will find examples of:

- ### Bare deployments

  A `kind: Deployment` manifest instructs the cluster to deploy a container directly from e.g. Docker Hub or another container registry. For example, the [podinfo](/apps/podinfo/podinfo.yaml) app.

  - Advantages: Very simple to write yourself for quick deployments of container images.

  - Downsides: Verbose configuration when you want to expose the deployment via a service and/or ingress. You then need to write separate Service/Ingress manifests, as for example the [podinfo](/apps/podinfo/podinfo.yaml) app manifest does.

  Configuration usually happens through environment variables or volume mounts to mount config files from either `kind: ConfigMap` or `kind: Secret` manifests. These kinds of manifests both act as a key/value store, where the key is the filename and value is the file contents. The filenames will be available under some given volume mountPath.

- ### Helm

  [Helm](https://helm.sh/) is a package manager for Kubernetes.

  Applications come packaged as Helm charts. You can find readily made helm charts [e.g. here](https://artifacthub.io/packages/search)

  This repo is structured such that Helm chart "sources" - HelmRepositories - are stored in [/infrastructure/sources](/infrastructure/sources), and charts can be "released" by a HelmRelease (for example [/infrastructure/networking/ingress-nginx-public/release.yaml](/infrastructure/networking/ingress-nginx-public/release.yaml), here you can also see values being overridden)

  - Advantages: Helm charts can be an easy way to deploy very complex infrastructure into your cluster very conveniently. Helm charts usually let you override "values" to configure the deployment as you want. [Here's an example](https://artifacthub.io/packages/helm/prometheus-community/kube-prometheus-stack?modal=values) of configurable values in `kube-prometheus-stack`'s values.yaml.

  - Downsides: Possibly more work to understand what goes wrong if a deployment fails, although with popular helm charts usually someone else online has had the same problem and found a solution.

# Notes on configuring specific apps & infrastructure:

These notes explain how I make use of each of the services and how to configure them for this use case. Note that they can usually do a lot more than explained here.

## [MetalLB](https://metallb.universe.tf/)

MetalLB allows k8s services to appear under their own unique IP address in your home network.

- [/infrastructure/networking/metallb/config/metallb-config.yaml](/infrastructure/networking/metallb/config/metallb-config.yaml)

  Set the IP address pool that MetalLB should use when exposing services to your home network.

  Make sure it's outside the range of your router's DHCP allocation pool (don't use e.g. 192.168.1.0/24) so you don't get collisions.

- Search for `metallb.universe.tf/loadBalancerIPs` annotations in the repo.

  This annotation sets a static IP (from the MetalLB IP address pool) for a given service. Useful if you don't want the IP of a certain service to change (for example a DNS server or nginx-ingress, both of which you will probably configure IP addresses manually for in your router settings)

- Add `metallb.yaml` and `crds.yaml` back in [/clusters/homelab/infrastructure/kustomization.yaml](/clusters/homelab/infrastructure/kustomization.yaml). Commit and push.

- You should now start seeing external IP:s being assigned to your services in `kubectl get svc -A`

## external-dns

[external-dns](https://github.com/kubernetes-sigs/external-dns) keeps the DNS records of supported DNS servers in sync with IP addresses of your services. The [deployment](/infrastructure/networking/external-dns/deployment.yaml) uses Cloudflare with domain filters for `orriborri.com` and `vetelainen.fi`, refer to the [external-dns documentation](https://kubernetes-sigs.github.io/external-dns) on what other providers are supported and how to configure them.

- Search for `external-dns.alpha.kubernetes.io/hostname` annotations in the repo.

  This annotation sets the hostname/domain name that external dns will publish to Cloudflare.
  Can be set to multiple values by comma separating them.

- Set `CLOUDFLARE_EMAIL` and `EXTERNAL_DNS_CLOUDFLARE_API_TOKEN` in your [/clusters/homelab/cluster-secrets.yaml](/clusters/homelab/cluster-secrets.yaml) file.

  See [external-dns documentation](https://kubernetes-sigs.github.io/external-dns/v0.13.4/tutorials/cloudflare/#creating-cloudflare-credentials) on how to generate Cloudflare API tokens with sufficient permissions for external-dns' use.

  See [/docs/sops.md](/docs/sops.md) for more information on how to store secrets.

- Add `external-dns.yaml` back in [/clusters/homelab/infrastructure/kustomization.yaml](/clusters/homelab/infrastructure/kustomization.yaml). Commit and push.

- Check the managed zone's DNS records in Cloudflare and inspect `kubectl -n external-dns logs deployment/external-dns`. Objects annotated with `external-dns.alpha.kubernetes.io/exclude: "true"` are excluded.

## Flux CD notification receiver

Normally, flux will poll your repository for changes. This means there will be a delay between when you push until flux picks up on the changes. You can get around this by manually running `flux reconcile kustomization flux-system`, or by setting up webhook receivers so that GitHub will notify your cluster of the push event.

- [/infrastructure/flux/notification-receiver/github-webhook-token.yaml](/infrastructure/flux/notification-receiver/github-webhook-token.yaml)

  If you do want to use [flux webhook receivers](https://fluxcd.io/flux/guides/webhook-receivers/), then this file should contain a randomly generated `token` that flux will use to verify that it's GitHub sending the HTTP request and not somebody else.

  See [/docs/sops.md](/docs/sops.md) for more information on how to store secrets.

  Replace the `token` value with the output of `head -c 12 /dev/urandom | shasum | cut -d ' ' -f1`. Take note of the value, as you will need it later.

  Remember to encrypt the secrets file before you commit.

- The domain name for the receiver's ingress is set in cluster config (or secrets if you want) with the `FLUX_NOTIFICATION_DOMAIN_NAME` key, for example:

  ```
  FLUX_NOTIFICATION_DOMAIN_NAME: flux-notification.example.org
  ```

- Add `notification-receiver.yaml` back in [/clusters/homelab/infrastructure/kustomization.yaml](/clusters/homelab/infrastructure/kustomization.yaml). Commit and push.

- Wait for reconciliation. After reconciliation finishes, you should be able to run `kubectl -n flux-system get receiver`. Note down the receiver URL (i.e. `/hook/...`).

- On GitHub, navigate to your repository and click on the “Add webhook” button under “Settings/Webhooks”. Fill the form with:

  - Payload URL: combine `FLUX_NOTIFICATION_DOMAIN_NAME` and the hook URL from above:

    `https://<FLUX_NOTIFICATION_DOMAIN_NAME><ReceiverURL>` (the receiver URL already starts with `/`).

  - Secret: use the `token` string from above

- Next time you commit a change, Flux should start reconciliation almost immediately. You can see this take place with `flux logs --tail 20 -f`.

## Flux CD notification provider

Discord provider and alert manifests exist, but `notification-provider.yaml` is not currently registered in the infrastructure Kustomization. Enable it only after configuring the webhook secret.

- Create a Discord server for your homelab

- Go to server settings -> Integrations -> Webhooks

- Create new webhook and click `Copy Webhook URL`

- Paste the URL into [/infrastructure/flux/notification-provider/discord-webhook-url.yaml](/infrastructure/flux/notification-provider/discord-webhook-url.yaml) under the `address:` key.

  See [/docs/sops.md](/docs/sops.md) for more information on how to store secrets.

- Add `notification-provider.yaml` back in [/clusters/homelab/infrastructure/kustomization.yaml](/clusters/homelab/infrastructure/kustomization.yaml). Commit and push.

- You should now get Discord notifications on reconciliation failures.

## ingress-nginx

[ingress-nginx](https://github.com/kubernetes/ingress-nginx) acts as a reverse proxy for HTTP requests to your cluster. Based on the subdomain a HTTP request was made to, ingress-nginx can forward the request to the appropriate service.

- This repo contains two instances of ingress-nginx:

  - ingress-nginx-public: For public (Internet) facing HTTP services
  - ingress-nginx-private: For private (LAN) facing HTTP services

- It's possible to select which ingress controller you want to use by specifying either:

  - `ingressClassName: public`
  - `ingressClassName: private`

  in the `spec:` section of a `kind: Ingress` manifest. [Here's an example for the podinfo ingress](/apps/podinfo/podinfo.yaml).

- By default the public ingress is set to use a static IP `192.168.11.1`, which
  you can use in your router's port forwarding settings to forward both ports 80
  (HTTP) and 443 (HTTPS) to.

- Add `ingress-nginx-public.yaml` and/or `ingress-nginx-private.yaml` back in [/clusters/homelab/infrastructure/kustomization.yaml](/clusters/homelab/infrastructure/kustomization.yaml). Commit and push.

- For admission webhook certificate failures, inspect the actual webhook and
  service names before taking recovery action. The old hard-coded patch command
  was removed because those generated names and certificate sources were not
  verified against the deployed Helm release.

## cert-manager

[cert-manager](https://cert-manager.io/) obtains and renews Let's Encrypt certificates.

The [ClusterIssuers](/infrastructure/crds/cluster-issuers.yaml) configure HTTP01 using the public ingress and Cloudflare DNS01 selected for `*.orriborri.com`. Adapt that selector if changing domains.
DNS01 allows requesting wildcard certificates that can be shared by all your
subdomains (including private services).

DNS01 requires some extra configuration, as cert-manager needs access to your
DNS provider in order to prove ownership of a domain.

- Set `LETSENCRYPT_EMAIL` and `CLOUDFLARE_EMAIL` in your [/clusters/homelab/cluster-secrets.yaml](/clusters/homelab/cluster-secrets.yaml) file.

  Set `api-token` in your [/infrastructure/certificates/cert-manager/cloudflare-api-token-secret.yaml](/infrastructure/certificates/cert-manager/cloudflare-api-token-secret.yaml) file.

  See [cert-managers documentation](https://cert-manager.io/docs/configuration/acme/dns01/cloudflare/#api-tokens) on how to generate Cloudflare API tokens with sufficient permissions for cert-manager's use.

  See [/docs/sops.md](/docs/sops.md) for more information on how to store secrets.

  This e-mail address will be used by Let's Encrypt to let you know of certificate expiration and other possible issues.

- Remember to set `LETSENCRYPT_CLUSTER_ISSUER` in [/clusters/homelab/cluster-config.yaml](/clusters/homelab/cluster-config.yaml) back to `letsencrypt-prod` once you have verified that your setup is working with certificates issued by `letsencrypt-staging` (which you naturally have to manually allow in your browser when testing).

- Add `cert-manager.yaml` and `crds.yaml` back in [/clusters/homelab/infrastructure/kustomization.yaml](/clusters/homelab/infrastructure/kustomization.yaml). Commit and push.

## synology-csi

Deployed and verified on 2026-11-08. The controller and node plugins run in
`synology-csi`; all three nodes have `iscsi-tools v0.2.0` and a running
`ext-iscsid` service. The existing SOPS-encrypted credentials were decrypted using
Flux's key and applied without changing the encrypted source. Local GPG keys
could not decrypt this file. Do not replace the working credentials as part of
normal setup; use [SOPS](sops.md) when credentials need editing.

The [storage class](../infrastructure/storage/synology-csi/storage-class.yaml)
`syno-storage` uses Synology `192.168.1.244`, `/volume1`, iSCSI, and ext4.
It allows expansion and retains volumes when claims are deleted. It is not a
default class: request it explicitly, for example:

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: application-data
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: syno-storage
  resources:
    requests:
      storage: 1Gi
```

A dedicated test volume passed provisioning, attach, mount, write/read on worker
1, and reading the same data after reattachment to worker 2. The temporary pod,
claim, volume, and test class were removed. This verifies both workers; a workload
mount on the control plane was not tested. Existing application volumes use NFS
and were not migrated.

The node plugin has a control-plane toleration and uses
`unix:///csi/csi.sock`. The driver was applied directly for verification. Its
[Flux registration](../clusters/homelab/infrastructure/kustomization.yaml) is
included in the root cluster entrypoint. Verify Flux reconciliation after
publishing changes before relying on GitOps to manage them.

For operational checks, use the local cluster configuration:

```bash
kubectl --kubeconfig .talos-local/kubeconfig -n synology-csi get pods -o wide
kubectl --kubeconfig .talos-local/kubeconfig get csidrivers,storageclasses,pv
kubectl --kubeconfig .talos-local/kubeconfig get pvc -A
kubectl --kubeconfig .talos-local/kubeconfig -n synology-csi logs \
  synology-csi-controller-0 -c csi-plugin --tail=50
talosctl --talosconfig .talos-local/talosconfig \
  --nodes 192.168.10.21,192.168.10.22,192.168.10.23 services
```

Initial `ext-iscsid` logs reported missing `/etc/iscsi/iscsid.conf` options;
subsequent successful iSCSI login and volume tests established working access.
The Talos service listing reports `?` for the daemon health field, so the running
service alone is not a storage test. See the [setup record](talos-proxmox-setup.md)
for the pinned installer and upgrade command.

## nfs-subdir-external-provisioner

NFS provisioning is currently enabled. The local
[Kustomization](/infrastructure/storage/nfs-subdir-external-provisioner/kustomization.yaml)
includes only `nfs-subdir-external-provisioner.yaml`.

- Set `NFS_SERVER` and `NFS_PATH` in the shared substitution configuration. Permit
  access from cluster nodes on the NFS server.
- Edit the [active manifest](/infrastructure/storage/nfs-subdir-external-provisioner/nfs-subdir-external-provisioner.yaml)
  to change chart values. The neighboring `release.yaml` is unused by this path;
  editing it will not change the reconciled release.
- The active StorageClass is `nfs-client`, is not the default, and sets
  `reclaimPolicy: Delete` with `archiveOnDelete: true`. Review storage lifecycle
  before deleting claims. Static workload volumes have their own policies.
- Inspect `kubectl get storageclass` and `kubectl get pvc -A` after reconciliation.

## Apps

Use the existing app manifests as examples on how to create new ones if needed.

You can install apps from Helm charts as well, remember to add the HelmRepository to [/infrastructure/sources](/infrastructure/sources) if it doesn't already exist, and include the manifest
in [/infrastructure/sources/kustomization.yaml](/infrastructure/sources/kustomization.yaml) as well. Then create a `kind: HelmRelease` manifest under `apps/<app>/` and include it in that directory's `kustomization.yaml`. Create a separate Flux `kind: Kustomization` under `clusters/homelab/apps/` pointing to `./apps/<app>`, following the existing decryption, substitution, and dependency patterns. Register that Flux manifest in [/clusters/homelab/apps/kustomization.yaml](/clusters/homelab/apps/kustomization.yaml).

Look at example HelmRelease manifests by searching for `kind: HelmRelease` under /infrastructure.

## Validation

Before committing a change, render each changed workload and the cluster entrypoint:

```sh
kubectl kustomize apps/<app>
kubectl kustomize clusters/homelab
pre-commit run --all-files
```

Repeat rendering for changed infrastructure directories that contain a local
Kustomization. Local rendering does not perform Flux substitutions or SOPS
decryption and does not render Helm chart resources. Some Flux paths, such as
`infrastructure/crds`, contain plain manifests without a local Kustomization.

After deploying, check reconciliation and runtime health separately:

```sh
flux get all -A
kubectl get pods -A
kubectl get events -A --field-selector type=Warning
```

## Observability

Use the [observability guide](observability.md) for the replacement Prometheus,
Grafana, Alertmanager, Loki, and Alloy stack, storage requirements, access, and
verification. The old separate Grafana and loki-stack definitions were removed.
Home Assistant VM and Pi monitoring require external configuration and are tracked
separately in that guide.
