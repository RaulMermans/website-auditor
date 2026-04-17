// Queue contract — provider TBD (must be Vercel-compatible).
// Implement this interface with the chosen provider (e.g. Inngest, Trigger.dev, pg-boss).

export interface QueueJob<TPayload = unknown> {
  id: string;
  name: string;
  payload: TPayload;
}

export interface QueueClient {
  enqueue<TPayload>(name: string, payload: TPayload): Promise<QueueJob<TPayload>>;
}

// TODO: replace with real implementation before Shot 2 integration work
export const queueClient: QueueClient = {
  async enqueue(name, payload) {
    const job = { id: crypto.randomUUID(), name, payload };
    console.warn("[queue] stub enqueue — no real queue wired:", name, job.id);
    return job;
  },
};
