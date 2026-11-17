# Hermes Agent

For the new shared knowledge store, ownership boundaries and rollout status,
see [Second brain](second-brain.md). Pasta setup is independent of Hermes startup.

Hermes runs in the `hermes` namespace with its web dashboard enabled. Dashboard
credentials are in the SOPS-encrypted `apps/hermes/secrets.yaml`. Its configured
inference provider is OpenAI Codex; no messaging accounts are configured.

The initial installation was applied directly to the cluster on 2026-11-10 and
adopted by Flux on 2026-11-11. Flux now reconciles the Hermes workload from this
repository.

## Deployment

- The official `nousresearch/hermes-agent:v0.23.1` image is pinned by digest.
- One replica with `Recreate` prevents overlapping gateways using the same state.
- A 10 GiB `syno-storage` PVC holds `/opt/data`: configuration, credentials,
  sessions, SQLite databases, memories, skills, and the working directory.
- Resource requests are 250m CPU and 512 MiB RAM; limits are one CPU and 2 GiB
  RAM. Increase memory if browser or other subprocess-heavy tasks require it.
- The dashboard is at <https://hermes.orriborri.com> through the `private`
  ingress controller (`192.168.11.99`). It retains its username/password gate;
  the API listener stays on loopback. The hostname requires LAN or VPN access
  to the ingress address.
- cert-manager issues `hermes-tls` with the existing `letsencrypt-prod`
  Cloudflare DNS01 solver. The Cloudflare DNS-only A record points at
  `192.168.11.99` with TTL 300. It is managed directly for now; the Ingress is
  excluded from external-dns until that controller is explicitly adopted.
- A short-lived Kubernetes service account token is projected only into the
  Hermes container for read-only cluster inspection. No host paths or container
  runtime socket are mounted. Tool commands run locally as UID 10000.
  The image entrypoint starts as root to prepare storage and its supervisor,
  then drops the agent and dashboard to the Hermes user.

The current Flannel network does not provide policy enforcement by itself.
The namespace and read-only service account do not prevent access to other
network services. Add Home Assistant and other integrations deliberately with
their own credentials. Cluster changes are deployed through Git and Flux.

## Kubernetes inspection and GitOps management

Hermes uses the `hermes/hermes` ServiceAccount and `hermes-observer` ClusterRole.
The role permits `get`, `list`, and `watch` on workloads, pod logs, nodes,
namespaces, services, ingress, storage, metrics, events, and Flux resources.
It does not grant Secret or ConfigMap reads, exec/attach/port-forward, workload
writes, RBAC management, or node proxy access.

The pod keeps automatic token mounting disabled. Only the main container mounts
a kubelet-rotated token with a requested lifetime of one hour. A nonsecret
kubeconfig at `/opt/data/home/.kube/config` uses `tokenFile`, the cluster CA, and
`https://kubernetes.default.svc`. `kubectl` 1.36.2 is downloaded from the official
release and verified against its pinned SHA-256 digest. Native file discovery
works even when Hermes filters subprocess environment variables.

The homelab repository is cloned once to `/opt/data/workspace/homelab`, which is
the default working directory for new chats. Existing checkouts and uncommitted
work are preserved on pod restarts. The clone uses the existing scoped GitHub
credential helper and a local commit identity of `Hermes Agent <hermes@localhost>`.
Read root `AGENTS.md` before making changes.

For requested app creation or changes, Hermes should:

1. Inspect the current cluster and the repository's existing workload examples.
2. Fetch the repository's latest remote state without discarding local work.
3. Edit manifests under `apps/<app>` and register the app's Flux definition in
   both `clusters/homelab/apps/kustomization.yaml` and the active root entrypoint
   `clusters/homelab/kustomization.yaml`. Follow the repository's SOPS patterns;
   no decryption key or administrator kubeconfig is supplied to Hermes.
4. Render changed workloads and the root entrypoint with `kubectl kustomize`.
   Commit and push the requested changes, then observe Flux and pod readiness.

Read-only Kubernetes RBAC constrains direct API calls. Repository write access
is deployment authority: Flux applies the pushed manifests with its own
permissions. To revoke access, remove the ClusterRoleBinding and GitHub token;
restarting the pod alone does not revoke repository access.

Useful checks from Hermes's terminal:

```sh
kubectl get pods -A
kubectl get kustomizations -n flux-system
kubectl logs -n hermes deployment/hermes --tail=20
kubectl auth can-i get secrets -A        # no
kubectl auth can-i patch deployments -A # no
git -C /opt/data/workspace/homelab status --short
```

## GitHub access

