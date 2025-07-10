# Homelab Kubernetes Patterns

## Standard Application Structure

Every application should follow this structure:

```
apps/myapp/
├── kustomization.yaml      # Resource list
├── deployment.yaml         # Main application
├── service.yaml           # Kubernetes service
├── ingress.yaml           # Web access
├── persistentVolumes.yaml # Storage (if needed)
└── secrets.yaml           # App secrets (SOPS encrypted)
```

**IMPORTANT**: Never create separate PostgreSQL deployments. Always use the shared `postgres` service with `postgres-config` secret.

## Deployment Template

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
  namespace: default
  labels:
    app: myapp
spec:
  replicas: 1
  strategy:
    type: Recreate  # For stateful apps
  selector:
    matchLabels:
      app: myapp
  template:
    metadata:
      labels:
        app: myapp
    spec:
      containers:
        - name: myapp
          image: myapp:latest
          imagePullPolicy: "IfNotPresent"
          ports:
            - containerPort: 8080
          resources:
            requests:
              cpu: 100m
              memory: 256Mi
            limits:
              cpu: 500m
              memory: 1Gi
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
          # Common environment variables
          env:
            - name: TZ
              value: "Europe/Oslo"
```

## Service Template

```yaml
apiVersion: v1
kind: Service
metadata:
  name: myapp
  namespace: default
  labels:
    app: myapp
spec:
  type: ClusterIP
  selector:
    app: myapp
  ports:
    - name: http
      protocol: TCP
      port: 80
      targetPort: 8080
```

## Ingress Template

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: myapp-ingress
  namespace: default
spec:
  ingressClassName: public  # or "private"
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
                name: myapp
                port:
                  number: 80
```

## Storage Template

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: myapp-data
  namespace: default
spec:
  storageClassName: syno-storage
  accessModes:
    - ReadWriteMany  # For shared access
  resources:
    requests:
      storage: 10Gi
```

## Kustomization Template

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - persistentVolumes.yaml
  - deployment.yaml
  - service.yaml
  - ingress.yaml
  # Add secrets.yaml if using SOPS encrypted secrets
```

## SOPS Secret Template

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: myapp-secrets
  namespace: default
type: Opaque
data:
  # Values are SOPS encrypted
  api-key: ENC[AES256_GCM,data:...,type:str]
  password: ENC[AES256_GCM,data:...,type:str]
```

## Common Environment Variables

### Timezone
```yaml
env:
  - name: TZ
    value: "Europe/Oslo"
```

### User/Group IDs (for LinuxServer.io images)
```yaml
env:
  - name: PUID
    value: "1000"
  - name: PGID
    value: "1000"
```

### PostgreSQL Database Connection (ALWAYS use shared postgres)
```yaml
env:
  - name: DB_HOST
    value: "postgres"
  - name: DB_PORT
    value: "5432"
  - name: DB_NAME
    value: "myapp_database"  # Unique per app
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
```

## Resource Sizing Guidelines

### Small Applications (simple web apps):
```yaml
resources:
  requests:
    cpu: 50m
    memory: 128Mi
  limits:
    cpu: 200m
    memory: 512Mi
```

### Medium Applications (databases, complex apps):
```yaml
resources:
  requests:
    cpu: 100m
    memory: 256Mi
  limits:
    cpu: 500m
    memory: 1Gi
```

### Large Applications (media servers, heavy processing):
```yaml
resources:
  requests:
    cpu: 200m
    memory: 512Mi
  limits:
    cpu: 1000m
    memory: 2Gi
```

## Health Check Patterns

### HTTP Health Checks:
```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 8080
  initialDelaySeconds: 30
  periodSeconds: 30
readinessProbe:
  httpGet:
    path: /ready
    port: 8080
  initialDelaySeconds: 10
  periodSeconds: 10
```

### TCP Health Checks (for databases):
```yaml
livenessProbe:
  tcpSocket:
    port: 5432
  initialDelaySeconds: 30
  periodSeconds: 10
```

### Command Health Checks:
```yaml
livenessProbe:
  exec:
    command:
      - pg_isready
      - -U
      - postgres
  initialDelaySeconds: 30
  periodSeconds: 10
```

## Volume Mount Patterns

### Configuration directory:
```yaml
volumeMounts:
  - mountPath: /config
    name: app-config
```

### Data directory:
```yaml
volumeMounts:
  - mountPath: /data
    name: app-data
```

### Multiple mounts:
```yaml
volumeMounts:
  - mountPath: /config
    name: app-config
  - mountPath: /data
    name: app-data
volumes:
  - name: app-config
    persistentVolumeClaim:
      claimName: app-config
  - name: app-data
    persistentVolumeClaim:
      claimName: app-data
```
