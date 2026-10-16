# Repository Guidelines

## Project Structure & Module Organization

This repository defines a Talos Kubernetes homelab through Flux GitOps.

- `apps/<app>/`: workload manifests, Helm releases, and local `kustomization.yaml` files.
- `infrastructure/`: networking, storage, monitoring, sources, and shared controllers.
- `clusters/homelab/`: Flux entrypoint, application/infrastructure reconciliation definitions, shared configuration, and encrypted secrets.
- `clusters/homelab/flux-system/`: Flux bootstrap manifests; `gotk-components.yaml` is maintained by the update workflow.
- `docs/`: configuration and operational guides, plus documentation images.
- `scripts/` and `debug/`: maintenance helpers and diagnostic manifests.
- Root Talos YAML files: node configuration and machine patches.

When adding a workload, register its manifests in its local Kustomization and its Flux definition in `clusters/homelab/apps/kustomization.yaml`.

## Build, Test, and Development Commands

- `nix-shell`: load the tools declared in `default.nix`, including kubectl, Flux, Helm, SOPS, and pre-commit.
- `pre-commit install`: install the configured commit and commit-message hooks.
- `pre-commit run --all-files`: run the configured secret checks.
- `kubectl kustomize apps/<app>`: render a workload locally; repeat for changed infrastructure directories.
- `kubectl kustomize clusters/homelab`: check the cluster entrypoint renders.
- `flux get all -A` and `kubectl get pods -A`: inspect reconciliation and runtime health on the configured cluster.

There is no application build or local development server; Flux deploys the committed manifests.

## Coding Style & Naming Conventions

Use two-space YAML indentation and preserve nearby formatting. Prefer lowercase, hyphenated Kubernetes names and descriptive filenames such as `deployment.yaml`, `service.yaml`, and `release.yaml`. Keep shared substitution keys uppercase, referenced as `${CONFIG_KEY}`. Follow existing Flux dependency and SOPS decryption patterns. No dedicated formatting or YAML lint hook is configured.

## Testing Guidelines

There is no automated unit-test framework or coverage target. Validate every changed Kustomization and review rendered resources, namespaces, storage settings, and substitutions. Local rendering does not perform Flux post-build substitution or SOPS decryption. For deployed changes, record Flux readiness and pod health; diagnostic manifests live in `debug/`.

## Commit & Pull Request Guidelines

Use Conventional Commits, enforced by the commit-message hook: `feat(sparkyfitness): add deployment manifests` or `chore(deps): update image tag`. History also contains legacy free-form messages. Keep changes focused. PR descriptions should explain affected workloads, configuration prerequisites, validation performed, and operational impact; link relevant issues.

## Security & Configuration

Edit secrets with `sops path/to/secrets.yaml`; commit encrypted values only. Keep credentials, kubeconfig, and `.envrc` local. Consult `docs/sops.md` before changing encryption. Review maintenance scripts before running them because some reset or modify live cluster resources.

## Agent skills

### Issue tracker

Track issues and specs in GitHub Issues for `orriborri/homelab`.
Read `docs/agents/issue-tracker.md` before working with tickets.

### Triage labels

Use the five canonical triage labels.
Read `docs/agents/triage-labels.md` before triaging issues.

### Domain docs

Use a single-context layout: root `GLOSSARY.md` and `docs/adr/`.
Read `docs/agents/domain.md` before exploring the repository.