The bundled `github` skill uses the GitHub CLI and `git`. The Hermes image does
not include `gh`, so an init container installs GitHub CLI 2.103.3 from the
official release package and verifies its SHA-256 digest before exposing it to
the Hermes container. Git uses `gh auth git-credential`, which reads the same
GitHub CLI credential store as `gh`.

Hermes strips `GH_TOKEN` from terminal subprocesses. The init container therefore
uses the scoped token with `gh auth login --with-token` to prepare a native
credential and settings files in an ephemeral volume. Both are owned by UID
10000 with mode `0600` and
mounted read-only at `/opt/data/home/.config/gh`, the terminal tool's native
GitHub configuration path. `GH_CONFIG_DIR` also points direct CLI calls there.
This preserves Hermes's subprocess credential filtering. Reloader rebuilds
the credential file when the SOPS Secret changes and the pod restarts.

Verified on 2026-11-16: the agent's terminal initially reported no GitHub login
even though direct container commands authenticated. Native CLI credentials in
the tool home resolved the failure; the agent's terminal successfully returned
`orriborri/homelab` from `gh repo view` without a second browser login.

To let Hermes create branches, issues, and pull requests in this homelab repo,
create a fine-grained personal access token for resource owner `orriborri`,
limited to the `homelab` repository. Grant only these repository permissions:

- Contents: Read and write (create branches and push commits)
- Issues: Read and write
- Pull requests: Read and write

Metadata read access is granted automatically. Do not grant organization,
administration, actions, or workflow permissions. Set an expiration and rotate
the token as it expires.

Add the token as `GH_TOKEN` in `apps/hermes/secrets.yaml` using SOPS, then let
Flux reconcile the Secret. Stakater Reloader restarts the Deployment so Hermes
gets the new environment value. The Deployment's `envFrom` loads the SOPS
Secret; the example file is only a template. Do not put the token in chat or
commit it unencrypted. Verify setup from Hermes with `gh auth status` and
`gh repo view orriborri/homelab`.

## Read-only NAS access (prepared, not enabled)

`apps/hermes-bilder` is an opt-in overlay of the existing Hermes workload. It
mounts the existing SMB share `//192.168.1.244/Bilder` at `/mnt/nas/Bilder`.
Confirm that `Bilder` is the share name, rather than a directory inside another
share, before enabling it. For a nested directory, set `source` to the share and
`volumeAttributes.subDir` to the existing directory in `volume.yaml`.

The static PV uses `Retain`; it does not provision NAS directories. Its 1 GiB
capacity is binding metadata, not an allocation or quota. The CIFS mount, CSI
volume, PVC mount, and container mount are read-only. Files are presented to
Hermes's UID/GID 10000. The NAS password is passed only to the CSI driver, not
loaded into Hermes's environment or mounted in the container.

Prerequisites and activation:

1. Create a dedicated NAS account with **Read only** permission on `Bilder` and
   no access to other shares. Do not reuse the Synology CSI administrative account.
2. Use `apps/hermes-bilder/smb-credentials.yaml.example` as the schema for a
   SOPS-encrypted `apps/hermes-bilder/smb-credentials.yaml`. Follow
   [the SOPS guide](sops.md), and add only the encrypted file to the overlay's
   `resources`. Never commit the completed plaintext template.
3. Publish the SMB CSI source, infrastructure manifests, and registrations.
   Confirm the `csi-driver-smb` Flux Kustomization and HelmRelease are Ready and
   the node plugin is ready on every node. The chart is pinned to 1.20.4 and
   Windows support is disabled. Talos mount compatibility still needs live
   verification; do not change node configuration speculatively.
4. Change the existing `clusters/homelab/apps/hermes.yaml` path to
   `./apps/hermes-bilder`, keeping its SOPS decryption settings, and add
   `csi-driver-smb` to its `dependsOn`. Do not create a second Hermes Flux
   Kustomization or register both workload directories in `apps/kustomization.yaml`.
5. Render the overlay and cluster entrypoint locally, then publish the changes.
   Verify PVC binding, Hermes readiness, and that UID 10000 can list/read files.
   Confirm `/mnt/nas/Bilder` has `ro` mount flags. If checking rejection of a
   write syscall, use an exclusive-create probe with a unique name and require
   `EROFS`; never overwrite or delete an existing NAS file.

The normal Hermes Flux path remains `./apps/hermes` until these prerequisites
are met. The encrypted SMB Secret is registered in the overlay, but the overlay
is not active.

