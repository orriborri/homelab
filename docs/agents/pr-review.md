# PR review workflow

Use when asked to "go through the PRs". Merging to `main` deploys to the live
cluster through Flux, so merge only what the user asked for.

## Loop (per open PR)

1. List: `gh pr list --json number,title,headRefName,mergeable,statusCheckRollup`.
2. Read the diff: `gh pr diff <n>`. Render changed dirs locally:
   `NIX_PATH=nixpkgs=flake:nixpkgs nix-shell --run 'kubectl kustomize <dir>'`.
3. Checks: `gh pr checks <n>`. If red, read the log
   (`gh run view <run> --log-failed`), fix the root cause on the PR branch in a
   worktree (`git worktree add /tmp/pr-<n> <branch>`), push, and re-check.
   Never skip hooks or loosen a check to get green.
4. Behind or conflicting: rebase onto `origin/main`; keep main's side for
   unrelated lines.
5. Risk pass (below). Mitigate in the PR, or flag it and stop.
6. Merge only when checks are green, risks are mitigated, and the user allowed
   it: `gh pr merge <n> --merge --delete-branch`. Then watch
   `flux get kustomizations -A` and the affected pods.

## Risk checklist

| Change | Mitigation |
|---|---|
| Major version bump (postgres, node, ubuntu) | Check release notes; stateful data needs a backup/migration plan, otherwise leave open and say why. |
| New or renamed PVC / `claimName` | Data does not move. Copy it first or keep the old claim; flag it. |
| Secrets, `talosconfig`, kubeconfig, age keys | Never commit plaintext. Secrets stay SOPS-encrypted. |
| New workload not registered in `clusters/homelab/apps/kustomization.yaml` | Intentional? Say so in the PR. |
| Image tag/digest changes | Pinned tag, not `latest`; matching CI image build exists. |
| Ingress, DNS, network policy, Talos config | Could cut access to the cluster; confirm a rollback path. |
| Shared infra (monitoring, storage, cert-manager) | Render all dependents; merge alone, not bundled. |

## Report

Per PR: checks status, fixes pushed, risks found and how mitigated, merged or
left open (and why). State what was not verified on the live cluster.
