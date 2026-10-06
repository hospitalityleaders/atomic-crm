# Holedo workspace model

This is the shared workspace contract for Holedo Office, Workspace, CRM and
Tasks. Each application implements the same ownership and isolation rules in
its own data store.

## Workspace types

Every Holedo member receives one private personal workspace in each application
available to them. The workspace is created automatically when the member first
opens that application. It belongs to the member, is never owned by an employer
and cannot contain other members.

When a company purchases an application, that application creates one shared
company workspace for the company. The company can add multiple members and
assign application roles such as owner, administrator, editor and viewer.

A member can use their personal workspace and their company's workspace side by
side. A workspace switch changes the active tenant; it never copies or moves
records between workspaces.

## Membership rules

- A person has exactly one personal workspace per available application.
- A personal workspace has exactly one member: its owner.
- A person may have an active or suspended membership in at most one company
  organisation at a time.
- A company may have many members.
- Company roles affect only the company workspace. The personal workspace owner
  always remains its owner.
- Leaving, suspension or a change of company must not delete, transfer, reveal
  or otherwise alter the person's personal workspace.
- Joining a second company is rejected until the first company membership has
  ended. It must not break sign-in or silently move personal data.

The Holedo platform is the authority for a person's company organisation. Each
application projects that organisation into its own company workspace and keeps
an application-specific membership and role. An application may use its own
workspace UUID internally, but the company workspace must be bound to the same
stable Holedo organisation identity when the central organisation integration
is enabled.

## Data isolation

All business records belong to exactly one workspace. Requests are evaluated
against one active workspace and every database query, object-storage key and
background job must carry that workspace identity.

Personal and company information must never be merged merely because the same
person can access both workspaces. Switching workspace changes the tenant
context; it does not change record ownership.

Each application is multi-tenant within a shared deployment. Holedo does not
create a separate container, database server or object-storage bucket for every
person or company.

## CRM implementation

Holedo CRM applies this contract as follows:

- `crm_users` maps the Holedo OIDC subject to the local CRM user.
- `crm_workspaces` stores personal and company workspaces.
- `crm_workspace_members` stores workspace roles and enforces one company
  membership per user.
- every CRM business row carries `workspace_id`;
- forced PostgreSQL row-level security uses the active `workspace_id` as the
  final tenant boundary; and
- object-storage keys are prefixed by workspace and served through short-lived
  signed URLs.

Production company creation and membership should follow the central Holedo
organisation and application entitlement. CRM self-service company creation is
only a local/test facility and is disabled in the production Compose file.

## Acceptance checklist for every Holedo application

1. First sign-in creates or retrieves the personal workspace idempotently.
2. A user can switch between personal and company workspaces without data
   crossing the boundary.
3. A personal workspace cannot invite another member.
4. A company administrator can invite users and assign supported roles.
5. A user who already belongs to one company cannot join a second company.
6. A conflicting company invitation never prevents the user from signing in to
   their personal workspace.
7. Leaving or changing company preserves the personal workspace and its data.
8. Direct database access, file access and background work remain tenant scoped.
