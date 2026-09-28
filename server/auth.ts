import crypto from "node:crypto";
import type { Request, Response } from "express";
import { createRemoteJWKSet, decodeJwt, jwtVerify } from "jose";
import * as oidc from "openid-client";
import { db } from "./db.js";
import { ensureWorkspaceSale, seedWorkspace } from "./workspaces.js";

const sessionCookie = "holedo_crm_session";
const flowCookie = "holedo_crm_oidc_flow";
const flowLifetimeMs = 10 * 60 * 1000;
const sessionLifetimeMs =
  Math.max(Number(process.env.SESSION_MAX_AGE_SECONDS ?? 43_200), 900) * 1000;

let configurationPromise: Promise<oidc.Configuration> | undefined;
let logoutJwks: ReturnType<typeof createRemoteJWKSet> | undefined;

export type CrmSession = {
  userId: string;
  subject: string;
  email: string;
  displayName: string;
  workspaceId: string;
  workspaceName: string;
  workspaceType: "personal" | "company";
  role: "owner" | "administrator" | "editor" | "viewer";
  platformAdmin: boolean;
  saleId: number;
};

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    domain: process.env.SESSION_COOKIE_DOMAIN || undefined,
  };
}

function hash(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function encryptionKey() {
  const secret = process.env.SESSION_SECRET ?? "";
  if (secret.length < 32) {
    throw new Error("SESSION_SECRET must contain at least 32 characters");
  }
  return crypto.createHash("sha256").update(secret).digest();
}

function encrypt(value?: string) {
  if (!value) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), encrypted]
    .map((part) => part.toString("base64url"))
    .join(".");
}

function decrypt(value?: string | null) {
  if (!value) return undefined;
  const [iv, tag, encrypted] = value
    .split(".")
    .map((part) => Buffer.from(part, "base64url"));
  if (!iv || !tag || !encrypted) return undefined;
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    "utf8",
  );
}

function parseCookies(req: Request) {
  return Object.fromEntries(
    (req.headers.cookie ?? "")
      .split(";")
      .map((part) => part.trim().split("=").map(decodeURIComponent))
      .filter((part) => part.length === 2),
  );
}

function cleanReturnTo(value: unknown) {
  const candidate = String(value ?? "/app");
  return candidate.startsWith("/") &&
    !candidate.startsWith("//") &&
    !candidate.startsWith("/auth/")
    ? candidate.slice(0, 1500)
    : "/app";
}

function callbackUrl() {
  return (
    process.env.OIDC_REDIRECT_URI ||
    `${process.env.APP_ORIGIN || "http://localhost:3000"}/auth/callback`
  );
}

function postLogoutUrl() {
  return (
    process.env.OIDC_POST_LOGOUT_REDIRECT_URI ||
    `${process.env.APP_ORIGIN || "http://localhost:3000"}/`
  );
}

export function oidcConfigured() {
  const usable = (value?: string) => Boolean(value && !/^_+$/.test(value));
  return (
    usable(process.env.OIDC_ISSUER_URL) &&
    usable(process.env.OIDC_CLIENT_ID) &&
    usable(process.env.OIDC_CLIENT_SECRET) &&
    usable(process.env.SESSION_SECRET) &&
    (process.env.SESSION_SECRET?.length ?? 0) >= 32
  );
}

async function oidcConfiguration() {
  if (!oidcConfigured()) throw new Error("OIDC is not configured");
  const allowInsecureRequests =
    process.env.OIDC_ALLOW_INSECURE_HTTP === "true"
      ? { execute: [oidc.allowInsecureRequests] }
      : undefined;
  configurationPromise ??= oidc.discovery(
    new URL(process.env.OIDC_ISSUER_URL!),
    process.env.OIDC_CLIENT_ID!,
    process.env.OIDC_CLIENT_SECRET!,
    undefined,
    allowInsecureRequests,
  );
  return configurationPromise;
}

