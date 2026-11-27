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

When adding a workload, register its manifests in its local Kustomization, put its Flux definition in `clusters/homelab/apps/<app>.yaml`, and list that file in `clusters/homelab/kustomization.yaml`. That entrypoint is what Flux reads; `scripts/check-flux-registration.sh` fails CI when a definition is missing from it.

## Build, Test, and Development Commands

- `nix-shell`: load the tools declared in `default.nix`, including kubectl, Flux, Helm, SOPS, and pre-commit.
- Agents: `kubectl`, `flux`, `talosctl` etc. are not on the default PATH. Run them through nix, e.g. `NIX_PATH=nixpkgs=flake:nixpkgs nix-shell --run 'kubectl get pods -A'` from the repo root (it picks up `./kubeconfig`). Without `NIX_PATH` every call prints a harmless `<nixpkgs>` not-found `error:` trace. Keep cluster access read-only unless asked.
- `pre-commit install`: install the configured commit and commit-message hooks.
- `pre-commit run --all-files`: run the configured secret checks.
- `kubectl kustomize apps/<app>`: render a workload locally; repeat for changed infrastructure directories.
- `kubectl kustomize clusters/homelab`: check the cluster entrypoint renders.
- `flux get all -A` and `kubectl get pods -A`: inspect reconciliation and runtime health on the configured cluster.

Manifests have no local build or development server; Flux deploys the committed ones. Apps with source are built into images by the `<app>-image` workflows. Pin the result in the app's `deployment.yaml` as `ghcr.io/...:<sha>@sha256:<digest>`; the workflow log prints the digest.

## Coding Style & Naming Conventions

Use two-space YAML indentation and preserve nearby formatting. Prefer lowercase, hyphenated Kubernetes names and descriptive filenames such as `deployment.yaml`, `service.yaml`, and `release.yaml`. Keep shared substitution keys uppercase, referenced as `${CONFIG_KEY}`. Follow existing Flux dependency and SOPS decryption patterns. No dedicated formatting or YAML lint hook is configured.

## Testing Guidelines

Apps with source code (`apps/baby-monitor`, `apps/grocy-stocker`) have `npm test`, run on pull requests by the `app-tests` workflow. Manifests have no test framework or coverage target. Validate every changed Kustomization and review rendered resources, namespaces, storage settings, and substitutions. Local rendering does not perform Flux post-build substitution or SOPS decryption. For deployed changes, record Flux readiness and pod health; diagnostic manifests live in `debug/`.

## Commit & Pull Request Guidelines

Use Conventional Commits, enforced by the commit-message hook: `feat(sparkyfitness): add deployment manifests` or `chore(deps): update image tag`. History also contains legacy free-form messages. Keep changes focused. PR descriptions should explain affected workloads, configuration prerequisites, validation performed, and operational impact; link relevant issues.

This repository is a fork of `FruitieX/homelab`: open pull requests with `gh pr create --repo orriborri/homelab`, since the default base is the upstream. The working tree often carries unrelated uncommitted edits, so branch from `origin/main` with `git worktree add <dir> -b <branch> origin/main` instead of `git checkout`.

## Security & Configuration

Edit secrets with `sops path/to/secrets.yaml`; commit encrypted values only. Keep credentials, kubeconfig, and `.envrc` local. Consult `docs/sops.md` before changing encryption. Review maintenance scripts before running them because some reset or modify live cluster resources.

## Agent skills

### Issue tracker

Track issues and specs in GitHub Issues for `orriborri/homelab`.
Read `docs/agents/issue-tracker.md` before working with tickets.

### Triage labels

Use the five canonical triage labels.
Read `docs/agents/triage-labels.md` before triaging issues.

### PR review

Read `docs/agents/pr-review.md` before going through open PRs.

### Domain docs

Use a single-context layout: root `GLOSSARY.md` and `docs/adr/`.
Read `docs/agents/domain.md` before exploring the repository.
