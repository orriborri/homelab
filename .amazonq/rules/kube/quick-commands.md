# Quick Reference Commands

## Environment Setup
```bash
# Source environment variables
source .envrc

# Enter nix shell with tools
nix-shell
```

## Cluster Status
```bash
# Node status
kubectl get nodes -o wide

# All pods
kubectl get pods -A

# Flux status
flux get all -A

# Events with warnings
kubectl get events -A --field-selector type=Warning
```

## Common Troubleshooting
```bash
# Flux logs
flux logs --tail 20 -f

# Talos node health
talosctl health --nodes $CONTROL_PLANE_IP

# Force reconcile
flux reconcile source git flux-system
```

## SOPS Operations
```bash
# Encrypt secrets
sops --encrypt --in-place clusters/homelab/cluster-secrets.yaml

# Edit encrypted file
sops clusters/homelab/cluster-secrets.yaml
```
