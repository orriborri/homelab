#!/bin/bash

echo "=== Checking for required NFS variables ==="

# Check cluster-config ConfigMap
echo "Cluster Config:"
kubectl get configmap cluster-config -n flux-system -o jsonpath='{.data}' | jq -r 'to_entries[] | select(.key | contains("NFS")) | "\(.key): \(.value)"'

# Check cluster-secrets Secret
echo -e "\nCluster Secrets (variable names only):"
kubectl get secret cluster-secrets -n flux-system -o jsonpath='{.data}' | jq -r 'keys[] | select(contains("NFS"))'

echo -e "\n=== Testing variable substitution locally ==="
export NFS_SERVER="${NFS_SERVER:-192.168.1.100}"  # Replace with your NAS IP
export NFS_PATH="${NFS_PATH:-/volume1/kubernetes}"  # Replace with your NFS path

cat /home/orre/homelab/infrastructure/storage/nfs-subdir-external-provisioner/nfs-subdir-external-provisioner.yaml | envsubst
