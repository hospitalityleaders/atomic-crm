import type { Request, Response } from "express";
import { Router } from "express";
import type pg from "pg";
import type { CrmSession } from "./auth.js";
import {
  getWorkspaceConfiguration,
  updateWorkspaceConfiguration,
} from "./configuration.js";
import { withWorkspace } from "./tenant.js";

type ResourceDefinition = {
  table: string;
  readFrom?: string;
  columns: string[];
  readColumns?: string[];
  searchColumns?: string[];
  readOnly?: boolean;
};

const commonCompanyColumns = [
  "id",
  "created_at",
  "name",
  "sector",
  "size",
  "linkedin_url",
  "website",
  "phone_number",
  "address",
  "zipcode",
  "city",
  "state_abbr",
  "sales_id",
  "context_links",
  "country",
  "description",
  "revenue",
  "tax_identifier",
  "logo",
];
const commonContactColumns = [
  "id",
  "first_name",
  "last_name",
  "gender",
  "title",
  "background",
  "avatar",
  "first_seen",
  "last_seen",
  "has_newsletter",
  "status",
  "tags",
  "company_id",
  "sales_id",
  "linkedin_url",
  "email_jsonb",
  "phone_jsonb",
];

const resources: Record<string, ResourceDefinition> = {
  companies: {
    table: "companies",
    readFrom: "companies_summary",
    columns: commonCompanyColumns,
    readColumns: [...commonCompanyColumns, "nb_deals", "nb_contacts"],
    searchColumns: [
      "name",
      "phone_number",
      "website",
      "zipcode",
      "city",
      "state_abbr",
    ],
  },
  contacts: {
    table: "contacts",
    readFrom: "contacts_summary",
    columns: commonContactColumns,
    readColumns: [
      ...commonContactColumns,
      "email_fts",
      "phone_fts",
      "company_name",
      "nb_tasks",
    ],
    searchColumns: [
      "first_name",
      "last_name",
      "company_name",
      "title",
      "email_fts",
      "phone_fts",
      "background",
    ],
  },
  contact_notes: {
    table: "contact_notes",
    columns: [
      "id",
      "contact_id",
      "text",
      "date",
      "sales_id",
      "status",
      "attachments",
    ],
  },
  deals: {
    table: "deals",
    columns: [
      "id",
      "pipeline_id",
      "name",
      "company_id",
      "contact_ids",
      "category",
      "stage",
      "description",
      "amount",
      "created_at",
      "updated_at",
      "archived_at",
      "archived_by_user_id",
      "archived_stage_id",
      "archived_position",
      "expected_closing_date",
      "sales_id",
      "index",
    ],
    searchColumns: ["name", "category", "description"],
  },
  deal_notes: {
    table: "deal_notes",
    columns: [
      "id",
      "deal_id",
      "type",
      "text",
      "date",
      "sales_id",
      "attachments",
    ],
  },
  tasks: {
    table: "tasks",
    columns: [
      "id",
      "contact_id",
      "type",
      "text",
      "due_date",
      "done_date",
      "sales_id",
    ],
  },
  sales: {
    table: "sales",
    columns: [
      "id",
      "crm_user_id",
      "first_name",
      "last_name",
      "email",
      "administrator",
      "avatar",
      "disabled",
      "secondary_emails",
    ],
    searchColumns: ["first_name", "last_name", "email"],
  },
  tags: { table: "tags", columns: ["id", "name", "color"] },
  activity_log: {
    table: "activity_log",
    columns: [
      "id",
      "type",
      "date",
      "company_id",
      "sales_id",
      "company",
      "contact",
      "deal",
      "contact_note",
      "deal_note",
    ],
    readOnly: true,
  },
};

function sessionFrom(res: Response) {
  return res.locals.session as CrmSession;
}

function canWrite(session: CrmSession) {
  return session.role !== "viewer";
}

function canWriteResource(session: CrmSession, resource: string) {
  if (!canWrite(session)) return false;
  if (resource === "sales") {
    return ["owner", "administrator"].includes(session.role);
  }
  return true;
}

function definition(resource: string) {
  const value = resources[resource];
  if (!value)
    throw Object.assign(new Error("Unknown CRM resource"), { status: 404 });
  return value;
}

function selectColumns(value: ResourceDefinition) {
  return (value.readColumns ?? value.columns)
    .map((column) => `"${column}"`)
    .join(", ");
}

