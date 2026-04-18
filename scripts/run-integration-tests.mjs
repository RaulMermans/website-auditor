import { spawn } from "node:child_process";
import process from "node:process";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error("Missing TEST_DATABASE_URL");
}

const schema =
  process.env.PG_BOSS_SCHEMA ??
  `pgboss_test_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

const child = spawn(
  process.execPath,
  ["./node_modules/vitest/vitest.mjs", "run", "--config", "vitest.integration.config.ts"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_ENV: "test",
      DATABASE_URL: testDatabaseUrl,
      PG_BOSS_SCHEMA: schema,
    },
  }
);

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
