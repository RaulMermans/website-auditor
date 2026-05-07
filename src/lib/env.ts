import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // Database
  DATABASE_URL: z.string().url().optional(),
  PG_BOSS_SCHEMA: z.string().min(1).optional(),

  // Browser runtime
  BROWSER_DRIVER: z.enum(["playwright", "browser_use"]).default("playwright"),
  BROWSER_USE_BASE_URL: z.string().url().optional(),
  BROWSER_USE_API_TOKEN: z.string().min(1).optional(),

  // Worker — secret for POST /api/worker/process (optional in dev/test, required in production)
  WORKER_SECRET: z.string().min(16).optional(),

  // Storage
  STORAGE_PROVIDER: z.enum(["local", "vercel_blob"]).default("local"),
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  STORAGE_BUCKET: z.string().optional(),
  STORAGE_ACCESS_KEY: z.string().optional(),
  STORAGE_SECRET_KEY: z.string().optional(),

  // Auth — shared API key for report enrichment/PDF/prospect routes (optional in dev/test)
  AUDIT_API_KEY: z.string().min(16).optional(),

  // LLM
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),

  // App
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
}).superRefine((value, ctx) => {
  const isNextProductionBuild = process.env.NEXT_PHASE === "phase-production-build";

  if (value.NODE_ENV === "production" && !isNextProductionBuild && !value.WORKER_SECRET) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["WORKER_SECRET"],
      message: "WORKER_SECRET is required in production",
    });
  }

  if (value.NODE_ENV === "production" && !isNextProductionBuild && !value.AUDIT_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["AUDIT_API_KEY"],
      message: "AUDIT_API_KEY is required in production",
    });
  }

  if (
    value.NODE_ENV === "production" &&
    !isNextProductionBuild &&
    value.STORAGE_PROVIDER === "vercel_blob" &&
    !value.BLOB_READ_WRITE_TOKEN
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["BLOB_READ_WRITE_TOKEN"],
      message: "BLOB_READ_WRITE_TOKEN is required when STORAGE_PROVIDER=vercel_blob in production",
    });
  }
});

function parseEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return result.data;
}

export function getEnv() {
  return parseEnv();
}

// Singleton — validated once at module load time.
export const env = getEnv();

export function getRequiredEnv<K extends keyof typeof env>(
  key: K
): NonNullable<(typeof env)[K]> {
  const value = getEnv()[key];

  if (!value) {
    throw new Error(`Missing required environment variable: ${String(key)}`);
  }

  return value as NonNullable<(typeof env)[K]>;
}
