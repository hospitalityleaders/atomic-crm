import "dotenv/config";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import {
  beginOidcLogin,
  cleanReturnTo,
  completeOidcLogin,
  currentAuthMode,
  getCrmSession,
  handleBackchannelLogout,
  logoutCrmSession,
  oidcConfigured,
  switchWorkspace,
} from "./auth.js";
import { db } from "./db.js";
import { dealsRouter } from "./deals.js";
import {
  ensureStorageBucket,
  getFileUrl,
  uploadFile,
} from "./object-storage.js";
import { resourcesRouter } from "./resources.js";
import { renderRuntimeHtml } from "./runtime-html.js";
import { workspaceRouter } from "./workspace-routes.js";

const app = express();
const port = Number(process.env.PORT ?? 3000);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adminCookie = "holedo_crm_admin";
const adminJson = express.json({ limit: "64kb" });

function trustProxySetting() {
  const value = String(process.env.TRUST_PROXY ?? "1").trim();
  if (["0", "false", "off"].includes(value.toLowerCase())) return false;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}

function parseCookies(req: Request) {
  return Object.fromEntries(
    (req.headers.cookie ?? "")
      .split(";")
      .map((part) => part.trim().split("=").map(decodeURIComponent))
      .filter((part) => part.length === 2),
  );
}

function adminSessionSecret() {
  return process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_TOKEN || "";
}

function createAdminSession() {
  const payload = Buffer.from(
    JSON.stringify({ exp: Date.now() + 8 * 60 * 60 * 1000 }),
  ).toString("base64url");
  const signature = crypto
    .createHmac("sha256", adminSessionSecret())
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

function hasAdminSession(req: Request) {
  const value = parseCookies(req)[adminCookie];
  if (!value || !adminSessionSecret()) return false;
  const [payload, suppliedSignature] = value.split(".");
  if (!payload || !suppliedSignature) return false;
  const expectedSignature = crypto
    .createHmac("sha256", adminSessionSecret())
    .update(payload)
    .digest("base64url");
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (
    supplied.length !== expected.length ||
    !crypto.timingSafeEqual(supplied, expected)
  )
    return false;
  try {
    return (
      Number(JSON.parse(Buffer.from(payload, "base64url").toString()).exp) >
      Date.now()
    );
  } catch {
    return false;
  }
}

async function requireRuntimeAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (hasAdminSession(req)) return next();
  if (currentAuthMode() === "oidc") {
    const session = await getCrmSession(req);
    if (session?.platformAdmin) {
      res.locals.session = session;
      return next();
    }
  }
  return res.status(401).json({ error: "Admin access required" });
}

function sameOrigin(req: Request) {
  const origin = req.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === req.get("host");
  } catch {
    return false;
  }
}

function runtimeColor(value: unknown, fallback: string) {
  const color = String(value ?? "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : fallback;
}

function runtimeInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(parsed)));
}

app.set("trust proxy", trustProxySetting());

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.get("/api/ready", async (_req, res) => {
  await db.query("SELECT 1");
  res.json({ status: "ready" });
});
app.get("/api/runtime", async (_req, res) => {
  const [result, navigation] = await Promise.all([
    db.query(
      `SELECT meta_title, meta_description, landing_headline, landing_subtitle,
              header_background_color, header_text_color,
              hero_background_color, hero_height, accent_color,
              site_icon_url, og_image_url, login_url, signup_url,
              hero_button_text, hero_button_url, head_code, footer_code,
              privacy_url, cookie_url, terms_url, imprint_url,
              privacy_settings_enabled
       FROM crm_runtime_settings WHERE id = TRUE`,
    ),
    db.query(
      `SELECT id, label, url, sort_order, enabled
       FROM crm_navigation WHERE enabled = TRUE ORDER BY sort_order, id`,
    ),
  ]);
  const settings = result.rows[0];
  const loginUrl =
    settings.login_url ||
    (currentAuthMode() === "oidc"
      ? "/auth/login?returnTo=%2Fworkspace"
      : process.env.HOLEDO_LOGIN_URL || "https://www.holedo.com/login/");
  const signupUrl =
    settings.signup_url ||
    (currentAuthMode() === "oidc"
      ? "/auth/register?returnTo=%2Fworkspace"
      : process.env.HOLEDO_SIGNUP_URL || "https://www.holedo.com/register/");
  res.json({
    ...settings,
    navigation: navigation.rows,
    oidcConfigured: oidcConfigured(),
    authMode: currentAuthMode(),
    loginUrl,
    signupUrl,
    hero_button_url: settings.hero_button_url || signupUrl,
  });
});

