import process from "node:process";
import { runShot2Migration, runShot3Migration } from "./migration-helpers.mjs";

const direction = process.argv[2];

if (direction !== "up" && direction !== "down") {
  throw new Error("Usage: node scripts/migrate.mjs <up|down>");
}

if (!process.env.DATABASE_URL) {
  throw new Error("Missing DATABASE_URL");
}

const url = process.env.DATABASE_URL;
const cwd = process.cwd();

if (direction === "up") {
  await runShot2Migration({ direction, databaseUrl: url, cwd });
  console.log(`Applied 0001_shot_2_domain_intake.up.sql`);
  await runShot3Migration({ direction, databaseUrl: url, cwd });
  console.log(`Applied 0002_shot_3_page_snapshots.up.sql`);
} else {
  // Roll back in reverse order
  await runShot3Migration({ direction, databaseUrl: url, cwd });
  console.log(`Applied 0002_shot_3_page_snapshots.down.sql`);
  await runShot2Migration({ direction, databaseUrl: url, cwd });
  console.log(`Applied 0001_shot_2_domain_intake.down.sql`);
}
