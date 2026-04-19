import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const cliPath = path.join(process.cwd(), "node_modules", "playwright", "cli.js");

const result = spawnSync(process.execPath, [cliPath, "install", "--only-shell", "chromium"], {
  stdio: "inherit",
  env: {
    ...process.env,
    PLAYWRIGHT_BROWSERS_PATH: "0",
  },
});

if (result.error) {
  throw result.error;
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
