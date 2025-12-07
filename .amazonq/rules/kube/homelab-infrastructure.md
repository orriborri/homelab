# Homelab Infrastructure Rules

## Network & Load Balancing
- **MetalLB**: Provides LoadBalancer services with IP pool allocation
- **ingress-nginx**: Handles HTTP/HTTPS ingress with SSL termination
- **external-dns**: Automatically manages DNS records for services

## Storage
- **nfs-subdir-external-provisioner**: Dynamic NFS volume provisioning
- **synology-csi**: Synology NAS integration for persistent volumes

## Security & Certificates
- **cert-manager**: Automatic Let's Encrypt certificate management
- Use `letsencrypt-staging` for testing, `letsencrypt-prod` for production
- Rate limits apply - be careful with production certificates

## Monitoring
- **kube-prometheus-stack**: Comprehensive monitoring with Prometheus & Grafana
- Access Grafana dashboards through ingress
- Custom metrics and alerts configured via ServiceMonitor CRDs

## Configuration Management
- Cluster config: `/clusters/homelab/cluster-config.yaml`
- Secrets: `/clusters/homelab/cluster-secrets.yaml` (SOPS encrypted)
- Infrastructure: `/clusters/homelab/infrastructure/`
- Applications: `/clusters/homelab/apps/`
