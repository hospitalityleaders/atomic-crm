# Holedo CRM production deployment

Holedo CRM follows the same Portainer pattern as Holedo Office. The complete runtime configuration—including passwords and access keys—is entered directly in `compose.production.yml`. There is no `.env` file and no separate Portainer environment-variable configuration.

The application container is disposable. Structured CRM data lives in UpCloud Managed PostgreSQL and uploaded files live in UpCloud Managed Object Storage. No legacy data migration is required.

## 1. Prepare PostgreSQL

Use the existing UpCloud Managed PostgreSQL service and the existing `holedo_crm` database. No legacy data is retained.

- database: `holedo_crm`
- schema: `holedo_crm`
- initial application and migration user: `holedo_crm_app`

The existing user initializes the new CRM tables and handles requests. It must own the dedicated `holedo_crm` schema and must not have `BYPASSRLS`. Every tenant-owned record carries a `workspace_id`, and forced PostgreSQL row-level security is the final isolation boundary.

Allow the application role to create its dedicated schema once:

```sql
GRANT CREATE ON DATABASE holedo_crm TO holedo_crm_app;
```

Deploy the CRM from the single `compose.production.private.yml` stack. On first
startup it creates the `holedo_crm` schema and the new application tables.

## 2. Prepare file storage

Yes, CRM needs persistent file storage. It is used for note attachments and future company, contact, and deal uploads. Holedo logos, Source Sans Pro, icons, and other fixed branding assets remain inside the application image.

The private `holedo-crm` bucket has been created in the existing UpCloud Managed Object Storage service and its upload/download/delete path has been verified.

For ongoing operation:

1. Keep public bucket access disabled.
2. Create a dedicated CRM access key when convenient; the supplied shared Holedo storage key works for the first deployment.
3. Limit the dedicated key to the `holedo-crm` bucket with list, read, write, and delete-object access.
4. Enable versioning, retention, lifecycle, and access logging according to Holedo policy.
5. Put the active access-key ID and secret directly into the YAML.

```yaml
S3_ENDPOINT: "https://gdrv6.upcloudobjects.com"
S3_BUCKET: "holedo-crm"
S3_ACCESS_KEY_ID: "the-dedicated-crm-access-key"
S3_SECRET_ACCESS_KEY: "the-dedicated-crm-secret-key"
```

Objects are stored under a workspace-specific prefix and downloads use five-minute signed URLs. There is one private CRM bucket, not one bucket per workspace. No Docker volume stores customer uploads.

## 3. Prepare Keycloak

Create the confidential `holedo-crm` client in the production Holedo realm with authorization-code flow and PKCE.

Required client settings:

- redirect URI: `https://crm.holedo.com/auth/callback`
- valid post-logout redirect URI: `https://crm.holedo.com/`
- back-channel logout URL: `https://crm.holedo.com/auth/backchannel-logout`
- back-channel logout session required: enabled
- client role used for platform administrators: `holedo-platform-admin`

The first deployment uses `AUTH_MODE: "demo"`, so the CRM can be tested before the shared Holedo Keycloak client is ready. In demo mode, everyone who can reach `/workspace` or `/app` shares the same temporary test workspace identified by `DEMO_USER_EMAIL`. Do not store live customer data in that workspace.

When the production client is ready, copy its client secret into `OIDC_CLIENT_SECRET`, enter the exact realm URL in `OIDC_ISSUER_URL`, and change `AUTH_MODE` to `oidc`.

The avatar menu calls Keycloak's OIDC end-session endpoint. This signs the person out of Holedo globally, not only out of CRM.

Generate a separate random session secret of at least 32 characters and put it directly into `SESSION_SECRET`. Do not reuse a database, S3, or Keycloak password.

## 4. Complete the Portainer YAML

Open `compose.production.yml` and replace every underscore placeholder. The production passwords remain in the Portainer stack YAML, matching the Holedo Office deployment pattern. Do not commit the completed secret-bearing YAML back to Git.

Because Docker Compose treats `$` as interpolation syntax, write any literal `$` in a password as `$$` in the stack YAML. Keep values quoted, especially when they contain `#`, `:`, or spaces.

The filled, password-bearing `compose.production.private.yml` is ignored by Git. Use that file as the Portainer stack source. The public `compose.production.yml` remains a safe template with placeholders.

Runtime presentation settings are available at `https://crm.holedo.com/admin/`. This page accepts `ADMIN_TOKEN` from the YAML and does not require a Holedo login.

The runtime admin also supports trusted header and footer code injection. These snippets run on the public page, browser workspace and embedded app, but not on the admin page itself. Treat the admin token like a production secret because injected scripts have full control of the CRM frontend.

The stack connects to the existing external `npm_proxy` network with the alias `holedo-crm-web`. In Nginx Proxy Manager, route `crm.holedo.com` to:

```text
Scheme: http
Forward host: holedo-crm-web
Forward port: 3000
Websockets: enabled
Block common exploits: enabled
SSL: enabled with forced HTTPS
```

The public product page is `https://crm.holedo.com/`. The full authenticated browser application is `https://crm.holedo.com/workspace`; it uses the CRM navigation, workspace switcher and avatar. The Flutter web-view entry point is `https://crm.holedo.com/app`; it renders the same CRM without the browser header. Both entry points open Deals by default and expose matching child routes such as `/workspace/contacts` and `/app/contacts`.

## 5. Deploy in Portainer

Create or update the `holedo-crm` stack using the completed contents of `compose.production.private.yml`. If the GitHub package is private, configure `ghcr.io` in Portainer with a token that has `read:packages` access.

The stack pulls:

```text
ghcr.io/hospitalityleaders/atomic-crm:latest
```

Redeploying the stack pulls the current image because `pull_policy` is `always`. For a controlled release, replace `latest` with an immutable `sha-<commit>` image tag.

## 6. Verify

Check:

```text
https://crm.holedo.com/api/health
https://crm.holedo.com/api/ready
https://crm.holedo.com/
https://crm.holedo.com/workspace
https://crm.holedo.com/app
```

Then verify:

- a Holedo member can sign in through Keycloak;
- `/workspace` includes the CRM header while `/app` is frameless;
- the member receives a personal workspace;
- a company workspace can contain multiple members;
- one user cannot join two company workspaces;
- an attachment uploads and downloads;
- workspace settings and pipeline stages persist; and
- avatar sign-out ends the Keycloak/Holedo session.

The container runs as an unprivileged user with a read-only filesystem, dropped Linux capabilities, bounded logs, a readiness health check, and automatic restart.
