#!/bin/bash
set -e

echo "=== Force Reset Stuck HelmReleases ===" echo ""

# Function to force delete a HelmRelease
force_delete_helmrelease() {
    local name=$1
    local namespace=$2
    
    echo "Processing $name in namespace $namespace..."
    
    # Suspend to stop reconciliation
    flux suspend helmrelease $name -n $namespace 2>/dev/null || true
    
    # Remove finalizers to allow deletion
    kubectl -n $namespace patch helmrelease $name \
        -p '{"metadata":{"finalizers":[]}}' \
        --type=merge 2>/dev/null || true
    
    # Force delete
    kubectl delete helmrelease $name -n $namespace \
        --force --grace-period=0 2>/dev/null || true
    
    # Also delete the Helm release itself
    helm uninstall $name -n $namespace 2>/dev/null || true
    
    echo "  Deleted $name"
}

# Delete stuck HelmReleases
force_delete_helmrelease "metrics-server" "kube-system"
force_delete_helmrelease "grafana" "grafana"
force_delete_helmrelease "home-assistant" "default"

echo ""
echo "Waiting 5 seconds for cleanup..."
sleep 5

echo ""
echo "=== Reconciling Kustomizations to recreate HelmReleases ==="
flux reconcile kustomization metrics-server
flux reconcile kustomization grafana
flux reconcile kustomization homeassistant

echo ""
echo "=== Watching HelmRelease status ==="
flux get helmreleases -A --watch
