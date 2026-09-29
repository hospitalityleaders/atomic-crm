import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrationDb } from "./db.js";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = path.join(currentDirectory, "migrations");
const lockId = Number(process.env.MIGRATION_LOCK_ID ?? 2_042_609_28);

function quoteIdentifier(value: string, name: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(value)) {
    throw new Error(`${name} must be a valid PostgreSQL identifier`);
  }
  return `"${value.replaceAll('"', '""')}"`;
}

async function grantApplicationPrivileges(client: {
  query: (text: string, values?: unknown[]) => Promise<unknown>;
}) {
  const applicationUser = process.env.DB_USER;
  const initializationUser =
    process.env.DB_MIGRATION_USER ?? process.env.DB_USER;
  const databaseName = process.env.DB_NAME;
  const schemaName = process.env.DB_SCHEMA?.trim() || "public";
  if (!applicationUser || !databaseName) {
    throw new Error("DB_USER and DB_NAME are required for database grants");
  }
  if (initializationUser === applicationUser) return;

  const role = quoteIdentifier(applicationUser, "DB_USER");
  const database = quoteIdentifier(databaseName, "DB_NAME");
  const schema = quoteIdentifier(schemaName, "DB_SCHEMA");

  await client.query(`GRANT CONNECT ON DATABASE ${database} TO ${role}`);
  await client.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`);
  await client.query(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${schema} TO ${role}`,
  );
  await client.query(
    `GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA ${schema} TO ${role}`,
  );
  await client.query(
    `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ${schema} TO ${role}`,
  );
  await client.query(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${role}`,
  );
  await client.query(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ${role}`,
  );
  await client.query(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schema} GRANT EXECUTE ON FUNCTIONS TO ${role}`,
  );
}

async function migrate() {
  const client = await migrationDb.connect();
  try {
    const schemaName = process.env.DB_SCHEMA?.trim() || "public";
    const schema = quoteIdentifier(schemaName, "DB_SCHEMA");
    const existingSchema = await client.query(
      "SELECT 1 FROM pg_namespace WHERE nspname = $1",
      [schemaName],
    );
    if (!existingSchema.rowCount) {
      await client.query(`CREATE SCHEMA ${schema}`);
      console.warn(`Created database schema ${schemaName}`);
    }
    const privilege = await client.query<{ ready: boolean }>(
      `SELECT has_schema_privilege(current_user, $1, 'USAGE')
          AND has_schema_privilege(current_user, $1, 'CREATE') AS ready`,
      [schemaName],
    );
    if (!privilege.rows[0]?.ready) {
      throw new Error(
        `Database user cannot create tables in the existing ${schemaName} schema`,
      );
    }
    await client.query(`SET search_path TO ${schema}, public`);
    await client.query("SELECT pg_advisory_lock($1)", [lockId]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS crm_schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    const files = (await fs.readdir(migrationsDirectory))
      .filter((file) => file.endsWith(".sql"))
      .sort();
    for (const filename of files) {
      const exists = await client.query(
        "SELECT 1 FROM crm_schema_migrations WHERE filename = $1",
        [filename],
      );
      if (exists.rowCount) continue;
      const sql = await fs.readFile(
        path.join(migrationsDirectory, filename),
        "utf8",
      );
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO crm_schema_migrations (filename) VALUES ($1)",
          [filename],
        );
        await client.query("COMMIT");
        console.warn(`Applied migration ${filename}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
    await grantApplicationPrivileges(client);
  } finally {
    await client
      .query("SELECT pg_advisory_unlock($1)", [lockId])
      .catch(() => undefined);
    client.release();
    await migrationDb.end();
  }
}

migrate().catch((error) => {
  console.error("Database initialization failed", error);
  process.exitCode = 1;
});
