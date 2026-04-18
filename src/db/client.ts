import { Pool, type PoolClient } from "pg";
import { env, getRequiredEnv } from "@/lib/env";

declare global {
  var __websiteAuditorPgPool: Pool | undefined;
}

function createPool() {
  return new Pool({
    connectionString: getRequiredEnv("DATABASE_URL"),
    max: env.NODE_ENV === "development" ? 5 : 10,
  });
}

export function getDbPool() {
  if (!globalThis.__websiteAuditorPgPool) {
    globalThis.__websiteAuditorPgPool = createPool();
  }

  return globalThis.__websiteAuditorPgPool;
}

export async function withDbClient<T>(callback: (client: PoolClient) => Promise<T>) {
  const client = await getDbPool().connect();

  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

export async function withTransaction<T>(callback: (client: PoolClient) => Promise<T>) {
  return withDbClient(async (client) => {
    await client.query("BEGIN");

    try {
      const result = await callback(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}
