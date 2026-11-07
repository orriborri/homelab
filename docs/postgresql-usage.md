# PostgreSQL Usage Guide for Homelab

This guide explains how to use the shared PostgreSQL instance in your homelab for new applications.

Reviewed against manifests on 2026-10-31; actual server version, database contents,
and live storage bindings remain unverified. See the [storage discrepancy](documentation-audit.md).

## Overview

Your homelab uses a centralized PostgreSQL 18 instance that can be shared across multiple applications. This approach:
- Reduces resource consumption
- Simplifies database management
- Maintains data isolation through separate databases
- Uses consistent, encrypted credentials

## PostgreSQL Infrastructure

### Service Details
- **Service Name**: `postgres`
- **Namespace**: `default`
- **Port**: `5432`
- **Version**: PostgreSQL 18
- **Storage**: Uses `homelab-nfs` storage class; the mounted PVC is `postgres17-data`
- **Access**: ClusterIP service; no external LoadBalancer is configured. The hostname annotation alone does not provide external connectivity.

### Existing Credentials
Database credentials are stored in the encrypted `postgres-config` secret:
- `POSTGRES_USER` - Database superuser
- `POSTGRES_PASSWORD` - Database password
- `PGHOST`, `PGUSER`, `PGPASSWORD` - Client connection variables

## Adding a New Application

### Step 1: Configure Database Connection

For applications that need PostgreSQL, configure them to use the existing instance:

```yaml
# In your application's configMap.yaml or secrets.yaml
data:
  DB_HOST: "postgres"
  DB_PORT: "5432"
  DB_TYPE: "postgresql"
  DB_NAME: "your_app_database_name"  # Use a unique name for your app
```

### Step 2: Reference Existing Credentials

These examples assume the `default` namespace. In another namespace, use `postgres.default.svc.cluster.local` and provide credentials in that namespace. The example reuses `postgres-config`; prefer a dedicated application role for new integrations:

```yaml
# In deployment.yaml
env:
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

### Step 3: Database Creation

Create the database before starting the application unless its documented startup behavior explicitly creates it. Creating tables or running migrations does not necessarily create the database itself.

Alternatively, you can manually create the database:

```bash
# Connect to PostgreSQL
kubectl exec -it deployment/postgres -- psql -U postgres

# Create database for your application
CREATE DATABASE your_app_database_name;
\q
```

## Example: Complete Application Setup

The following is an illustrative Pinepods-style configuration. Pinepods is not currently registered in this repository:

### Application Secrets (`pinepods-secrets.yaml`)
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: pinepods-secrets
  namespace: default
type: Opaque
stringData:
  # Application-specific config
  USERNAME: "admin"
  FULLNAME: "Admin User"
  EMAIL: "admin@orriborri.com"
  HOSTNAME: "https://pods.orriborri.com"
  DB_TYPE: "postgresql"
  DB_HOST: "postgres"        # ← Points to existing service
  DB_PORT: "5432"
  DB_NAME: "pinepods_database"  # ← Unique database name
  # Application passwords (not DB passwords)
  admin-password: "your_app_admin_password"
```

### Deployment Configuration
```yaml
# In deployment.yaml
spec:
  template:
    spec:
      containers:
        - name: your-app
          env:
            # Get DB credentials from existing postgres-config
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
          envFrom:
            # Load app-specific config
            - secretRef:
                name: pinepods-secrets
```

## Security Best Practices

### 1. Use Existing Credentials
- The shared instance currently exposes credentials through `postgres-config` in `default`.
- Prefer a dedicated database role with only the permissions each application needs; sharing a superuser does not isolate access between databases.
- Secrets are namespace-scoped: applications in another namespace need an appropriate secret in their own namespace. Encrypt credentials with SOPS.

### 2. Encrypt Application Secrets
All application secrets should be encrypted with SOPS:

```bash
# Encrypt your secrets file
sops --encrypt --pgp "$SOPS_PGP_FP" --in-place apps/your-app/secrets.yaml
```

### 3. Database Isolation
- Each application should use its own database name
- Use descriptive database names: `appname_database`, `appname_db`, etc.
- Applications should NOT share databases (except where specifically designed to)

## Database Management

### Connecting to PostgreSQL
```bash
# From within cluster
kubectl exec -it deployment/postgres -- psql -U postgres

# From your workstation, first forward the ClusterIP service in another terminal:
kubectl -n default port-forward service/postgres 5432:5432
psql -h 127.0.0.1 -U postgres
```

### Common Operations
```sql
-- List all databases
\l

-- Connect to specific database
\c database_name

-- List tables in current database
\dt

-- Show database sizes
SELECT datname, pg_size_pretty(pg_database_size(datname)) FROM pg_database;

-- Create new database for application
CREATE DATABASE new_app_database;

-- Create read-only user (if needed)
CREATE USER readonly_user WITH PASSWORD 'password';
GRANT CONNECT ON DATABASE app_database TO readonly_user;
GRANT USAGE ON SCHEMA public TO readonly_user;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly_user;
```

### Backup and Maintenance
The PostgreSQL instance should be backed up regularly. Consider:
- Database dumps using `pg_dump`
- Volume snapshots of the PVC
- Regular maintenance operations

## Troubleshooting

### Connection Issues
1. **Check service is running**: `kubectl get pods -l app=postgres`
2. **Verify service exists**: `kubectl get svc postgres`
3. **Test connectivity**: `kubectl exec -it deployment/postgres -- pg_isready`

### Database Issues
1. **Check logs**: `kubectl logs deployment/postgres`
2. **Resource constraints**: `kubectl describe pod postgres-xxx`
3. **Storage issues**: `kubectl get pvc postgres17-data`

### Application Connection Issues
1. **Verify environment variables**: `kubectl exec -it deployment/your-app -- env | grep DB_`
2. **Check secret exists**: `kubectl get secret postgres-config`
3. **Test database connectivity**: use a PostgreSQL client to connect to `postgres.default.svc.cluster.local:5432`; ICMP ping does not test the database service.

## Migration from Separate PostgreSQL

If you have applications currently using separate PostgreSQL instances:

### 1. Backup Data
```bash
# Dump from old instance
kubectl exec deployment/old-postgres -- pg_dump -U postgres old_database > backup.sql
```

### 2. Create Database in Shared Instance
```bash
kubectl exec -it deployment/postgres -- psql -U postgres -c "CREATE DATABASE new_database;"
```

### 3. Restore Data
```bash
# Restore to new database
kubectl exec -i deployment/postgres -- psql -U postgres -d new_database < backup.sql
```

### 4. Update Application Configuration
- Change `DB_HOST` to `postgres`
- Update `DB_NAME` to new database name
- Switch to use `postgres-config` secret for credentials

### 5. Remove Old PostgreSQL Instance
- Delete old PostgreSQL deployment
- Remove old PVCs
- Clean up old secrets

## Resources

- **PostgreSQL Documentation**: https://www.postgresql.org/docs/18/
- **Kubernetes PostgreSQL**: https://kubernetes.io/docs/tutorials/stateful-application/basic-stateful-set/
- **SOPS Documentation**: https://github.com/mozilla/sops

## Example Applications Using This Pattern

- Pinepods examples above are illustrative; verify application manifests before adopting them.
- Sparkyfitness currently runs its own PostgreSQL deployment in the `sparkyfitness` namespace.

---

*This guide should be updated as new applications are added or the PostgreSQL configuration changes.*
