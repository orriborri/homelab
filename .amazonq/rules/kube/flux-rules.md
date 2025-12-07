# Flux CD Rules

## GitOps Workflow
- All changes should be made through git commits to maintain GitOps principles
- Use `flux reconcile` to force immediate reconciliation when needed
- Check reconciliation status with `flux get all -A`

## Common Commands
- Bootstrap: `flux bootstrap github --owner=${GITHUB_USER} --repository=homelab --personal --path=clusters/homelab`
- Status: `flux get all -A`
- Logs: `flux logs --tail 20 -f`
- Force reconcile: `flux reconcile source git flux-system`

## Secrets Management
- Use SOPS for encrypting secrets: `sops --encrypt --in-place <file.yaml>`
- Edit encrypted files: `sops <file.yaml>`
- GPG key fingerprint stored in: `$SOPS_PGP_FP`

## Troubleshooting
- Check Flux components: `kubectl get pods -n flux-system`
- View reconciliation errors: `flux get all -A | grep -i false`
- Check source status: `flux get sources all -A`
