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

  // Storage (provider TBD)
  STORAGE_BUCKET: z.string().optional(),
  STORAGE_ACCESS_KEY: z.string().optional(),
  STORAGE_SECRET_KEY: z.string().optional(),

  // LLM
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),

  // App
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
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
