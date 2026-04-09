# Repository Guidelines

## Project Structure & Module Organization
Configuration is declarative and tracked per cluster. `clusters/homelab/` holds the root `kustomization.yaml`, shared values in `cluster-config.yaml`, and encrypted secrets in `cluster-secrets.yaml`; apply-wide patches live under `infrastructure/`, while workload overlays under `apps/` mirror the services exposed in `apps/` at the repo root. Talos- and kube-related artifacts (`talosconfig`, `kubeconfig`, `_out/`) are generated and should not be hand-edited. Use `docs/` for operational notes and `scripts/` for helper automation.

## Build, Test, and Development Commands
- `nix-shell`: loads the pinned Kubernetes/Talos tooling defined in `default.nix`.
- `source .envrc`: exports `TALOSCONFIG`, `KUBECONFIG`, GitHub, and SOPS variables for every subsequent command.
- `talosctl gen config homelab-cluster https://$CONTROL_PLANE_IP:6443 --output-dir _out --config-patch @talos-machine-patch.yaml`: regenerates machine configs whenever control-plane addressing or Talos patches change.
- `kubectl kustomize clusters/homelab/apps`: renders the full app stack for quick inspection or piping into validation tools.
- `flux reconcile kustomization flux-system --with-source --kubeconfig ./kubeconfig`: forces Flux to pull and apply the latest manifests after a merge.

## Coding Style & Naming Conventions
Favor Kubernetes-native YAML with two-space indentation, list items aligned, and comments kept minimal and actionable. Directory names stay lower-hyphen-case (`apps/steam-lancache`, `clusters/homelab/flux-system`). Kustomization names must match their folder to keep Flux diffs readable. Keys in `cluster-config.yaml` and file-scoped patches should be upper snake case (`LETSENCRYPT_CLUSTER_ISSUER`). Never commit decrypted secrets—encrypt via SOPS, and suffix new secret files with `.yaml` placed beside their consuming kustomization.

## Testing Guidelines
Preflight changes locally before opening a PR: `kubectl apply --server-side --dry-run=client -k clusters/homelab/infrastructure` to confirm schema validity, then `kubectl kustomize clusters/homelab/apps | flux diff kustomization apps --kubeconfig ./kubeconfig` (adjust target as needed) to preview what Flux will modify. After deploying, run `flux get kustomizations -n flux-system` to check reconcilers and look for drift. Maintain practical coverage by adding smoke tests or health probes for each workload, and document manual validation steps in `docs/`.

## Commit & Pull Request Guidelines
Recent history (`Add TLS certificates for both domains`, `Fix nginx config for /portfolio path`) shows the preferred style: short, imperative subjects under 70 characters. Each PR should link to any tracked issue, summarize what changed, and note operational follow-ups (e.g., “requires `sops` re-encryption” or “run `flux reconcile`”). Include screenshots or command output when touching ingress, dashboards, or other user-facing resources so reviewers can confirm before applying.

## Secrets & Configuration Tips
Keep shared config in `cluster-config.yaml` and reference via `${CONFIG_KEY}`. Sensitive variants belong in `cluster-secrets.yaml`; edit with `sops clusters/homelab/cluster-secrets.yaml` and re-encrypt using `sops --encrypt --in-place`. When rotating credentials, commit the encrypted file plus any Talos patch updates and note the rotation procedure in the PR to help other operators reproduce it.
