import PgBoss from "pg-boss";
import { env, getRequiredEnv } from "@/lib/env";

export interface QueueJob<TPayload extends object = Record<string, unknown>> {
  id: string;
  name: string;
  payload: TPayload;
}

export interface QueueClient {
  enqueue<TPayload extends object>(name: string, payload: TPayload): Promise<QueueJob<TPayload>>;
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
};

export async function stopQueueClient() {
  if (globalThis.__websiteAuditorPgBoss) {
    const boss = await globalThis.__websiteAuditorPgBoss;
    globalThis.__websiteAuditorPgBoss = undefined;
    await boss.stop();
  }
}
