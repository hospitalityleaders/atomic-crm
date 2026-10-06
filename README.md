# Holedo CRM

Holedo CRM is the Holedo-native customer relationship workspace, rebuilt on the current Marmelab Atomic CRM foundation.

It provides:

- a private CRM workspace for every Holedo member;
- one optional shared company workspace per member;
- user-editable deal pipelines;
- contextual deal archiving and restoration;
- Holedo branding and runtime administration;
- Keycloak/OIDC single sign-on and global Holedo logout;
- PostgreSQL tenant isolation with row-level security; and
- private S3-compatible attachment storage.

The public product page is served at `/`. The authenticated browser workspace is served at `/workspace` with its CRM header, workspace switcher and avatar menu. The matching `/app` route is frameless for the Holedo Flutter web view. Both open the Deals board by default.

The public page and CRM support light, dark and automatic themes. Runtime presentation settings are available at `/admin/` through a separate server-side admin token, so administrators do not need to sign in to Holedo to edit the homepage, colours, icon, social preview, access links or trusted header/footer code injection.

## Run locally

Requirements: Node.js 22, npm and Docker.

```sh
npm ci
cp .env.example .env
docker compose -f compose.local.yml up -d
npm run build
npm start
```

Open <http://localhost:3000>. The local Keycloak fixtures are:

- `crm.owner@local.holedo.test` / `local-holedo-owner`
- `crm.colleague@local.holedo.test` / `local-holedo-colleague`

See [LOCAL_DEVELOPMENT.md](./LOCAL_DEVELOPMENT.md) for the local stack and [DEPLOYMENT.md](./DEPLOYMENT.md) for the Docker-server rollout, UpCloud PostgreSQL, S3-compatible storage and production Keycloak values.

## Verification

```sh
npm run typecheck
npm run typecheck:server
npm run lint
npm run prettier
npm run test:unit:app -- --run
npm run build
npx playwright test --config playwright.holedo.config.ts
```

The Holedo browser test covers the public page, Keycloak login, `/workspace` browser shell, frameless `/app` shell, personal and company workspaces, the one-company membership constraint, platform administration, S3 upload/download and global logout.

## Upstream and license

This project is derived from [Marmelab Atomic CRM](https://github.com/marmelab/atomic-crm) and remains available under the [MIT license](./LICENSE.md).
