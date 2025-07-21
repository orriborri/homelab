# AWS Q Instructions for Homelab App Configuration Generation

## Overview
This document provides Amazon Q with the necessary context and patterns to generate proper Kubernetes application configurations for the homelab cluster running on Talos Linux with Flux CD GitOps.

## Cluster Architecture Context

### Infrastructure Stack
- **Kubernetes**: Running on Talos Linux VMs in Proxmox VE
- **GitOps**: Flux CD reconciling from Git repository
- **Ingress**: ingress-nginx with cert-manager for Let's Encrypt certificates
- **Storage**: 
  - `syno-storage` StorageClass for Synology NAS via synology-csi
  - `nfs-client` StorageClass for NFS mounts
- **Load Balancing**: MetalLB for LoadBalancer services
- **DNS**: external-dns with Cloudflare integration
- **Monitoring**: kube-prometheus-stack (Prometheus, Grafana, AlertManager)

### Configuration Substitution System
The cluster uses Flux's postBuild substitution feature with:
- **ConfigMap**: `cluster-config` in `flux-system` namespace
- **Secret**: `cluster-secrets` in `flux-system` namespace (SOPS encrypted)

Available substitution variables:
```yaml
# From cluster-config
${LETSENCRYPT_CLUSTER_ISSUER}  # Current: letsencrypt-prod

# From cluster-secrets (encrypted)
${PODINFO_DOMAIN_NAME}
${EXTERNAL_DNS_CLOUDFLARE_API_TOKEN}
${CLOUDFLARE_EMAIL}
${LETSENCRYPT_EMAIL}
${FLUX_NOTIFICATION_DOMAIN_NAME}
```

## Standard App Configuration Pattern

### Directory Structure
```
apps/
├── <app-name>/
│   ├── kustomization.yaml
│   └── release.yaml
└── ...
```

### 1. Flux Kustomization File Template
**File**: `clusters/homelab/apps/<app-name>.yaml`
```yaml
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: <app-name>
spec:
  interval: 1h
  timeout: 5m
  retryInterval: 10s
  sourceRef:
    kind: GitRepository
    name: flux-system
  path: ./apps/<app-name>
  prune: true
  wait: true
  dependsOn:
    - name: synology-csi  # For apps requiring persistent storage
    # - name: metallb     # For apps requiring LoadBalancer
    # - name: cert-manager # For apps requiring TLS certificates
  decryption:
    provider: sops
    secretRef:
      name: sops-gpg
  postBuild:
    substitute: {}
    substituteFrom:
      - kind: ConfigMap
        name: cluster-config
      - kind: Secret
        name: cluster-secrets
```

### 2. App Kustomization File Template
**File**: `apps/<app-name>/kustomization.yaml`
```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - release.yaml
```

### 3. Application Release Template
**File**: `apps/<app-name>/release.yaml`

#### For Simple Deployments:
```yaml
---
# Persistent Volume Claim (if needed)
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: <app-name>-data
  namespace: default
spec:
  storageClassName: syno-storage  # or nfs-client
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: <size>Gi

---
# Service
apiVersion: v1
kind: Service
metadata:
  name: <app-name>
  namespace: default
spec:
  type: ClusterIP  # or LoadBalancer for external access
  selector:
    app: <app-name>
  ports:
    - name: http
      protocol: TCP
      port: 80
      targetPort: <container-port>

---
# Ingress (for web applications)
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: <app-name>-ingress
  namespace: default
  annotations:
    cert-manager.io/cluster-issuer: ${LETSENCRYPT_CLUSTER_ISSUER}
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - <app-name>.orriborri.com
      secretName: <app-name>-tls
  rules:
    - host: <app-name>.orriborri.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: <app-name>
                port:
                  number: 80

---
# Deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: <app-name>
  namespace: default
spec:
  replicas: 1
  strategy:
    type: Recreate  # Use for apps with persistent storage
  selector:
    matchLabels:
      app: <app-name>
  template:
    metadata:
      labels:
        app: <app-name>
    spec:
      containers:
        - name: <app-name>
          image: <docker-image>:<tag>
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: <port>
          env:
            # Environment variables here
            - name: EXAMPLE_VAR
              value: "example-value"
          volumeMounts:
            - name: <app-name>-data
              mountPath: <mount-path>
          resources:
            requests:
              cpu: 100m
              memory: 128Mi
            limits:
              cpu: 500m
              memory: 512Mi
          livenessProbe:
            httpGet:
              path: /
              port: <port>
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /
              port: <port>
            initialDelaySeconds: 5
            periodSeconds: 5
      volumes:
        - name: <app-name>-data
          persistentVolumeClaim:
            claimName: <app-name>-data
```

## Security Best Practices

### Resource Limits
Always set resource requests and limits:
```yaml
resources:
  requests:
    cpu: 100m
    memory: 128Mi
  limits:
    cpu: 500m
    memory: 512Mi
```

### Security Context
```yaml
securityContext:
  runAsNonRoot: true
  runAsUser: 1000
  fsGroup: 1000
containers:
  - name: <app-name>
    securityContext:
      allowPrivilegeEscalation: false
      capabilities:
        drop:
          - ALL
```

## Storage Guidelines

### Storage Classes Available:
- **syno-storage**: Synology NAS CSI (recommended for databases, persistent data)
- **nfs-client**: NFS subdir provisioner (for shared storage)

### Storage Sizing Guidelines:
- **Small apps**: 1-5Gi
- **Media apps**: 10-50Gi
- **Databases**: 5-20Gi
- **File storage**: 50Gi+

## Troubleshooting Common Issues

### Image Version Selection
- Prefer stable/LTS versions over `latest` or `edge`
- Pin to specific versions for reproducibility
- Example: `actualbudget/actual-server:24.12.0` instead of `:edge`

### Port Configuration
- Ensure container ports match service targetPort
- Validate port numbers are within valid range (0-65535)
- Check for port conflicts

## Adding New Apps Workflow

1. **Create app directory**: `apps/<app-name>/`
2. **Create kustomization.yaml** in app directory
3. **Create release.yaml** with app resources
4. **Create Flux kustomization**: `clusters/homelab/apps/<app-name>.yaml`
5. **Add to main kustomization**: Update `clusters/homelab/apps/kustomization.yaml`
6. **Commit and push** to trigger Flux reconciliation
7. **Monitor deployment**: Use `flux get all -A` and `kubectl get pods -A`

## Validation Checklist

Before deploying any new app configuration:

- [ ] Resource limits are set appropriately
- [ ] Storage requirements are specified correctly
- [ ] Ingress hostname follows pattern: `<app-name>.orriborri.com`
- [ ] TLS certificate configuration is included
- [ ] Health checks are configured
- [ ] Security contexts are applied
- [ ] Dependencies are listed in Flux kustomization
- [ ] Image version is pinned (not `latest`)
- [ ] Environment variables are properly configured
- [ ] Volume mounts match PVC claims
