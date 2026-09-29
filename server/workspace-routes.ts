import { Router } from "express";
import type { CrmSession } from "./auth.js";
import { db } from "./db.js";
import { ensureWorkspaceSale, seedWorkspace } from "./workspaces.js";

function sessionFrom(res: { locals: Record<string, unknown> }) {
  return res.locals.session as CrmSession;
}

export const workspaceRouter = Router();

workspaceRouter.get("/", async (_req, res) => {
  const session = sessionFrom(res);
  const result = await db.query(
    `SELECT w.id, w.name, w.workspace_type, m.role,
            w.id = $2 AS active
     FROM crm_workspace_members m
     JOIN crm_workspaces w ON w.id = m.workspace_id
     WHERE m.user_id = $1 AND m.status = 'active'
     ORDER BY w.workspace_type DESC, w.name`,
    [session.userId, session.workspaceId],
  );
  res.json({ data: result.rows });
});

workspaceRouter.post("/company", async (req, res) => {
  const session = sessionFrom(res);
  if (process.env.ALLOW_SELF_SERVICE_COMPANY_WORKSPACES !== "true") {
    return res
      .status(403)
      .json({ error: "Company workspace creation is disabled" });
  }
  const name = String(req.body?.name ?? "")
    .trim()
    .slice(0, 160);
  if (!name) return res.status(400).json({ error: "Company name is required" });
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query(
      `SELECT 1 FROM crm_workspace_members
       WHERE user_id = $1 AND workspace_type = 'company' LIMIT 1`,
      [session.userId],
    );
    if (existing.rowCount) {
      throw Object.assign(
        new Error("A user can belong to only one company workspace"),
        { status: 409 },
      );
    }
    const workspace = await client.query(
      `INSERT INTO crm_workspaces (workspace_type, name, owner_user_id)
       VALUES ('company', $1, $2) RETURNING id, name, workspace_type`,
      [name, session.userId],
    );
    const row = workspace.rows[0];
    await client.query(
      `INSERT INTO crm_workspace_members
        (workspace_id, workspace_type, user_id, role)
       VALUES ($1, 'company', $2, 'owner')`,
      [row.id, session.userId],
    );
    await client.query("SELECT set_config('app.workspace_id', $1, true)", [
      row.id,
    ]);
    await seedWorkspace(client, row.id, session.userId);
    await client.query("COMMIT");
    return res.status(201).json({ data: { ...row, role: "owner" } });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

workspaceRouter.post("/:workspaceId/members", async (req, res) => {
  const session = sessionFrom(res);
  const workspaceId =
    req.params.workspaceId === "current"
      ? session.workspaceId
      : req.params.workspaceId;
  if (
    session.workspaceId !== workspaceId ||
    !["owner", "administrator"].includes(session.role)
  ) {
    return res
      .status(403)
      .json({ error: "Workspace administrator access required" });
  }
  const email = String(req.body?.email ?? "")
    .trim()
    .toLowerCase();
  const role = String(req.body?.role ?? "editor");
  if (!email || !["administrator", "editor", "viewer"].includes(role)) {
    return res
      .status(400)
      .json({ error: "A valid email and role are required" });
  }
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const user = await client.query(
      "SELECT id FROM crm_users WHERE lower(email) = $1",
      [email],
    );
    if (!user.rows[0]) {
      await client.query(
        `INSERT INTO crm_workspace_invitations
          (workspace_id, email, role, invited_by_user_id, expires_at)
         VALUES ($1, $2, $3, $4, NOW() + INTERVAL '14 days')
         ON CONFLICT (workspace_id, lower(email))
           WHERE accepted_at IS NULL AND revoked_at IS NULL
         DO UPDATE SET role = EXCLUDED.role, expires_at = EXCLUDED.expires_at`,
        [session.workspaceId, email, role, session.userId],
      );
      await client.query("COMMIT");
      return res.status(202).json({ data: { email, role, status: "invited" } });
    }
    await client.query(
      `INSERT INTO crm_workspace_members
        (workspace_id, workspace_type, user_id, role, status)
       VALUES ($1, 'company', $2, $3, 'active')
       ON CONFLICT (workspace_id, user_id) DO UPDATE
         SET role = EXCLUDED.role, status = 'active', updated_at = NOW()`,
      [session.workspaceId, user.rows[0].id, role],
    );
    await client.query("SELECT set_config('app.workspace_id', $1, true)", [
      session.workspaceId,
    ]);
    const saleId = await ensureWorkspaceSale(
      client,
      session.workspaceId,
      user.rows[0].id,
      role === "administrator",
    );
    await client.query("COMMIT");
    return res.status(201).json({
      data: {
        id: saleId,
        email,
        administrator: role === "administrator",
        disabled: false,
        status: "active",
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});
