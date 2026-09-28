import crypto from "node:crypto";
import type pg from "pg";

const defaultStages = [
  { name: "New lead", kind: "open" },
  { name: "Interested", kind: "open" },
  { name: "Proposal", kind: "open" },
  { name: "Accepted", kind: "won" },
  { name: "Declined", kind: "lost" },
] as const;

export async function ensureWorkspaceSale(
  client: pg.PoolClient,
  workspaceId: string,
  userId: string,
  administrator = true,
) {
  const user = await client.query(
    "SELECT email, first_name, last_name, display_name FROM crm_users WHERE id = $1",
    [userId],
  );
  const row = user.rows[0];
  const names = String(row?.display_name ?? "Holedo member").split(/\s+/);
  const result = await client.query(
    `INSERT INTO sales (workspace_id, crm_user_id, first_name, last_name, email, administrator)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (workspace_id, crm_user_id) DO UPDATE
       SET email = EXCLUDED.email,
           first_name = EXCLUDED.first_name,
           last_name = EXCLUDED.last_name,
           administrator = EXCLUDED.administrator
     RETURNING id`,
    [
      workspaceId,
      userId,
      row?.first_name || names[0] || "Holedo",
      row?.last_name || names.slice(1).join(" ") || "member",
      row?.email || "",
      administrator,
    ],
  );
  return result.rows[0].id as number;
}

export async function seedWorkspace(
  client: pg.PoolClient,
  workspaceId: string,
  ownerUserId: string,
) {
  await ensureWorkspaceSale(client, workspaceId, ownerUserId);

  const existing = await client.query(
    "SELECT id FROM crm_pipelines WHERE workspace_id = $1 AND is_primary",
    [workspaceId],
  );
  let pipelineId = existing.rows[0]?.id as string | undefined;
  if (!pipelineId) {
    pipelineId = crypto.randomUUID();
    await client.query(
      "INSERT INTO crm_pipelines (id, workspace_id, name, is_primary) VALUES ($1, $2, 'Sales pipeline', TRUE)",
      [pipelineId, workspaceId],
    );
  }

  const stageRows = await client.query(
    "SELECT id, name, stage_kind FROM crm_pipeline_stages WHERE workspace_id = $1 AND pipeline_id = $2 ORDER BY position",
    [workspaceId, pipelineId],
  );
  let stages = stageRows.rows as Array<{
    id: string;
    name: string;
    stage_kind: "open" | "won" | "lost";
  }>;
  if (!stages.length) {
    stages = [];
    for (const [index, stage] of defaultStages.entries()) {
      const id = crypto.randomUUID();
      await client.query(
        `INSERT INTO crm_pipeline_stages
          (id, workspace_id, pipeline_id, name, stage_kind, position)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, workspaceId, pipelineId, stage.name, stage.kind, index + 1],
      );
      stages.push({ id, name: stage.name, stage_kind: stage.kind });
    }
  }

  const config = {
    title: "Holedo CRM",
    lightModeLogo: "/assets/branding/1gc-holedo-icon-for-dark-bg.png",
    darkModeLogo: "/assets/branding/1gc-holedo-icon-for-dark-bg.png",
    currency: "EUR",
    companySectors: [
      "Individual Hotel",
      "Small Hotel Group",
      "Global Hotel Group",
      "Restaurants",
      "Cruise",
      "Spa",
      "Services",
    ].map((label) => ({
      value: label.toLowerCase().replace(/\s+/g, "-"),
      label,
    })),
    dealCategories: ["Events", "Corporate", "Groups", "Leisure", "Other"].map(
      (label) => ({ value: label.toLowerCase(), label }),
    ),
    dealStages: stages.map((stage) => ({
      value: stage.id,
      label: stage.name,
      kind: stage.stage_kind,
    })),
    dealPipelineStatuses: stages
      .filter((stage) => stage.stage_kind === "won")
      .map((stage) => stage.id),
    noteStatuses: [
      { value: "cold", label: "Cold", color: "#32a3fd" },
      { value: "warm", label: "Warm", color: "#7dc81b" },
      { value: "hot", label: "Hot", color: "#fd3732" },
    ],
    taskTypes: [
      "Phone call",
      "Email",
      "Meeting",
      "Video call",
      "Follow-up",
    ].map((label) => ({
      value: label.toLowerCase().replace(/\s+/g, "-"),
      label,
    })),
  };
  await client.query(
    `INSERT INTO configuration (workspace_id, config)
     VALUES ($1, $2)
     ON CONFLICT (workspace_id) DO NOTHING`,
    [workspaceId, config],
  );
}
