import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const { Client } = pg;

const direction = process.argv[2];

if (direction !== "up" && direction !== "down") {
  throw new Error("Usage: node scripts/migrate.mjs <up|down>");
}

if (!process.env.DATABASE_URL) {
  throw new Error("Missing DATABASE_URL");
}

const filename = `0001_shot_2_domain_intake.${direction}.sql`;
const filePath = path.join(process.cwd(), "migrations", filename);
const sql = await readFile(filePath, "utf8");
const client = new Client({ connectionString: process.env.DATABASE_URL });

await client.connect();

try {
  await client.query("BEGIN");
  await client.query(sql);
  await client.query("COMMIT");
  console.log(`Applied ${filename}`);
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