function parseList(value: unknown) {
  if (Array.isArray(value)) return value;
  const text = String(value ?? "").replace(/^[({]|[)}]$/g, "");
  return text ? text.split(",").map((item) => item.trim()) : [];
}

function buildWhere(
  resource: ResourceDefinition,
  filter: Record<string, unknown>,
  values: unknown[],
) {
  const allowed = new Set(resource.readColumns ?? resource.columns);
  const clauses: string[] = [];
  const operators: Record<string, string> = {
    eq: "=",
    neq: "<>",
    gt: ">",
    gte: ">=",
    lt: "<",
    lte: "<=",
  };

  for (const [key, rawValue] of Object.entries(filter ?? {})) {
    if (key === "q") {
      const query = String(rawValue ?? "").trim();
      if (!query || !resource.searchColumns?.length) continue;
      values.push(`%${query}%`);
      const index = values.length;
      clauses.push(
        `(${resource.searchColumns.map((column) => `COALESCE("${column}"::TEXT, '') ILIKE $${index}`).join(" OR ")})`,
      );
      continue;
    }
    if (key === "@or") continue;
    const [column, ...operatorParts] = key.split("@");
    if (!column || !allowed.has(column)) continue;
    const operator = operatorParts.join(".") || "eq";
    if (operator === "is" || operator === "not.is") {
      clauses.push(`"${column}" IS ${operator === "not.is" ? "NOT " : ""}NULL`);
      continue;
    }
    if (operator === "in") {
      values.push(parseList(rawValue));
      clauses.push(`"${column}" = ANY($${values.length})`);
      continue;
    }
    if (operator === "cs") {
      values.push(parseList(rawValue).map(Number));
      clauses.push(`"${column}" @> $${values.length}::BIGINT[]`);
      continue;
    }
    if (operator === "ilike") {
      values.push(`%${String(rawValue ?? "")}%`);
      clauses.push(`COALESCE("${column}"::TEXT, '') ILIKE $${values.length}`);
      continue;
    }
    values.push(rawValue);
    clauses.push(`"${column}" ${operators[operator] ?? "="} $${values.length}`);
  }
  return clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
}

async function defaultCreateValues(
  client: pg.PoolClient,
  resource: string,
  session: CrmSession,
  data: Record<string, unknown>,
) {
  const result = { ...data };
  if (
    [
      "companies",
      "contacts",
      "contact_notes",
      "deals",
      "deal_notes",
      "tasks",
    ].includes(resource) &&
    result.sales_id == null
  ) {
    result.sales_id = session.saleId;
  }
  if (resource === "deals" && !result.pipeline_id) {
    const pipeline = await client.query(
      "SELECT id FROM crm_pipelines WHERE workspace_id = $1 AND is_primary",
      [session.workspaceId],
    );
    result.pipeline_id = pipeline.rows[0]?.id;
  }
  return result;
}

