import process from "node:process";
import path from "node:path";
import { runAllMigrations } from "./migration-helpers.mjs";

const direction = process.argv[2];

if (direction !== "up" && direction !== "down") {
  throw new Error("Usage: node scripts/migrate.mjs <up|down>");
}

if (!process.env.DATABASE_URL) {
  throw new Error(
    "Missing DATABASE_URL. Set DATABASE_URL to the target Postgres connection string; POSTGRES_URL and DATABASE_URL_UNPOOLED are not read by this app."
  );
}

const url = process.env.DATABASE_URL;
const cwd = process.cwd();

const applied = await runAllMigrations({ direction, databaseUrl: url, cwd });

for (const filePath of applied) {
  console.log(`Applied ${path.basename(filePath)}`);
}
