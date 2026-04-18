import { createHmac } from "node:crypto";
import process from "node:process";
import PgBoss from "pg-boss";

const queueName = "audit.run";
const databaseUrl = process.env.DATABASE_URL;
const workerEndpoint = process.env.WORKER_ENDPOINT;
const workerSecret = process.env.WORKER_SECRET;
const schema = process.env.PG_BOSS_SCHEMA ?? "pgboss";

if (!databaseUrl) {
  throw new Error("Missing DATABASE_URL");
}

if (!workerEndpoint) {
  throw new Error("Missing WORKER_ENDPOINT");
}

if (!workerSecret) {
  throw new Error("Missing WORKER_SECRET");
}

const boss = new PgBoss({
  connectionString: databaseUrl,
  schema,
});

async function main() {
  await boss.start();

  try {
    const jobs = await boss.fetch(queueName, { batchSize: 1 });
    const job = jobs[0];

    if (!job) {
      console.error(`[smoke] No queued ${queueName} jobs found in schema "${schema}".`);
      process.exitCode = 1;
      return;
    }

    const payload = JSON.stringify(job.data ?? {});
    const signature = createHmac("sha256", workerSecret).update(payload).digest("hex");
    const endpoint = workerEndpoint.replace(/\/$/, "");
    const response = await fetch(`${endpoint}/capture`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-worker-signature": signature,
      },
      body: payload,
    });

    const rawBody = await response.text();
    let body;

    try {
      body = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      body = rawBody;
    }

    if (!response.ok) {
      await boss.fail(queueName, job.id, {
        workerEndpoint: endpoint,
        status: response.status,
        body,
      });

      throw new Error(
        `[smoke] Worker dispatch failed for job ${job.id}: HTTP ${response.status}`
      );
    }

    await boss.complete(queueName, job.id, {
      workerEndpoint: endpoint,
      workerResponse: body,
    });

    console.log(
      JSON.stringify(
        {
          queueName,
          schema,
          jobId: job.id,
          request: job.data,
          workerResponse: body,
        },
        null,
        2
      )
    );
  } finally {
    await boss.stop();
  }
}

await main();