export async function beginOidcLogin(
  req: Request,
  res: Response,
  registration = false,
) {
  const configuration = await oidcConfiguration();
  const codeVerifier = oidc.randomPKCECodeVerifier();
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  const flowToken = crypto.randomBytes(32).toString("base64url");
  const returnTo = cleanReturnTo(req.query.returnTo);

  await db.query("DELETE FROM crm_oidc_flows WHERE expires_at <= NOW()");
  await db.query(
    `INSERT INTO crm_oidc_flows
      (token_hash, state, nonce, code_verifier, return_to, expires_at)
     VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '10 minutes')`,
    [hash(flowToken), state, nonce, codeVerifier, returnTo],
  );
  res.cookie(flowCookie, flowToken, {
    ...cookieOptions(),
    path: "/auth",
    maxAge: flowLifetimeMs,
  });

  const authorizationUrl = oidc.buildAuthorizationUrl(configuration, {
    redirect_uri: callbackUrl(),
    scope: "openid profile email",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
    nonce,
    ...(registration ? { prompt: "create" } : {}),
  });
  res.redirect(302, authorizationUrl.href);
}

export async function completeOidcLogin(req: Request, res: Response) {
  const flowToken = parseCookies(req)[flowCookie];
  if (!flowToken)
    throw new Error("The login attempt has expired. Please try again.");

  const flowResult = await db.query(
    `DELETE FROM crm_oidc_flows
     WHERE token_hash = $1 AND expires_at > NOW()
     RETURNING state, nonce, code_verifier, return_to`,
    [hash(flowToken)],
  );
  res.clearCookie(flowCookie, { ...cookieOptions(), path: "/auth" });
  const flow = flowResult.rows[0];
  if (!flow)
    throw new Error("The login attempt has expired. Please try again.");

  const configuration = await oidcConfiguration();
  const responseUrl = new URL(callbackUrl());
  for (const [key, value] of Object.entries(req.query)) {
    if (typeof value === "string") responseUrl.searchParams.append(key, value);
  }
  const tokens = await oidc.authorizationCodeGrant(configuration, responseUrl, {
    pkceCodeVerifier: flow.code_verifier,
    expectedState: flow.state,
    expectedNonce: flow.nonce,
    idTokenExpected: true,
  });
  const claims = tokens.claims();
  if (!claims?.sub)
    throw new Error("The identity provider returned no subject.");

  const email =
    typeof claims.email === "string" ? claims.email.slice(0, 320) : "";
  const displayName = String(
    claims.name || claims.preferred_username || email || "Holedo member",
  ).slice(0, 160);
  const firstName = String(
    claims.given_name || displayName.split(/\s+/)[0] || "Holedo",
  ).slice(0, 80);
  const lastName = String(
    claims.family_name ||
      displayName.split(/\s+/).slice(1).join(" ") ||
      "member",
  ).slice(0, 80);
  const accessClaims = tokens.access_token
    ? decodeJwt(tokens.access_token)
    : undefined;
  const realmAccess = (claims.realm_access ?? accessClaims?.realm_access) as
    | { roles?: unknown[] }
    | undefined;
  const platformAdmin = (realmAccess?.roles ?? [])
    .map(String)
    .includes(process.env.PLATFORM_ADMIN_ROLE || "holedo-platform-admin");
  const sessionToken = crypto.randomBytes(32).toString("base64url");
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const userResult = await client.query(
      `INSERT INTO crm_users
        (keycloak_subject, email, display_name, first_name, last_name, platform_admin, last_login_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (keycloak_subject) DO UPDATE
         SET email = EXCLUDED.email,
             display_name = EXCLUDED.display_name,
             first_name = EXCLUDED.first_name,
             last_name = EXCLUDED.last_name,
             platform_admin = EXCLUDED.platform_admin,
             last_login_at = NOW(),
             updated_at = NOW()
       RETURNING id`,
      [claims.sub, email, displayName, firstName, lastName, platformAdmin],
    );
    const userId = userResult.rows[0].id as string;
    await client.query(
      `INSERT INTO crm_workspaces (workspace_type, name, owner_user_id)
       VALUES ('personal', $1, $2)
       ON CONFLICT (owner_user_id) WHERE workspace_type = 'personal' DO NOTHING`,
      [`${firstName}'s Workspace`, userId],
    );
    const workspaceResult = await client.query(
      "SELECT id FROM crm_workspaces WHERE owner_user_id = $1 AND workspace_type = 'personal'",
      [userId],
    );
    const workspaceId = workspaceResult.rows[0].id as string;
    await client.query(
      `INSERT INTO crm_workspace_members
        (workspace_id, workspace_type, user_id, role, status)
       VALUES ($1, 'personal', $2, 'owner', 'active')
       ON CONFLICT (workspace_id, user_id) DO UPDATE
         SET role = 'owner', status = 'active', updated_at = NOW()`,
      [workspaceId, userId],
    );
    await client.query("SELECT set_config('app.workspace_id', $1, true)", [
      workspaceId,
    ]);
    await seedWorkspace(client, workspaceId, userId);

    if (email) {
      const invitation = await client.query(
        `SELECT i.id, i.workspace_id, i.role
         FROM crm_workspace_invitations i
         JOIN crm_workspaces w ON w.id = i.workspace_id
         WHERE lower(i.email) = lower($1)
           AND i.accepted_at IS NULL
           AND i.revoked_at IS NULL
           AND i.expires_at > NOW()
           AND w.workspace_type = 'company'
         ORDER BY i.created_at
         LIMIT 1`,
        [email],
      );
      if (invitation.rows[0]) {
        const invited = invitation.rows[0];
        await client.query(
          `INSERT INTO crm_workspace_members
            (workspace_id, workspace_type, user_id, role, status)
           VALUES ($1, 'company', $2, $3, 'active')
           ON CONFLICT (workspace_id, user_id) DO UPDATE
             SET role = EXCLUDED.role, status = 'active', updated_at = NOW()`,
          [invited.workspace_id, userId, invited.role],
        );
        await client.query(
          "UPDATE crm_workspace_invitations SET accepted_at = NOW() WHERE id = $1",
          [invited.id],
        );
        await client.query(
          `UPDATE crm_workspace_invitations
           SET revoked_at = NOW()
           WHERE lower(email) = lower($1) AND id <> $2
             AND accepted_at IS NULL AND revoked_at IS NULL`,
          [email, invited.id],
        );
        await client.query("SELECT set_config('app.workspace_id', $1, true)", [
          invited.workspace_id,
        ]);
        await ensureWorkspaceSale(
          client,
          invited.workspace_id,
          userId,
          ["owner", "administrator"].includes(invited.role),
        );
        await client.query("SELECT set_config('app.workspace_id', $1, true)", [
          workspaceId,
        ]);
      }
    }
    await client.query("DELETE FROM crm_sessions WHERE expires_at <= NOW()");
    await client.query(
      `INSERT INTO crm_sessions
        (token_hash, user_id, active_workspace_id, keycloak_session_id,
         refresh_token_encrypted, id_token_encrypted, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6,
         NOW() + ($7 * INTERVAL '1 millisecond'))`,
      [
        hash(sessionToken),
        userId,
        workspaceId,
        typeof claims.sid === "string" ? claims.sid : null,
        encrypt(tokens.refresh_token),
        encrypt(tokens.id_token),
        sessionLifetimeMs,
      ],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  res.cookie(sessionCookie, sessionToken, {
    ...cookieOptions(),
    path: "/",
    maxAge: sessionLifetimeMs,
  });
  res.redirect(302, cleanReturnTo(flow.return_to));
}

export async function getCrmSession(req: Request): Promise<CrmSession | null> {
  const token = parseCookies(req)[sessionCookie];
  if (!token) return null;
  const result = await db.query(
    `SELECT u.id AS user_id, u.keycloak_subject, u.email, u.display_name,
            u.platform_admin,
            w.id AS workspace_id, w.name AS workspace_name, w.workspace_type,
            m.role
     FROM crm_sessions s
     JOIN crm_users u ON u.id = s.user_id
     JOIN crm_workspaces w ON w.id = s.active_workspace_id
     JOIN crm_workspace_members m
       ON m.workspace_id = w.id AND m.user_id = u.id AND m.status = 'active'
     WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
    [hash(token)],
  );
  const row = result.rows[0];
  if (!row) return null;
  const client = await db.connect();
  let saleId: number;
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.workspace_id', $1, true)", [
      row.workspace_id,
    ]);
    const sale = await client.query(
      "SELECT id FROM sales WHERE workspace_id = $1 AND crm_user_id = $2",
      [row.workspace_id, row.user_id],
    );
    await client.query("COMMIT");
    if (!sale.rows[0]) return null;
    saleId = Number(sale.rows[0].id);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return {
    userId: row.user_id,
    subject: row.keycloak_subject,
    email: row.email,
    displayName: row.display_name,
    workspaceId: row.workspace_id,
    workspaceName: row.workspace_name,
    workspaceType: row.workspace_type,
    role: row.role,
    platformAdmin: row.platform_admin,
    saleId,
  };
}

export async function switchWorkspace(req: Request, workspaceId: string) {
  const token = parseCookies(req)[sessionCookie];
  if (!token) return false;
  const result = await db.query(
    `UPDATE crm_sessions s
       SET active_workspace_id = $2, updated_at = NOW()
     WHERE s.token_hash = $1
       AND s.expires_at > NOW()
       AND EXISTS (
         SELECT 1 FROM crm_workspace_members m
         WHERE m.workspace_id = $2 AND m.user_id = s.user_id AND m.status = 'active'
       )`,
    [hash(token), workspaceId],
  );
  return result.rowCount === 1;
}

export async function logoutCrmSession(req: Request, res: Response) {
  const token = parseCookies(req)[sessionCookie];
  let idToken: string | undefined;
  if (token) {
    const result = await db.query(
      "DELETE FROM crm_sessions WHERE token_hash = $1 RETURNING id_token_encrypted",
      [hash(token)],
    );
    try {
      idToken = decrypt(result.rows[0]?.id_token_encrypted);
    } catch {
      idToken = undefined;
    }
  }
  res.clearCookie(sessionCookie, { ...cookieOptions(), path: "/" });
  if (!oidcConfigured()) return res.redirect(302, "/");
  try {
    const configuration = await oidcConfiguration();
    const logoutUrl = oidc.buildEndSessionUrl(configuration, {
      post_logout_redirect_uri: postLogoutUrl(),
      ...(idToken ? { id_token_hint: idToken } : {}),
    });
    return res.redirect(302, logoutUrl.href);
  } catch {
    return res.redirect(302, "/");
  }
}

export async function handleBackchannelLogout(logoutToken: unknown) {
  if (!oidcConfigured() || typeof logoutToken !== "string" || !logoutToken) {
    throw new Error("Invalid logout token");
  }
  const configuration = await oidcConfiguration();
  const metadata = configuration.serverMetadata();
  if (!metadata.jwks_uri)
    throw new Error("The OIDC provider publishes no JWKS URI");
  logoutJwks ??= createRemoteJWKSet(new URL(metadata.jwks_uri));
  const { payload } = await jwtVerify(logoutToken, logoutJwks, {
    issuer: metadata.issuer,
    audience: process.env.OIDC_CLIENT_ID!,
  });
  const events = payload.events as Record<string, unknown> | undefined;
  if (
    !events?.["http://schemas.openid.net/event/backchannel-logout"] ||
    payload.nonce ||
    (!payload.sid && !payload.sub)
  ) {
    throw new Error("Invalid logout token claims");
  }
  await db.query(
    `DELETE FROM crm_sessions s USING crm_users u
     WHERE s.user_id = u.id
       AND (($1::TEXT IS NOT NULL AND s.keycloak_session_id = $1)
         OR ($2::TEXT IS NOT NULL AND u.keycloak_subject = $2))`,
    [
      typeof payload.sid === "string" ? payload.sid : null,
      typeof payload.sub === "string" ? payload.sub : null,
    ],
  );
}
