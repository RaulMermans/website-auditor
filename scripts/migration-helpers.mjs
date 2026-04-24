import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const { Client } = pg;

function assertDirection(direction) {
  if (direction !== "up" && direction !== "down") {
    throw new Error("direction must be up or down");
  }
}

function assertDatabaseUrl(databaseUrl) {
  if (!databaseUrl) {
    throw new Error("Missing databaseUrl");
  }
}

export async function getMigrationPaths(direction, cwd = process.cwd()) {
  assertDirection(direction);

  const migrationsDir = path.join(cwd, "migrations");
  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith(`.${direction}.sql`))
    .sort((a, b) => (direction === "up" ? a.localeCompare(b) : b.localeCompare(a)));

  return files.map((file) => path.join(migrationsDir, file));
}

export function getShot2MigrationPath(direction, cwd = process.cwd()) {
  return path.join(cwd, "migrations", `0001_shot_2_domain_intake.${direction}.sql`);
}

export function getShot3MigrationPath(direction, cwd = process.cwd()) {
  return path.join(cwd, "migrations", `0002_shot_3_page_snapshots.${direction}.sql`);
}

export function getShot4MigrationPath(direction, cwd = process.cwd()) {
  return path.join(cwd, "migrations", `0003_shot_4_evidence_findings.${direction}.sql`);
}

export function getShot6MigrationPath(direction, cwd = process.cwd()) {
  return path.join(cwd, "migrations", `0004_shot_6_outreach_assets.${direction}.sql`);
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

export async function runAllMigrations({ direction, databaseUrl, cwd = process.cwd() }) {
  assertDirection(direction);
  assertDatabaseUrl(databaseUrl);

  const filePaths = await getMigrationPaths(direction, cwd);

  for (const filePath of filePaths) {
    await runMigration({ filePath, databaseUrl });
  }

  return filePaths;
}

export async function runShot3Migration({ direction, databaseUrl, cwd = process.cwd() }) {
  assertDirection(direction);
  assertDatabaseUrl(databaseUrl);
  const filePath = getShot3MigrationPath(direction, cwd);
  return runMigration({ filePath, databaseUrl });
}

export async function runShot4Migration({ direction, databaseUrl, cwd = process.cwd() }) {
  assertDirection(direction);
  assertDatabaseUrl(databaseUrl);
  const filePath = getShot4MigrationPath(direction, cwd);
  return runMigration({ filePath, databaseUrl });
}

export async function runShot6Migration({ direction, databaseUrl, cwd = process.cwd() }) {
  assertDirection(direction);
  assertDatabaseUrl(databaseUrl);
  const filePath = getShot6MigrationPath(direction, cwd);
  return runMigration({ filePath, databaseUrl });
}

export async function runShot2Migration({ direction, databaseUrl, cwd = process.cwd() }) {
  assertDirection(direction);
  assertDatabaseUrl(databaseUrl);
  const filePath = getShot2MigrationPath(direction, cwd);
  return runMigration({ filePath, databaseUrl });
}