async function listResource(req: Request, res: Response) {
  const resourceName = String(req.params.resource);
  const resource = definition(resourceName);
  const session = sessionFrom(res);
  const page = Math.max(Number(req.query.page ?? 1), 1);
  const perPage = Math.min(Math.max(Number(req.query.perPage ?? 25), 1), 1000);
  const sort = String(req.query.sort ?? "id");
  const order =
    String(req.query.order ?? "ASC").toUpperCase() === "DESC" ? "DESC" : "ASC";
  const allowed = new Set(resource.readColumns ?? resource.columns);
  const sortColumn = allowed.has(sort) ? sort : "id";
  const filter = JSON.parse(String(req.query.filter ?? "{}")) as Record<
    string,
    unknown
  >;

  const result = await withWorkspace(session, async (client) => {
    const values: unknown[] = [];
    const where = buildWhere(resource, filter, values);
    const from = resource.readFrom ?? resource.table;
    const total = await client.query(
      `SELECT count(*)::INT AS count FROM "${from}" ${where}`,
      values,
    );
    values.push(perPage, (page - 1) * perPage);
    const rows = await client.query(
      `SELECT ${selectColumns(resource)} FROM "${from}" ${where}
       ORDER BY "${sortColumn}" ${order} NULLS LAST
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    return { data: rows.rows, total: total.rows[0].count as number };
  });
  res.json(result);
}

async function getResource(req: Request, res: Response) {
  const resource = definition(String(req.params.resource));
  const session = sessionFrom(res);
  const from = resource.readFrom ?? resource.table;
  const result = await withWorkspace(session, (client) =>
    client.query(
      `SELECT ${selectColumns(resource)} FROM "${from}" WHERE id = $1`,
      [req.params.id],
    ),
  );
  if (!result.rows[0])
    return res.status(404).json({ error: "Record not found" });
  res.json({ data: result.rows[0] });
}

async function createResource(req: Request, res: Response) {
  const resourceName = String(req.params.resource);
  const resource = definition(resourceName);
  if (resource.readOnly)
    return res.status(405).json({ error: "Read-only resource" });
  const session = sessionFrom(res);
  if (!canWriteResource(session, resourceName))
    return res.status(403).json({ error: "Read-only workspace access" });
  const result = await withWorkspace(session, async (client) => {
    const data = await defaultCreateValues(
      client,
      resourceName,
      session,
      req.body ?? {},
    );
    const columns = resource.columns.filter(
      (column) => column !== "id" && data[column] !== undefined,
    );
    const values = columns.map((column) => data[column]);
    const placeholders = columns.map((_, index) => `$${index + 2}`);
    return client.query(
      `INSERT INTO "${resource.table}" (workspace_id, ${columns.map((column) => `"${column}"`).join(", ")})
       VALUES ($1, ${placeholders.join(", ")}) RETURNING *`,
      [session.workspaceId, ...values],
    );
  });
  res.status(201).json({ data: result.rows[0] });
}

async function updateResource(req: Request, res: Response) {
  const resourceName = String(req.params.resource);
  const resource = definition(resourceName);
  if (resource.readOnly)
    return res.status(405).json({ error: "Read-only resource" });
  const session = sessionFrom(res);
  if (!canWriteResource(session, resourceName))
    return res.status(403).json({ error: "Read-only workspace access" });
  const columns = resource.columns.filter(
    (column) => column !== "id" && req.body?.[column] !== undefined,
  );
  if (!columns.length) return getResource(req, res);
  const values = columns.map((column) => req.body[column]);
  const assignments = columns.map(
    (column, index) => `"${column}" = $${index + 2}`,
  );
  const result = await withWorkspace(session, (client) =>
    client.query(
      `UPDATE "${resource.table}" SET ${assignments.join(", ")}
       WHERE id = $1 RETURNING *`,
      [req.params.id, ...values],
    ),
  );
  if (!result.rows[0])
    return res.status(404).json({ error: "Record not found" });
  res.json({ data: result.rows[0] });
}

async function deleteResource(req: Request, res: Response) {
  const resourceName = String(req.params.resource);
  const resource = definition(resourceName);
  if (resource.readOnly)
    return res.status(405).json({ error: "Read-only resource" });
  const session = sessionFrom(res);
  if (!canWriteResource(session, resourceName))
    return res.status(403).json({ error: "Read-only workspace access" });
  const result = await withWorkspace(session, (client) =>
    client.query(`DELETE FROM "${resource.table}" WHERE id = $1 RETURNING *`, [
      req.params.id,
    ]),
  );
  if (!result.rows[0])
    return res.status(404).json({ error: "Record not found" });
  res.json({ data: result.rows[0] });
}

export const resourcesRouter = Router();

resourcesRouter.get("/configuration/1", async (_req, res) => {
  const session = sessionFrom(res);
  const config = await withWorkspace(session, (client) =>
    getWorkspaceConfiguration(client, session.workspaceId),
  );
  res.json({ data: { id: 1, config } });
});

resourcesRouter.put("/configuration/1", async (req, res) => {
  const session = sessionFrom(res);
  if (!["owner", "administrator"].includes(session.role)) {
    return res
      .status(403)
      .json({ error: "Workspace administrator access required" });
  }
  const config = await withWorkspace(session, (client) =>
    updateWorkspaceConfiguration(
      client,
      session.workspaceId,
      req.body?.config ?? {},
    ),
  );
  res.json({ data: { id: 1, config } });
});

resourcesRouter.get("/:resource", listResource);
resourcesRouter.get("/:resource/:id", getResource);
resourcesRouter.post("/:resource", createResource);
resourcesRouter.put("/:resource/:id", updateResource);
resourcesRouter.delete("/:resource/:id", deleteResource);
