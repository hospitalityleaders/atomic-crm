import crypto from "node:crypto";
import type pg from "pg";

type StageInput = {
  value?: string;
  label: string;
  kind?: "open" | "won" | "lost";
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function getWorkspaceConfiguration(
  client: pg.PoolClient,
  workspaceId: string,
) {
  const result = await client.query(
    "SELECT config FROM configuration WHERE workspace_id = $1",
    [workspaceId],
  );
  return result.rows[0]?.config ?? {};
}

export async function updateWorkspaceConfiguration(
  client: pg.PoolClient,
  workspaceId: string,
  input: Record<string, unknown>,
) {
  const pipeline = await client.query(
    "SELECT id FROM crm_pipelines WHERE workspace_id = $1 AND is_primary",
    [workspaceId],
  );
  const pipelineId = pipeline.rows[0]?.id as string | undefined;
  if (!pipelineId) throw new Error("The workspace has no primary pipeline");

  const existingResult = await client.query(
    "SELECT id, stage_kind FROM crm_pipeline_stages WHERE workspace_id = $1 AND pipeline_id = $2",
    [workspaceId, pipelineId],
  );
  const existing = new Map<string, { stage_kind: "open" | "won" | "lost" }>(
    existingResult.rows.map((row) => [row.id, row]),
  );
  const requestedPipelineStatuses = new Set(
    Array.isArray(input.dealPipelineStatuses)
      ? input.dealPipelineStatuses.map(String)
      : [],
  );
  const normalizedStages: Array<Required<StageInput>> = [];
  const requestedIds = new Set<string>();

  for (const [position, raw] of (Array.isArray(input.dealStages)
    ? input.dealStages
    : []
  ).entries()) {
    const stage = raw as StageInput;
    if (!stage.label?.trim()) continue;
    const originalValue = stage.value ?? "";
    const id =
      uuidPattern.test(originalValue) && existing.has(originalValue)
        ? originalValue
        : crypto.randomUUID();
    const kind =
      stage.kind ??
      (requestedPipelineStatuses.has(originalValue)
        ? "won"
        : /^(lost|declined)$/i.test(stage.label.trim())
          ? "lost"
          : (existing.get(id)?.stage_kind ?? "open"));
    await client.query(
      `INSERT INTO crm_pipeline_stages
        (id, workspace_id, pipeline_id, name, stage_kind, position, active)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE)
       ON CONFLICT (id) DO UPDATE
         SET name = EXCLUDED.name,
             stage_kind = EXCLUDED.stage_kind,
             position = EXCLUDED.position,
             active = TRUE,
             updated_at = NOW()`,
      [id, workspaceId, pipelineId, stage.label.trim(), kind, position + 1],
    );
    requestedIds.add(id);
    normalizedStages.push({ value: id, label: stage.label.trim(), kind });
  }

  for (const id of existing.keys()) {
    if (requestedIds.has(id)) continue;
    const inUse = await client.query(
      "SELECT 1 FROM deals WHERE workspace_id = $1 AND (stage = $2 OR archived_stage_id = $2) LIMIT 1",
      [workspaceId, id],
    );
    if (inUse.rowCount) {
      await client.query(
        "UPDATE crm_pipeline_stages SET active = FALSE, updated_at = NOW() WHERE workspace_id = $1 AND id = $2",
        [workspaceId, id],
      );
    } else {
      await client.query(
        "DELETE FROM crm_pipeline_stages WHERE workspace_id = $1 AND id = $2",
        [workspaceId, id],
      );
    }
  }

  const normalizedStatusIds = normalizedStages
    .filter((stage) => stage.kind === "won")
    .map((stage) => stage.value);
  const config = {
    ...input,
    dealStages: normalizedStages,
    dealPipelineStatuses: normalizedStatusIds,
  };
  await client.query(
    `INSERT INTO configuration (workspace_id, config, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (workspace_id) DO UPDATE
       SET config = EXCLUDED.config, updated_at = NOW()`,
    [workspaceId, config],
  );
  return config;
}
