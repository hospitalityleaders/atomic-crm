import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import {
  beginOidcLogin,
  completeOidcLogin,
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
import { workspaceRouter } from "./workspace-routes.js";

const app = express();
const port = Number(process.env.PORT ?? 3000);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function trustProxySetting() {
  const value = String(process.env.TRUST_PROXY ?? "1").trim();
  if (["0", "false", "off"].includes(value.toLowerCase())) return false;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}

app.set("trust proxy", trustProxySetting());

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.get("/api/ready", async (_req, res) => {
  await db.query("SELECT 1");
  res.json({ status: "ready" });
});
app.get("/api/runtime", async (_req, res) => {
  const result = await db.query(
    `SELECT meta_title, meta_description, landing_headline, landing_subtitle,
            privacy_url, cookie_url, terms_url, imprint_url
     FROM crm_runtime_settings WHERE id = TRUE`,
  );
  res.json({
    ...result.rows[0],
    oidcConfigured: oidcConfigured(),
  });
});

app.get("/auth/login", (req, res) => beginOidcLogin(req, res));
app.get("/auth/register", (req, res) => beginOidcLogin(req, res, true));
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
app.get("/api/admin/runtime", requireSession, async (_req, res) => {
  if (!res.locals.session.platformAdmin) {
    return res
      .status(403)
      .json({ error: "Holedo platform administrator access required" });
  }
  const [settings, navigation] = await Promise.all([
    db.query("SELECT * FROM crm_runtime_settings WHERE id = TRUE"),
    db.query(
      "SELECT id, label, url, sort_order, enabled FROM crm_navigation ORDER BY sort_order, id",
    ),
  ]);
  res.json({ data: { ...settings.rows[0], navigation: navigation.rows } });
});
app.put("/api/admin/runtime", requireSession, async (req, res) => {
  if (!res.locals.session.platformAdmin) {
    return res
      .status(403)
      .json({ error: "Holedo platform administrator access required" });
  }
  const allowed = [
    "meta_title",
    "meta_description",
    "landing_headline",
    "landing_subtitle",
    "privacy_url",
    "cookie_url",
    "terms_url",
    "imprint_url",
  ];
  const values = allowed.map((key) => String(req.body?.[key] ?? ""));
  const settings = await db.query(
    `UPDATE crm_runtime_settings SET
      meta_title = $1, meta_description = $2, landing_headline = $3,
      landing_subtitle = $4, privacy_url = $5, cookie_url = $6,
      terms_url = $7, imprint_url = $8, updated_at = NOW()
     WHERE id = TRUE RETURNING *`,
    values,
  );
  res.json({ data: settings.rows[0] });
});
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
app.use(express.static(dist, { index: false }));
app.get("*splat", (_req, res) => res.sendFile(path.join(dist, "index.html")));

app.use(
  (
    error: Error & { status?: number },
    _req: Request,
    res: Response,
    _next: NextFunction,
  ) => {
    console.error(error);
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