app.get("/auth/login", (req, res) => {
  if (currentAuthMode() === "demo")
    return res.redirect(302, cleanReturnTo(req.query.returnTo));
  if (!oidcConfigured())
    return res.redirect(
      302,
      process.env.HOLEDO_LOGIN_URL || "https://www.holedo.com/login/",
    );
  return beginOidcLogin(req, res);
});
app.get("/auth/register", (req, res) => {
  if (currentAuthMode() === "demo")
    return res.redirect(302, cleanReturnTo(req.query.returnTo));
  if (!oidcConfigured())
    return res.redirect(
      302,
      process.env.HOLEDO_SIGNUP_URL || "https://www.holedo.com/register/",
    );
  return beginOidcLogin(req, res, true);
});
app.get("/auth/callback", completeOidcLogin);
app.get("/auth/logout", logoutCrmSession);
app.get("/auth/account", (_req, res) => {
  const issuer = process.env.OIDC_ISSUER_URL;
  res.redirect(302, issuer ? `${issuer.replace(/\/$/, "")}/account` : "/");
});
app.post(
  "/auth/backchannel-logout",
  express.urlencoded({ extended: false }),
  async (req, res) => {
    await handleBackchannelLogout(req.body?.logout_token);
    res.sendStatus(200);
  },
);

const jsonBody = express.json({ limit: "2mb" });
app.use((req, res, next) => {
  if (req.path === "/api/files") return next();
  return jsonBody(req, res, next);
});

async function requireSession(req: Request, res: Response, next: NextFunction) {
  const session = await getCrmSession(req);
  if (!session)
    return res.status(401).json({ error: "Authentication required" });
  res.locals.session = session;
  next();
}

app.get("/api/session", requireSession, (_req, res) => {
  res.json({ data: res.locals.session });
});
app.post("/api/admin/session", adminJson, (req, res) => {
  if (!sameOrigin(req))
    return res.status(403).json({ error: "Origin rejected" });
  const expectedToken = process.env.ADMIN_TOKEN;
  if (!expectedToken)
    return res.status(503).json({ error: "Admin access is not configured" });
  const supplied = Buffer.from(String(req.body?.token ?? ""));
  const expected = Buffer.from(expectedToken);
  if (
    supplied.length !== expected.length ||
    !crypto.timingSafeEqual(supplied, expected)
  )
    return res.status(401).json({ error: "Unauthorized" });
  res.cookie(adminCookie, createAdminSession(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 8 * 60 * 60 * 1000,
    path: "/",
  });
  res.json({ ok: true });
});

