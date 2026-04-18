import process from "node:process";
import { runShot2Migration } from "./migration-helpers.mjs";

const direction = process.argv[2];

if (direction !== "up" && direction !== "down") {
  throw new Error("Usage: node scripts/migrate.mjs <up|down>");
}

if (!process.env.DATABASE_URL) {
  throw new Error("Missing DATABASE_URL");
}

await runShot2Migration({
  direction,
  databaseUrl: process.env.DATABASE_URL,
  cwd: process.cwd(),
});

console.log(`Applied 0001_shot_2_domain_intake.${direction}.sql`);
