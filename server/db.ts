import pg from "pg";

const sslEnabled = !["0", "false", "off"].includes(
  String(process.env.DB_SSL ?? "true").toLowerCase(),
);

const ssl = sslEnabled
  ? {
      rejectUnauthorized:
        String(process.env.DB_SSL_REJECT_UNAUTHORIZED ?? "true") === "true",
      ...(process.env.DB_SSL_CA
        ? { ca: process.env.DB_SSL_CA.replace(/\\n/g, "\n") }
        : {}),
    }
  : false;

const databaseSchema = process.env.DB_SCHEMA?.trim() || "public";
if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(databaseSchema)) {
  throw new Error("DB_SCHEMA must be a valid PostgreSQL identifier");
}
const connectionOptions = `-c search_path=${databaseSchema},public`;

export const db = new pg.Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl,
  options: connectionOptions,
  max: Number(process.env.DB_POOL_MAX ?? 10),
  connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS ?? 5000),
  idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS ?? 30_000),
});

export const migrationDb = new pg.Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_MIGRATION_USER ?? process.env.DB_USER,
  password: process.env.DB_MIGRATION_PASSWORD ?? process.env.DB_PASSWORD,
  ssl,
  options: connectionOptions,
  max: 1,
  connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS ?? 5000),
});
