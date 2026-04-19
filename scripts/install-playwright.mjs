import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const cliPath = path.join(process.cwd(), "node_modules", "playwright", "cli.js");
const browsersRoot = path.join(process.cwd(), "node_modules", "playwright-core", ".local-browsers");

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

function pruneLocales(browserDir) {
  const localesDir = path.join(browserDir, "locales");
  if (!fs.existsSync(localesDir)) {
    return;
  }

  for (const file of fs.readdirSync(localesDir)) {
    if (file === "en-US.pak") {
      continue;
    }

    fs.rmSync(path.join(localesDir, file), { force: true });
  }
}

function pruneUnusedBrowserAssets(rootDir) {
  if (!fs.existsSync(rootDir)) {
    return;
  }

  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const entryPath = path.join(rootDir, entry.name);

    if (entry.name.startsWith("chromium_headless_shell-")) {
      const browserDir = fs
        .readdirSync(entryPath, { withFileTypes: true })
        .find((child) => child.isDirectory() && child.name.startsWith("chrome-headless-shell-"));

      if (browserDir) {
        pruneLocales(path.join(entryPath, browserDir.name));
      }
      continue;
    }

    if (entry.name.startsWith("ffmpeg-")) {
      fs.rmSync(entryPath, { recursive: true, force: true });
    }
  }
}

pruneUnusedBrowserAssets(browsersRoot);
