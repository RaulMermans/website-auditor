import PgBoss from "pg-boss";
import { env, getRequiredEnv } from "@/lib/env";
import { withDbClient } from "@/db/client";

export interface QueueJob<TPayload extends object = Record<string, unknown>> {
  id: string;
  name: string;
  payload: TPayload;
}

export interface QueueClient {
  enqueue<TPayload extends object>(name: string, payload: TPayload): Promise<QueueJob<TPayload>>;
  fetch<TPayload extends object>(name: string): Promise<QueueJob<TPayload> | null>;
  fetchById<TPayload extends object>(name: string, id: string): Promise<QueueJob<TPayload> | null>;
  complete(name: string, id: string, data?: object): Promise<void>;
  fail(name: string, id: string, data?: object): Promise<void>;
}

declare global {
  var __websiteAuditorPgBoss: Promise<PgBoss> | undefined;
}

async function getPgBoss() {
  if (!globalThis.__websiteAuditorPgBoss) {
    globalThis.__websiteAuditorPgBoss = (async () => {
      const boss = new PgBoss({
        connectionString: getRequiredEnv("DATABASE_URL"),
        schema: env.PG_BOSS_SCHEMA ?? "pgboss",
      });

      await boss.start();

      return boss;
    })();
  }

  return globalThis.__websiteAuditorPgBoss;
}

export const queueClient: QueueClient = {
  async enqueue(name, payload) {
    const boss = await getPgBoss();
    await boss.createQueue(name);
    const jobId = await boss.send(name, payload);

    if (!jobId) {
      throw new Error(`pg-boss did not return a job id for ${name}`);
    }

    return { id: jobId, name, payload };
  },
  async fetch(name) {
    const boss = await getPgBoss();
    const jobs = await boss.fetch<Record<string, unknown>>(name, { batchSize: 1 });

    if (!jobs || jobs.length === 0) return null;

    const job = jobs[0];
    return { id: job.id, name: job.name, payload: job.data as never };
  },
  async fetchById(name, id) {
    const schema = env.PG_BOSS_SCHEMA ?? "pgboss";
    const result = await withDbClient((client) =>
      client.query<{ id: string; name: string; data: Record<string, unknown> }>(
        `UPDATE "${schema}".job
         SET state = 'active',
             started_on = now()
         WHERE id = $1::uuid
           AND name = $2
           AND state IN ('created', 'retry')
         RETURNING id, name, data`,
        [id, name]
      )
    );

    if (result.rows.length === 0) return null;

    const job = result.rows[0]!;
    return { id: job.id, name: job.name, payload: job.data as never };
  },
  async complete(name, id, data) {
    const boss = await getPgBoss();
    if (data) {
      await boss.complete(name, id, data);
      return;
    }

    await boss.complete(name, id);
  },
  async fail(name, id, data) {
    const boss = await getPgBoss();
    if (data) {
      await boss.fail(name, id, data);
      return;
    }

    await boss.fail(name, id);
  },
};

export async function stopQueueClient() {
  if (globalThis.__websiteAuditorPgBoss) {
    const boss = await globalThis.__websiteAuditorPgBoss;
    globalThis.__websiteAuditorPgBoss = undefined;
    await boss.stop();
  }
}
