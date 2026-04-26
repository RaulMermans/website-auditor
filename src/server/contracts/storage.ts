import fs from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";

// Storage contract — all artifact reads/writes must go through this interface.
// Raw storage URLs must never be exposed directly in the UI.

export interface StorageClient {
  put(key: string, body: Buffer | Uint8Array | string, contentType: string): Promise<string>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
  /** Returns an access-controlled temporary URL, not a raw storage URL. */
  presign(key: string, expiresInSeconds: number): Promise<string>;
}

// ─── Local provider (dev / CI only) ───────────────────────────────────────────

function buildLocalProvider(root: string): StorageClient {
  return {
    async put(key, body) {
      const filepath = path.join(root, key);
      await fs.mkdir(path.dirname(filepath), { recursive: true });
      await fs.writeFile(filepath, body);
      return key;
    },
    async get(key) {
      const filepath = path.join(root, key);
      try {
        return await fs.readFile(filepath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
    async delete(key) {
      const filepath = path.join(root, key);
      try {
        await fs.unlink(filepath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    },
    async presign(key) {
      return `/artifacts/${key}`;
    },
  };
}

// ─── Vercel Blob provider ──────────────────────────────────────────────────────

function toBuffer(body: Buffer | Uint8Array | string): Buffer | string {
  if (typeof body === "string") return body;
  if (Buffer.isBuffer(body)) return body;
  return Buffer.from(body);
}

function buildVercelBlobProvider(token: string): StorageClient {
  return {
    async put(key, body, contentType) {
      const { put } = await import("@vercel/blob");
      const result = await put(key, toBuffer(body), {
        access: "public",
        token,
        contentType,
        addRandomSuffix: false,
      });
      return result.url;
    },
    async get(key) {
      // Vercel Blob uses public URLs — re-download from the stored URL.
      try {
        const response = await fetch(key);
        if (!response.ok) return null;
        return Buffer.from(await response.arrayBuffer());
      } catch {
        return null;
      }
    },
    async delete(key) {
      const { del } = await import("@vercel/blob");
      await del(key, { token });
    },
    async presign(key) {
      // Vercel Blob public URLs are already accessible; just return the URL.
      return key;
    },
  };
}

// ─── Provider selection ───────────────────────────────────────────────────────

function buildStorageClient(): StorageClient {
  const provider = env.STORAGE_PROVIDER;

  if (provider === "vercel_blob") {
    const token = env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
      throw new Error(
        "BLOB_READ_WRITE_TOKEN is required when STORAGE_PROVIDER=vercel_blob. " +
          "Add it to your Vercel environment variables."
      );
    }
    return buildVercelBlobProvider(token);
  }

  // Local provider — block in production to prevent silent /tmp data loss.
  if (process.env.VERCEL && process.env.NODE_ENV === "production") {
    throw new Error(
      "STORAGE_PROVIDER=local is not safe in production on Vercel (/tmp is ephemeral). " +
        "Set STORAGE_PROVIDER=vercel_blob and BLOB_READ_WRITE_TOKEN, " +
        "or configure another durable provider."
    );
  }

  const root = path.join(process.cwd(), ".storage");
  console.log(`[Storage] local provider — root: ${root}`);
  return buildLocalProvider(root);
}

export const storageClient: StorageClient = buildStorageClient();
