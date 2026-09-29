import type pg from "pg";
import { db } from "./db.js";
import type { CrmSession } from "./auth.js";

export async function withWorkspace<T>(
  session: CrmSession,
  operation: (client: pg.PoolClient) => Promise<T>,
) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.workspace_id', $1, true)", [
      session.workspaceId,
    ]);
    await client.query("SELECT set_config('app.user_id', $1, true)", [
      session.userId,
    ]);
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
