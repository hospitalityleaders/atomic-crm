# Holedo CRM local development

Copy `.env.example` to `.env` and use these local-only values:

```dotenv
DB_PASSWORD=local-holedo-crm-password
DB_MIGRATION_PASSWORD=local-postgres-password
SESSION_SECRET=local-only-session-secret-change-before-production-123456
S3_SECRET_ACCESS_KEY=local-holedo-storage-secret
KEYCLOAK_TEST_USER_PASSWORD=local-holedo-owner
KEYCLOAK_TEST_COLLEAGUE_PASSWORD=local-holedo-colleague
```

Start PostgreSQL, Keycloak and the local S3-compatible object store:

```sh
docker compose -f compose.local.yml up -d
npm run migrate
npm run api
npm run dev
```

Open <http://localhost:5173> and sign in with either local account:

- `crm.owner@local.holedo.test` / `local-holedo-owner`
- `crm.colleague@local.holedo.test` / `local-holedo-colleague`

Each account receives its own personal CRM workspace at first sign-in. Create one company workspace as the owner, then add the colleague from account-manager settings to test shared access. A user can be active in no more than one company workspace; PostgreSQL enforces that rule.

These users and passwords are development fixtures only. Production users must come from the Holedo Keycloak realm and production secrets must come from the platform secret store.