app.get("/api/admin/runtime", requireRuntimeAdmin, async (_req, res) => {
  const [settings, navigation] = await Promise.all([
    db.query("SELECT * FROM crm_runtime_settings WHERE id = TRUE"),
    db.query(
      "SELECT id, label, url, sort_order, enabled FROM crm_navigation ORDER BY sort_order, id",
    ),
  ]);
  res.json({ data: { ...settings.rows[0], navigation: navigation.rows } });
});
app.put(
  "/api/admin/runtime",
  requireRuntimeAdmin,
  adminJson,
  async (req, res) => {
    if (!sameOrigin(req))
      return res.status(403).json({ error: "Origin rejected" });
    const allowed = [
      "meta_title",
      "meta_description",
      "landing_headline",
      "landing_subtitle",
      "site_icon_url",
      "og_image_url",
      "login_url",
      "signup_url",
      "hero_button_text",
      "hero_button_url",
      "head_code",
      "footer_code",
      "privacy_url",
      "cookie_url",
      "terms_url",
      "imprint_url",
    ];
    const values = allowed.map((key) => String(req.body?.[key] ?? ""));
    const headerBackgroundColor = runtimeColor(
      req.body?.header_background_color,
      "#384677",
    );
    const headerTextColor = runtimeColor(
      req.body?.header_text_color,
      "#ffffff",
    );
    const heroBackgroundColor = runtimeColor(
      req.body?.hero_background_color,
      "#384677",
    );
    const heroHeight = runtimeInteger(req.body?.hero_height, 560, 360, 1200);
    const accentColor = runtimeColor(req.body?.accent_color, "#32a3fd");
    const privacySettingsEnabled = req.body?.privacy_settings_enabled !== false;
    const navigation = Array.isArray(req.body?.navigation)
      ? req.body.navigation.slice(0, 30)
      : [];
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const settings = await client.query(
        `UPDATE crm_runtime_settings SET
        meta_title = $1, meta_description = $2, landing_headline = $3,
        landing_subtitle = $4, site_icon_url = $5, og_image_url = $6,
        login_url = $7, signup_url = $8, hero_button_text = $9,
        hero_button_url = $10, head_code = $11, footer_code = $12,
        privacy_url = $13, cookie_url = $14, terms_url = $15,
        imprint_url = $16, header_background_color = $17,
        header_text_color = $18, hero_background_color = $19,
        hero_height = $20, accent_color = $21,
        privacy_settings_enabled = $22,
        updated_at = NOW()
       WHERE id = TRUE RETURNING *`,
        [
          ...values,
          headerBackgroundColor,
          headerTextColor,
          heroBackgroundColor,
          heroHeight,
          accentColor,
          privacySettingsEnabled,
        ],
      );
      await client.query("DELETE FROM crm_navigation");
      for (const [index, item] of navigation.entries()) {
        const label = String(item?.label ?? "")
          .trim()
          .slice(0, 80);
        const url = String(item?.url ?? "")
          .trim()
          .slice(0, 1000);
        if (!label || !url) continue;
        await client.query(
          `INSERT INTO crm_navigation (label, url, sort_order, enabled)
         VALUES ($1, $2, $3, $4)`,
          [
            label,
            url,
            Number.isFinite(Number(item?.sort_order))
              ? Number(item.sort_order)
              : index * 10,
            item?.enabled !== false,
          ],
        );
      }
      await client.query("COMMIT");
      const savedNavigation = await db.query(
        "SELECT id, label, url, sort_order, enabled FROM crm_navigation ORDER BY sort_order, id",
      );
      res.json({
        data: { ...settings.rows[0], navigation: savedNavigation.rows },
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },
);
app.post("/api/session/workspace", requireSession, async (req, res) => {
  const changed = await switchWorkspace(
    req,
    String(req.body?.workspaceId ?? ""),
  );
  if (!changed)
    return res.status(403).json({ error: "Workspace access denied" });
  res.json({ data: { workspaceId: req.body.workspaceId } });
});

app.use("/api/workspaces", requireSession, workspaceRouter);
app.use("/api/deals", requireSession, dealsRouter);
app.use("/api/resources", requireSession, resourcesRouter);

app.post(
  "/api/files",
  requireSession,
  express.raw({
    type: () => true,
    limit: process.env.FILE_UPLOAD_LIMIT || "10mb",
  }),
  async (req, res) => {
    const session = res.locals.session;
    if (session.role === "viewer")
      return res.status(403).json({ error: "Read-only workspace access" });
    const filename = decodeURIComponent(
      String(req.headers["x-file-name"] ?? "upload"),
    );
    const mimeType = String(
      req.headers["content-type"] ?? "application/octet-stream",
    );
    const data = await uploadFile(
      session,
      req.body as Buffer,
      filename,
      mimeType,
    );
    res.status(201).json({ data });
  },
);
app.get("/api/files/:id", requireSession, async (req, res) => {
  const url = await getFileUrl(res.locals.session, String(req.params.id));
  if (!url) return res.status(404).json({ error: "File not found" });
  res.redirect(302, url);
});

const dist = path.join(root, "dist");
const indexHtml = readFile(path.join(dist, "index.html"), "utf8");
app.use(express.static(dist, { index: false }));
app.get("*splat", async (req, res) => {
  const [source, runtime] = await Promise.all([
    indexHtml,
    db.query(
      `SELECT meta_title, meta_description, header_background_color,
              site_icon_url, og_image_url, head_code, footer_code
       FROM crm_runtime_settings WHERE id = TRUE`,
    ),
  ]);
  const injectCode = !(req.path === "/admin" || req.path.startsWith("/admin/"));
  res
    .type("html")
    .send(renderRuntimeHtml(source, runtime.rows[0] ?? {}, injectCode));
});

app.use(
  (
    error: Error & { status?: number },
    _req: Request,
    res: Response,
    _next: NextFunction,
  ) => {
    if (!error.status || error.status >= 500) console.error(error);
    res
      .status(error.status ?? 500)
      .json({ error: error.message || "Unexpected server error" });
  },
);

ensureStorageBucket()
  .then(() => {
    const server = app.listen(port, () => {
      console.warn(`Holedo CRM listening on http://localhost:${port}`);
    });

    let shuttingDown = false;
    const shutdown = (signal: string) => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.warn(`${signal} received; shutting down Holedo CRM`);
      const forcedExit = setTimeout(() => {
        console.error("Graceful shutdown timed out");
        process.exit(1);
      }, 10_000);
      forcedExit.unref();
      server.close(async (error) => {
        clearTimeout(forcedExit);
        await db.end().catch(() => undefined);
        if (error) {
          console.error("HTTP server shutdown failed", error);
          process.exit(1);
        }
        process.exit(0);
      });
    };

    process.once("SIGTERM", () => shutdown("SIGTERM"));
    process.once("SIGINT", () => shutdown("SIGINT"));
  })
  .catch((error) => {
    console.error("Object storage initialization failed", error);
    process.exitCode = 1;
  });
