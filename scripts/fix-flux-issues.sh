#!/bin/bash
set -e

echo "=== Flux Recovery Workflow ==="

echo "Step 1: Reconciling Git source..."
flux reconcile source git flux-system --with-source

echo -e "\nStep 2: Waiting for Git sync (5 seconds)..."
sleep 5

echo -e "\nStep 3: Checking Git revision..."
flux get sources git

echo -e "\nStep 4: Reconciling flux-system..."
flux reconcile kustomization flux-system

echo -e "\nStep 5: Reconciling NFS provisioner..."
flux reconcile kustomization nfs-subdir-external-provisioner

echo -e "\nStep 6: Forcing metrics-server reinstall..."
kubectl delete helmrelease metrics-server -n kube-system --wait=false --ignore-not-found=true
sleep 2
flux reconcile kustomization metrics-server

echo -e "\nStep 7: Forcing grafana reinstall..."
kubectl delete helmrelease grafana -n grafana --wait=false --ignore-not-found=true
sleep 2
flux reconcile kustomization grafana

echo -e "\n=== Current Status ==="
flux get kustomizations | grep -E "NAME|nfs-subdir|metrics|grafana|cert-manager"

echo -e "\n=== HelmRelease Status ==="
flux get helmreleases -A | grep -E "NAMESPACE|metrics-server|grafana|nfs-subdir"

echo -e "\n=== Monitoring progress (Ctrl+C to stop) ==="
flux get kustomizations --watch