Live setup on 2026-11-16: the SMB HelmRelease and all three node plugins are Ready;
the static Bilder PVC is Bound. A separate test pod's mount attempt returned
`mount error(13): Permission denied`. Confirm the share name and the saved NAS
account's password, SMB access, and read-only permission on Bilder before retrying.
No NAS writes were attempted, and Hermes's deployment was not switched to the
NAS overlay.

Upstream: [SMB CSI driver 1.20.4 parameters](https://github.com/kubernetes-csi/csi-driver-smb/blob/v1.20.4/docs/driver-parameters.md).

## Dashboard credentials

Independent random dashboard and API credentials were generated and encrypted
with the public component of Flux's existing SOPS key. The temporary private
keyring used to obtain the public key was removed after encryption. No existing
cluster credentials were changed.

The initial username and password are in `/tmp/hermes-setup/dashboard-login.txt`
on the setup computer (mode `0600`). Save them in your password manager; this
temporary file is not a backup. Use [SOPS](sops.md) for future Secret edits.
`apps/hermes/secrets.yaml.example` documents the expected fields.

If the temporary login file is gone, a cluster administrator can recover the
dashboard password from the existing Secret:

```sh
kubectl --kubeconfig .talos-local/kubeconfig -n hermes get secret hermes-secrets -o go-template='{{index .data "HERMES_DASHBOARD_BASIC_AUTH_PASSWORD" | base64decode}}{{"\n"}}'
```

For rotations, generate independent random values for `API_SERVER_KEY`, the
dashboard password, and `HERMES_DASHBOARD_BASIC_AUTH_SECRET`, for example with
`openssl rand -hex 32`. The API key must be at least 16 characters.
For Telegram later, add `TELEGRAM_BOT_TOKEN` and an explicit
`TELEGRAM_ALLOWED_USERS` list of numeric user IDs; polling needs no public endpoint.

The real encrypted Secret is included in `apps/hermes/kustomization.yaml`; the
sample file is not. Local Kustomize rendering preserves ciphertext and must not
be applied directly to the cluster without decrypting the Secret. Flux decrypts
it with `flux-system/sops-gpg`. The Deployment requires `hermes-secrets`.

For later changes, use `sops apps/hermes/secrets.yaml`, let Flux reconcile, then
restart the Deployment to load changed environment variables. Hermes also stores
credentials edited in its dashboard or CLI in `/opt/data/.env`; values in that
file override the process environment. Avoid configuring the same key in both
places, and remove an obsolete persisted override before rotating a SOPS key.

## Choose a model

The active provider is OpenAI Codex and the configured model is `gpt-6-luna`.
The stored account credential returned a successful model response through the
Hermes CLI on 2026-11-15. Send a short dashboard message to verify the browser
chat flow as well.

### Connect a ChatGPT account for Codex models

Hermes has a built-in `openai-codex` provider. From the homelab workspace, run:

```sh
kubectl --kubeconfig .talos-local/kubeconfig -n hermes exec -it deployment/hermes -- hermes model
```

Choose **ChatGPT or Codex Subscription**, complete the browser/device-code
sign-in, and choose a model from the account's offered catalog. OpenAI requires
device-code authentication to be enabled in the personal account's security
settings or the managed workspace permissions when using that flow.

The installed release also supports an explicit headless OAuth login:

```sh
kubectl --kubeconfig .talos-local/kubeconfig -n hermes exec -it deployment/hermes -- hermes auth add openai-codex --type oauth --no-browser
```

Then use `hermes model` to select the provider and model. The profile's
credentials and model configuration remain on `/opt/data`, backed by the PVC.
After signing in, send a short dashboard message to verify actual model access;
successful login alone does not establish entitlement to every listed model.

This selects Codex models for Hermes's own agent loop. Using Codex CLI/app-server
as the coding runtime is a separate optional integration; it is not enabled here.

The init container copies this configuration only when `/opt/data/config.yaml`
does not exist. Thereafter the persistent copy is authoritative; ConfigMap updates
roll the pod but do not overwrite settings. Use `hermes config` or the dashboard
to change an existing installation. Do not delete the persistent configuration
to apply a routine change.

Validate locally:

```sh
kubectl kustomize apps/hermes > /tmp/hermes-rendered.yaml
kubectl kustomize clusters/homelab > /tmp/homelab-rendered.yaml
```

For Flux takeover, publish the Hermes files and both cluster registrations.
The root entrypoint currently lists apps individually; both it and
`clusters/homelab/apps/kustomization.yaml` register Hermes. Ensure the
`synology-csi` Flux Kustomization is registered and Ready first. The Hermes Flux
definition is enabled; the initial direct deployment does not create it against
a Git revision that lacks these files.

## Access and verify

```sh
kubectl --kubeconfig .talos-local/kubeconfig -n hermes get pods,pvc,service
kubectl --kubeconfig .talos-local/kubeconfig -n hermes port-forward service/hermes 9119:9119 --address=127.0.0.1
```

Open <https://hermes.orriborri.com> and sign in with the saved dashboard
credentials. The port-forward command above is an optional local fallback;
keep it bound to localhost. To check the login gate through the private ingress:

```sh
curl --fail --silent https://hermes.orriborri.com/api/status |
  python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["auth_required"] is True and "basic" in d["auth_providers"]; print("dashboard authentication enabled")'
```

The startup/liveness checks verify the gateway's `/health` response; readiness
checks the dashboard's `/api/status`. These prove the services are listening,
not that a provider key works. Send a short chat message after setup and verify
the chosen provider responds. For Telegram, verify your own account can chat and
an account outside the allowlist cannot. After a pod restart, confirm the
configuration and a test memory survive on the PVC.

Use `kubectl -n hermes exec -it deployment/hermes -- hermes setup` if interactive
setup is needed. The image's `hermes` shim drops the command to the runtime user.

### Reverse proxy settings

`dashboard.public_url` is `https://hermes.orriborri.com`. The existing persistent
configuration was updated without replacing other settings; its previous copy
is `/opt/data/config.before-hermes-hostname.yaml` on the PVC.

`dashboard.trusted_proxies` contains only the private ingress controller's
current pod IP, `10.244.1.33`. This lets Hermes recognize HTTPS and set Secure
session cookies. If that controller is replaced with a different pod IP, update
the exact address in `apps/hermes/config.yaml` and the persistent Hermes config,
then restart Hermes. Do not broaden this to all pod addresses just to avoid
maintaining the exact peer list.

### Initial live verification (2026-11-10)

- The 10 GiB iSCSI PVC is Bound and the replacement pod reached `1/1 Ready`.
- A pod replacement preserved a test workspace file and the exact configuration
  hash. The test marker was removed after verification.
- `/api/status` reported `auth_required: true` and the `basic` auth provider.
- Anonymous access redirected to sign-in. The generated credentials successfully
  authenticated via `/auth/password-login`; the dashboard HTML and application
  bundles returned HTTP 200. Browser automation was unavailable, so this was an
  HTTP login check rather than an interactive browser test.
- No model inference was tested because no provider is connected yet.

### Private hostname verification

- `hermes.orriborri.com` resolves through its DNS-only A record to the private
  ingress at `192.168.11.99`.
- `hermes-tls` is Ready with a valid Let's Encrypt certificate.
- HTTP redirects to HTTPS. Password login, dashboard HTML, and application
  bundles were verified through the normal HTTPS hostname.
- Authentication cookies use the `__Host-` prefix and Secure/HttpOnly flags.

### Chat setup verification (2026-11-15)

- The Hermes pod was `1/1 Running` with zero restarts, its PVC was Bound, and
  the Flux Kustomization reported Ready.
- A single CLI connectivity prompt returned `Hermes is ready.` with exit code
  zero, confirming inference through the configured provider.
- Browser chat and messaging-channel delivery remain unverified.

## State and recovery

Back up the complete Hermes data volume before image upgrades or configuration
migrations. For a consistent file backup, stop the Deployment first so SQLite
and its sidecars are captured together. Synology `Retain` preserves a released
volume but is not a backup. Reverting the image does not reverse data migrations.

## Upstream references

- [Hermes v0.23.1](https://github.com/NousResearch/hermes-agent/releases/tag/v0.23.1)
- [Configuration at v0.23.1](https://github.com/NousResearch/hermes-agent/blob/v0.23.1/cli-config.yaml.example)
- [Docker runtime](https://hermes-agent.nousresearch.com/docs/user-guide/docker)
- [Dashboard authentication](https://hermes-agent.nousresearch.com/docs/user-guide/features/web-dashboard)
- [Telegram setup](https://hermes-agent.nousresearch.com/docs/user-guide/messaging/telegram)
- [Hermes model providers](https://hermes-agent.nousresearch.com/docs/integrations/providers)
- [OpenAI headless authentication](https://learn.chatgpt.com/docs/auth#login-on-headless-devices)
- [Agent Sandbox Hermes example](https://agent-sandbox.sigs.k8s.io/docs/use-cases/examples/hermes-agent/)

The Agent Sandbox example uses a `Sandbox` CRD and requires its controller. Its
sample manifest does not select a gVisor or Kata runtime. Adopting that lifecycle
controller is a separate migration that must preserve the existing 10 GiB data
volume and dashboard authentication; it does not change this private hostname.
