#!/bin/bash
set -e

echo "=== Committing Flux Fixes ==="

# Add all changed files
git add -A

# Show what will be committed
echo -e "\nFiles to be committed:"
git status --short

echo -e "\nCommit message:"
cat << 'EOF'
fix: resolve flux reconciliation issues

- Complete NFS provisioner HelmRelease structure
- Update metrics-server chart version to 3.13.0
- Increase timeouts for metrics-server and grafana to 10m
- Disable image-automation (directory doesn't exist)
- Add cluster-config.yaml with NFS_SERVER and NFS_PATH variables
- Add helper scripts for flux recovery and helmrelease reset
EOF

echo -e "\n"
read -p "Proceed with commit? (y/N) " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
    git commit -m "fix: resolve flux reconciliation issues

- Complete NFS provisioner HelmRelease structure
- Update metrics-server chart version to 3.13.0
- Increase timeouts for metrics-server and grafana to 10m
- Disable image-automation (directory doesn't exist)
- Add cluster-config.yaml with NFS_SERVER and NFS_PATH variables
- Add helper scripts for flux recovery and helmrelease reset"
    
    echo -e "\nCommit created. Push with: git push"
else
    echo "Commit cancelled"
fi
