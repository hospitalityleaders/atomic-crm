import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrationDb } from "./db.js";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = path.join(currentDirectory, "migrations");
const lockId = Number(process.env.MIGRATION_LOCK_ID ?? 2_042_609_28);

async function migrate() {
  const client = await migrationDb.connect();
  try {
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
  } finally {
    await client
      .query("SELECT pg_advisory_unlock($1)", [lockId])
      .catch(() => undefined);
    client.release();
    await migrationDb.end();
  }
}

migrate().catch((error) => {
  console.error("Database migration failed", error);
  process.exitCode = 1;
});
