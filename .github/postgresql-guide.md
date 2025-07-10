# PostgreSQL Integration Guide for GitHub Copilot

## Core Principle: ONE PostgreSQL Instance for All Apps

This homelab uses a centralized PostgreSQL approach. Never suggest creating separate PostgreSQL deployments.

## Quick Reference

### ✅ Correct PostgreSQL Integration:

```yaml
# In your application deployment:
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
spec:
  template:
    spec:
      containers:
        - name: myapp
          env:
            # Database connection using shared credentials
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
            - name: DB_HOST
              value: "postgres"
            - name: DB_PORT
              value: "5432"
            - name: DB_NAME
              value: "myapp_database"
          # Load app-specific config
          envFrom:
            - secretRef:
                name: myapp-secrets
```

### ❌ Never Do This:
```yaml
# DON'T create separate PostgreSQL deployments
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp-postgres  # ❌ WRONG
```

## Database Names Currently Used:
- `pinepods_database` - Pinepods podcast management
- `penpot_database` - Penpot design tool
- Add new apps following the pattern: `{appname}_database`

## Environment Variable Patterns

### Standard Database Variables:
- `DB_HOST`: Always `"postgres"`
- `DB_PORT`: Always `"5432"`
- `DB_USER`: From `postgres-config` secret
- `DB_PASSWORD`: From `postgres-config` secret
- `DB_NAME`: Unique per application

### Alternative Variable Names:
Some apps may use different variable names:
- `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
- `DATABASE_URL` - Full connection string format

### Connection String Format:
```yaml
env:
  - name: DATABASE_URL
    value: "postgresql://$(DB_USER):$(DB_PASSWORD)@$(DB_HOST):$(DB_PORT)/$(DB_NAME)"
```

## Application Setup Checklist

1. ✅ Use shared `postgres-config` secret for credentials
2. ✅ Create unique database name: `{appname}_database`
3. ✅ Point to existing `postgres` service
4. ✅ No separate PostgreSQL deployment
5. ✅ App-specific secrets for non-DB config

## Flux CD Dependencies

Apps using PostgreSQL should depend on the synology-csi storage:

```yaml
# In /clusters/homelab/apps/myapp.yaml
dependsOn:
  - name: synology-csi
```

This ensures the shared PostgreSQL instance is ready before the app starts.

## Database Creation

Applications should automatically create their database on first startup. Most modern applications handle this when they can't find their target database.

Manual database creation (if needed):
```bash
kubectl exec -it deployment/postgres -- psql -U postgres -c "CREATE DATABASE myapp_database;"
```

## Security Notes

- All database credentials are encrypted with SOPS
- Never hardcode database passwords
- Always use the existing `postgres-config` secret
- Each app gets isolated database access
