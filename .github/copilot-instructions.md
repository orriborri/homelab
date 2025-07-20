# GitHub Copilot Instructions for Homelab

This repository contains a Kubernetes-based homelab with specific patterns and conventions. Please follow these guidelines when suggesting code.

## Architecture Overview

This homelab runs on **Proxmox VE** virtualization platform with **Talos Linux** VMs forming a **Kubernetes** cluster. Key architectural decisions:

- **Single compute node** (Minisforum UM580) running multiple Talos VMs
- **Synology DS420+ NAS** for persistent storage via iSCSI/NFS
- **GitOps with Flux CD** - all changes deployed via Git commits
- **Two-layer structure**: `/apps/{name}/` (manifests) + `/clusters/homelab/apps/{name}.yaml` (Flux Kustomizations)
- **Shared services**: One PostgreSQL instance, one MQTT broker for all apps
- **Domain-based routing**: `{app}.orriborri.com` with automatic SSL via Let's Encrypt

## Development Environment

This project uses **Nix** for reproducible development environments:

```bash
# Enter development shell with all tools
nix-shell

# Or with direnv (automatic activation)
echo "use nix" > .envrc && direnv allow
```

### Essential Tools Available:
- `kubectl`, `flux`, `talosctl` - Cluster management
- `sops` - Secret encryption/decryption  
- `k9s` - Interactive cluster browser
- `flux-operator-mcp` - AI-assisted GitOps via MCP server

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

## MQTT Integration Pattern

Many IoT applications use the **shared MQTT broker** (`mosquitto` service):

```yaml
# Standard MQTT service discovery
env:
  - name: MQTT_HOST
    value: "mqtt"  # Always points to shared mosquitto service
  - name: MQTT_PORT  
    value: "1883"

# Wait for MQTT broker pattern
initContainers:
  - name: wait-for-mqtt-broker
    image: busybox
    command: ["sh", "-c", "until nc -z mqtt 1883; do echo waiting for mqtt broker; sleep 1; done"]
```

### MQTT Apps Pattern:
- Apps like `hue-mqtt`, `lifx-mqtt`, `tuya-mqtt` bridge smart home devices to MQTT
- Use `secret.reloader.stakater.com/reload` annotation for config reloading
- Each app gets its own encrypted config via SOPS


#### AI-Assisted Operations
With MCP Server, you can use natural language for complex GitOps tasks:

```bash
# Health Assessment
"Analyze the Flux installation and report status of all components"

# Pipeline Visualization  
"List Flux Kustomizations and draw a Mermaid diagram for dependencies"

# Root Cause Analysis
"Perform root cause analysis of the last failed Helm release"

# GitOps Operations
"Resume all suspended Flux resources and verify their status"

# Cross-Cluster Comparisons
"Compare the podinfo HelmRelease between production and staging"

# Kubernetes Operations
"Create namespace test, copy podinfo Helm release, change ingress to test.podinfo.com"
```

#### Security Features
- Operates with existing kubeconfig permissions
- Supports service account impersonation for limited access
- Masks sensitive information in Kubernetes Secret values
- Provides read-only mode for observation without cluster changes

### GitOps Workflow Commands
Use these Flux CLI commands for AI-assisted GitOps workflows:

```bash
# Check Flux system status
flux get all

# Get Kustomization status
flux get kustomizations

# Get source status (Git repositories)
flux get sources git

# Reconcile a specific Kustomization
flux reconcile kustomization {appname}

# Force reconciliation of Git source
flux reconcile source git flux-system

# Suspend a Kustomization (for maintenance)
flux suspend kustomization {appname}

# Resume a suspended Kustomization
flux resume kustomization {appname}

# Check logs for a specific Kustomization
flux logs --follow --kind=Kustomization --name={appname}

# Validate Kustomization before applying
flux diff kustomization {appname} --path=./apps/{appname}

# Create new Kustomization from CLI
flux create kustomization {appname} \
  --source=flux-system \
  --path="./apps/{appname}" \
  --prune=true \
  --interval=1h \
  --export > clusters/homelab/apps/{appname}.yaml
```

### GitOps Troubleshooting
```bash
# Check reconciliation errors
flux get kustomizations --status-selector=Ready=False

# Get detailed status of failing resources
kubectl describe kustomization {appname} -n flux-system

# Check SOPS decryption issues
flux get kustomizations | grep -E "(Unknown|False)"

# Force sync from Git (when changes aren't picked up)
flux reconcile source git flux-system --with-source
```

## Security Patterns

### Secrets management:
- Use SOPS for encrypting secrets
- Reference existing `postgres-config` for database credentials
- Create app-specific secrets for application configuration
- Never hardcode passwords in deployments

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

## GitOps Best Practices

### Deployment Workflow:
1. **Create/modify resources** in `/apps/{appname}/` directory
2. **Add to cluster** by creating `/clusters/homelab/apps/{appname}.yaml`
3. **Commit and push** changes to trigger GitOps
4. **Verify deployment** with `flux get kustomizations`
5. **Check application status** with `kubectl get pods`

### Debugging GitOps Issues:
```bash
# Common debugging sequence
flux get kustomizations                    # Overall status
flux logs --kind=Kustomization --name={appname}  # Detailed logs
kubectl get events --sort-by=.metadata.creationTimestamp  # Cluster events
kubectl describe kustomization {appname} -n flux-system   # Resource details
```

### Environment Variable Substitution:
- Use `${VARIABLE_NAME}` in manifests
- Define in `cluster-config` ConfigMap or `cluster-secrets` Secret
- Reference in Kustomization `postBuild.substituteFrom`

### SOPS Encryption Workflow:
```bash
# Encrypt new secrets
sops -e -i apps/{appname}/secrets.yaml

# Edit encrypted secrets
sops apps/{appname}/secrets.yaml

# Decrypt for viewing (don't commit)
sops -d apps/{appname}/secrets.yaml
```

### AI-Assisted GitOps with MCP
When using the Flux MCP Server, you can leverage natural language for complex operations:

#### Troubleshooting Workflow:
1. **"Check the overall health of my GitOps pipeline"** - Get comprehensive status
2. **"Why is my [appname] deployment failing?"** - Root cause analysis  
3. **"Show me the dependency graph for my Kustomizations"** - Visualize relationships
4. **"Compare [appname] config between environments"** - Cross-cluster analysis

#### Operational Workflows:
- **Deployment**: "Deploy [appname] to staging environment"
- **Scaling**: "Scale [appname] to 3 replicas in production"  
- **Rollback**: "Rollback [appname] to previous version"
- **Maintenance**: "Suspend all Flux resources for maintenance window"

#### Best Practices for MCP:
- Use specific app names and namespaces in prompts
- Specify target environments (staging, production) clearly
- Ask for verification steps after operations
- Request status checks after deployments

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
