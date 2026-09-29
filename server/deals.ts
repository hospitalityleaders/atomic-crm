import { Router } from "express";
import type { CrmSession } from "./auth.js";
import { withWorkspace } from "./tenant.js";

function sessionFrom(res: { locals: Record<string, unknown> }) {
  return res.locals.session as CrmSession;
}

export const dealsRouter = Router();

dealsRouter.post("/:id/archive", async (req, res) => {
  const session = sessionFrom(res);
  if (session.role === "viewer")
    return res.status(403).json({ error: "Read-only workspace access" });
  const result = await withWorkspace(session, (client) =>
    client.query(
      `UPDATE deals
       SET archived_at = COALESCE(archived_at, NOW()),
           archived_by_user_id = $2,
           archived_stage_id = stage,
           archived_position = index,
           updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [req.params.id, session.userId],
    ),
  );
  if (!result.rows[0]) return res.status(404).json({ error: "Deal not found" });
  res.json({ data: result.rows[0] });
});

dealsRouter.post("/:id/restore", async (req, res) => {
  const session = sessionFrom(res);
  if (session.role === "viewer")
    return res.status(403).json({ error: "Read-only workspace access" });
  const result = await withWorkspace(session, (client) =>
    client.query(
      `UPDATE deals
       SET stage = COALESCE(archived_stage_id, stage),
           index = COALESCE(archived_position, index),
           archived_at = NULL,
           archived_by_user_id = NULL,
           archived_stage_id = NULL,
           archived_position = NULL,
           updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [req.params.id],
    ),
  );
  if (!result.rows[0]) return res.status(404).json({ error: "Deal not found" });
  res.json({ data: result.rows[0] });
});
