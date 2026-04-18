import process from "node:process";
import { processCaptureJob } from "./capture.js";

// CLI entrypoint for testing local execution.
// In real usage, this would be an HTTP server or a queue worker directly.
// Given Shot 3 constraints: "implement a worker process that handles one audit run at a time via a direct command"

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => arg.split("="))
  );

  const auditRunId = args["--audit-run-id"];
  const domain = args["--domain"];

  if (!auditRunId || !domain) {
    console.error("Usage: npm run dev -- --audit-run-id=<uuid> --domain=<url>");
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("Missing DATABASE_URL");
    process.exit(1);
  }

  console.log(`[worker CLI] invoked for run ${auditRunId} / ${domain}`);

  const result = await processCaptureJob(databaseUrl, {
    auditRunId,
    domain,
  });

  console.log("[worker CLI] Result:", result);

  if (result.errorMessage) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal exception in worker:", err);
  process.exit(1);
});
