# GitHub Copilot Instructions for Homelab

This repository contains a Kubernetes-based homelab with specific patterns and conventions. Please follow these guidelines when suggesting code.

## PostgreSQL Pattern

### ❌ DO NOT create separate PostgreSQL deployments
- This homelab uses ONE shared PostgreSQL instance for all applications
- The service name is `postgres` in the `default` namespace
- Each application gets its own database within the shared instance

### ✅ DO use the shared PostgreSQL pattern:

```yaml
# In application deployment.yaml:
env:
  # Always use shared postgres-config secret
  - name: DB_USER
    valueFrom:
      secretKeyRef:
        name: postgres-config
        key: POSTGRES_USER
  - name: DB_PASSWORD
    valueFrom:
      secretKeyRef:
        name: postgres-config
        key: POSTGRES_PASSWORD
  # Application-specific database configuration
  - name: DB_HOST
    value: "postgres"  # Always points to shared service
  - name: DB_PORT
    value: "5432"
  - name: DB_NAME
    value: "myapp_database"  # Unique database name per app
```

### Database naming convention:
- Use format: `{appname}_database` (e.g., `pinepods_database`, `penpot_database`)
- Each app gets its own isolated database
- Never create separate PostgreSQL deployments

## Storage Patterns

### Use Synology CSI storage class:
```yaml
spec:
  storageClassName: syno-storage
  accessModes:
    - ReadWriteMany  # For shared storage
    - ReadWriteOnce  # For database storage
```

## Ingress Patterns

### Use consistent ingress configuration:
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: app-ingress
  namespace: default
spec:
  ingressClassName: public  # or private for internal services
  tls:
    - secretName: orriborri-com-tls
  rules:
    - host: myapp.orriborri.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: myapp-service
                port:
                  number: 80
```

## Resource Management

### Standard resource limits:
```yaml
resources:
  requests:
    cpu: 100m
    memory: 256Mi
  limits:
    cpu: 500m
    memory: 1Gi
```

## File Organization

### Required files for each app:
- `kustomization.yaml` - Lists all resources
- `deployment.yaml` or separate deployment files
- `service.yaml` - Kubernetes services
- `ingress.yaml` - Web access configuration
- `persistentVolumes.yaml` - Storage claims
- `secrets.yaml` - Application secrets (encrypted with SOPS)

### Kustomization structure:
```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - persistentVolumes.yaml
  - deployment.yaml
  - service.yaml
  - ingress.yaml
```

## Security Patterns

### Secrets management:
- Use SOPS for encrypting secrets
- Reference existing `postgres-config` for database credentials
- Create app-specific secrets for application configuration
- Never hardcode passwords in deployments

## Flux CD Integration

### To enable an app in the cluster:
1. Create `/clusters/homelab/apps/{appname}.yaml`:
```yaml
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: appname
spec:
  interval: 1h
  timeout: 5m
  retryInterval: 10s
  sourceRef:
    kind: GitRepository
    name: flux-system
  path: ./apps/appname
  prune: true
  wait: true
  dependsOn:
    - name: synology-csi  # For apps needing storage
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

2. Add to `/clusters/homelab/apps/kustomization.yaml`:
```yaml
resources:
  - appname.yaml
```

## Common Mistakes to Avoid

1. ❌ Creating separate PostgreSQL deployments
2. ❌ Using different storage classes
3. ❌ Hardcoding database credentials
4. ❌ Not using proper resource limits
5. ❌ Inconsistent naming conventions
6. ❌ Missing health checks in deployments

## Health Checks

### Standard health check patterns:
```yaml
livenessProbe:
  httpGet:
    path: /
    port: 8080
  initialDelaySeconds: 30
  periodSeconds: 30
readinessProbe:
  httpGet:
    path: /
    port: 8080
  initialDelaySeconds: 10
  periodSeconds: 10
```

When suggesting code for this homelab, always follow these patterns and conventions.
