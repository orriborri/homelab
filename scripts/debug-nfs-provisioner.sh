#!/bin/bash

echo "=== Checking NFS Provisioner manifests for variable issues ==="

# Find all YAML files in the NFS provisioner directory
find /home/orre/homelab/infrastructure/storage/nfs-subdir-external-provisioner -name "*.yaml" -o -name "*.yml" | while read file; do
    echo "Checking: $file"
    
    # Look for any $ characters
    grep -n '\$' "$file" || echo "  No variables found"
    
    # Look for common malformed patterns
    grep -n '\${}' "$file" && echo "  WARNING: Empty variable found!"
    grep -n '\$[^{]' "$file" && echo "  WARNING: Unescaped $ found!"
    grep -n '\${[^}]*[^A-Za-z0-9_}]' "$file" && echo "  WARNING: Invalid variable name!"
    
    echo ""
done

echo "=== Checking cluster-config ConfigMap ==="
kubectl get configmap cluster-config -n flux-system -o yaml | grep -v "creationTimestamp\|resourceVersion\|uid"

echo "=== Checking cluster-secrets Secret (names only) ==="
kubectl get secret cluster-secrets -n flux-system -o jsonpath='{.data}' | jq -r 'keys[]'
