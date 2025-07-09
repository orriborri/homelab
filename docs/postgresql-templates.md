# PostgreSQL Quick Reference Templates

## New Application Database Setup

### 1. Application Secrets Template
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: YOUR_APP-secrets
  namespace: default
type: Opaque
stringData:
  # Application-specific configuration
  
  # Database connection (shared PostgreSQL)
  DB_TYPE: "postgresql"
  DB_HOST: "postgres"
  DB_PORT: "5432"
  DB_NAME: "YOUR_APP_database"  # ← Change this to your app name
  
  # Application-specific passwords
  admin-password: "your_app_admin_password"
```

### 2. Deployment Database Configuration
```yaml
# Add to your deployment.yaml containers.env section:
env:
  # Database credentials from shared postgres-config secret
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
  
  # Application-specific environment from your app secrets
envFrom:
  - secretRef:
      name: YOUR_APP-secrets
```

### 3. Encrypt Secrets
```bash
# After creating your secrets file:
sops --encrypt --in-place apps/YOUR_APP/secrets.yaml
```

## Database Names Used

Keep track of database names to avoid conflicts:

- `pinepods_database` - Pinepods podcast management
- `YOUR_APP_database` - Add your app here

## Common Environment Variable Names

Different applications use different variable names for database configuration:

### Standard Names
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- `DATABASE_URL` - Full connection string format

### Alternative Names
- `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
- `PG_HOST`, `PG_PORT`, `PG_USER`, `PG_PASSWORD`, `PG_DATABASE`

### Connection String Format
Some applications prefer a single connection string:
```yaml
DATABASE_URL: "postgresql://username:password@postgres:5432/database_name"
```

For these applications, you might need to construct the URL in the deployment:
```yaml
env:
  - name: DATABASE_URL
    value: "postgresql://$(DB_USER):$(DB_PASSWORD)@$(DB_HOST):$(DB_PORT)/$(DB_NAME)"
  - name: DB_USER
    valueFrom:
      secretKeyRef:
        name: postgres-config
        key: POSTGRES_USER
  # ... other DB vars
```

## Quick Commands

### Create Database
```bash
kubectl exec -it deployment/postgres -- psql -U postgres -c "CREATE DATABASE new_app_database;"
```

### List Databases
```bash
kubectl exec -it deployment/postgres -- psql -U postgres -c "\l"
```

### Connect to Database
```bash
kubectl exec -it deployment/postgres -- psql -U postgres -d database_name
```

### Check Application Logs
```bash
kubectl logs -f deployment/YOUR_APP
```

### Verify Environment Variables
```bash
kubectl exec -it deployment/YOUR_APP -- env | grep DB_
```
