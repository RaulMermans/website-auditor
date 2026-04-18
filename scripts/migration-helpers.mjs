import { readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const { Client } = pg;

export function getShot2MigrationPath(direction, cwd = process.cwd()) {
  return path.join(cwd, "migrations", `0001_shot_2_domain_intake.${direction}.sql`);
}

export function getShot3MigrationPath(direction, cwd = process.cwd()) {
  return path.join(cwd, "migrations", `0002_shot_3_page_snapshots.${direction}.sql`);
}

export async function runMigration({ filePath, databaseUrl }) {
  const sql = await readFile(filePath, "utf8");
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
    return filePath;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

export async function runShot3Migration({ direction, databaseUrl, cwd = process.cwd() }) {
  if (direction !== "up" && direction !== "down") throw new Error("direction must be up or down");
  if (!databaseUrl) throw new Error("Missing databaseUrl");
  const filePath = getShot3MigrationPath(direction, cwd);
  return runMigration({ filePath, databaseUrl });
}

export async function runShot2Migration({ direction, databaseUrl, cwd = process.cwd() }) {
  if (direction !== "up" && direction !== "down") throw new Error("direction must be up or down");
  if (!databaseUrl) throw new Error("Missing databaseUrl");
  const filePath = getShot2MigrationPath(direction, cwd);
  return runMigration({ filePath, databaseUrl });
}

