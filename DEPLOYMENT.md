# Holedo CRM deployment

Holedo CRM is a stateless web/API container backed by Keycloak, PostgreSQL and S3-compatible object storage. There is no legacy-data migration: deploy to a new empty database and let `npm start` apply the schema before starting the API.

## Docker-server rollout

Merges to `main` publish `ghcr.io/hospitalityleaders/atomic-crm:latest`. Every published image also receives an immutable `sha-<commit>` tag. The server Compose file runs the application as an unprivileged user with a read-only filesystem, dropped Linux capabilities, bounded logs, a health check and automatic restart.

On the Docker server:

```sh
mkdir -p /opt/holedo-crm
cd /opt/holedo-crm
curl -O https://raw.githubusercontent.com/hospitalityleaders/atomic-crm/main/compose.server.yml
curl -o .env.server https://raw.githubusercontent.com/hospitalityleaders/atomic-crm/main/.env.server.example
chmod 600 .env.server
```

Fill in `.env.server`, then deploy:

```sh
docker compose --env-file .env.server -f compose.server.yml config --quiet
docker compose --env-file .env.server -f compose.server.yml pull
docker compose --env-file .env.server -f compose.server.yml up -d
docker compose --env-file .env.server -f compose.server.yml ps
```

If the GitHub package is private, authenticate the server once with a GitHub token that has `read:packages` before running `pull`:

```sh
docker login ghcr.io -u YOUR_GITHUB_USERNAME
```

The container binds to `127.0.0.1:3000` by default. Point the server's existing TLS reverse proxy at that address and preserve `Host`, `X-Forwarded-Proto` and `X-Forwarded-For`. The public address must exactly match `APP_ORIGIN`, the Keycloak redirect URI and the Keycloak client's allowed redirect URI.

Example Caddy route:

```caddyfile
crm.holedo.com {
  reverse_proxy 127.0.0.1:3000
}
```

Example Nginx location inside the TLS-enabled virtual host:

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    client_max_body_size 10m;
}
```

For a controlled upgrade, replace `latest` in `HOLEDO_CRM_IMAGE` with an immutable `sha-<commit>` tag, run `pull`, then `up -d` again. Rollback uses the same process with the previous SHA tag. PostgreSQL migrations are forward-only, so take or verify an UpCloud database restore point before each production upgrade.

## Database requirements

Use a dedicated UpCloud Managed PostgreSQL database and two credentials:

- `DB_MIGRATION_USER` owns the schema and can create the `pgcrypto` extension, tables, views, functions, policies and indexes.
- `DB_USER` is the non-superuser application role. It must not have `BYPASSRLS`; row-level security is the final workspace-isolation boundary.

Required values:

```dotenv
DB_HOST=
DB_PORT=5432
DB_NAME=holedo_crm
DB_USER=
DB_PASSWORD=
DB_MIGRATION_USER=
DB_MIGRATION_PASSWORD=
DB_SSL=true
DB_SSL_REJECT_UNAUTHORIZED=true
DB_SSL_CA=
DB_POOL_MAX=10
```

Size the initial service for at least 2 vCPU, 4 GB RAM, 20 GB storage, daily backups and point-in-time recovery. Enable private networking, TLS, automated maintenance, storage alerts and connection monitoring. Scale from measured connections and data volume rather than creating one database per workspace; all tenants share the schema and are isolated by `workspace_id` plus forced RLS.

## Object-storage requirements

Use one private S3-compatible bucket. Objects are namespaced as `<workspace UUID>/<file UUID>/<safe filename>` and the database stores only metadata. The bucket must not be public; downloads use short-lived signed URLs.

Required values:

```dotenv
S3_ENDPOINT=
S3_REGION=
S3_BUCKET=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_FORCE_PATH_STYLE=false
S3_CREATE_BUCKET=false
FILE_UPLOAD_LIMIT=10mb
```

The object-store identity needs only `GetObject`, `PutObject`, `DeleteObject` and list access for the configured bucket. Enable server-side encryption, versioning or retention according to Holedo policy, lifecycle cleanup for abandoned uploads, access logging and capacity alerts. Keep `S3_CREATE_BUCKET=false` in production; infrastructure should create and govern the bucket.

## Keycloak and application values

Create a confidential OIDC client with authorization-code flow, PKCE, the exact callback URI and back-channel logout. Production self-registration can be enabled or disabled in the Holedo realm independently of CRM.

```dotenv
NODE_ENV=production
PORT=3000
APP_ORIGIN=https://crm.holedo.com
OIDC_ISSUER_URL=https://identity.holedo.com/realms/holedo
OIDC_CLIENT_ID=holedo-crm
OIDC_CLIENT_SECRET=
OIDC_REDIRECT_URI=https://crm.holedo.com/auth/callback
OIDC_POST_LOGOUT_REDIRECT_URI=https://crm.holedo.com/
SESSION_SECRET=
SESSION_MAX_AGE_SECONDS=43200
SESSION_COOKIE_DOMAIN=
PLATFORM_ADMIN_ROLE=holedo-platform-admin
ALLOW_SELF_SERVICE_COMPANY_WORKSPACES=false
```

`SESSION_SECRET` must be independently generated and at least 32 characters. Store all passwords, client secrets, database credentials and S3 keys in the platform secret store. Do not copy the local test users into production.

## Health and rollout

- Liveness: `GET /api/health`
- Readiness: `GET /api/ready`
- Container port: `3000`
- Build: repository `Dockerfile`
- Start: `npm start`

Run one migration job during rollout or allow the first replica to take the PostgreSQL advisory lock. Keep at least two application replicas behind TLS termination after the initial launch. Sessions are stored in PostgreSQL, so no sticky load balancing is required.

Startup validates required URLs, credentials and secrets before applying migrations. Useful server checks are:

```sh
curl --fail https://crm.holedo.com/api/health
curl --fail https://crm.holedo.com/api/ready
docker compose --env-file .env.server -f compose.server.yml logs --tail=200 crm
```
