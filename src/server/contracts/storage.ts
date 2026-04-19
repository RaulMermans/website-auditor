import fs from "node:fs/promises";
import path from "node:path";

// Storage contract — provider TBD (e.g. Vercel Blob, AWS S3, R2).
// All artifact reads/writes must go through this interface.
// Raw storage URLs must never be exposed directly in the UI.

export interface StorageClient {
  put(key: string, body: Buffer | Uint8Array | string, contentType: string): Promise<string>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
  /** Returns an access-controlled temporary URL, not a raw storage URL. */
  presign(key: string, expiresInSeconds: number): Promise<string>;
}

const artifactsDir = path.join(process.cwd(), ".storage");

export const storageClient: StorageClient = {
  async put(key, body) {
    const filepath = path.join(artifactsDir, key);
    await fs.mkdir(path.dirname(filepath), { recursive: true });
    await fs.writeFile(filepath, body);
    return key;
  },
  async get(key) {
    const filepath = path.join(artifactsDir, key);

    try {
      return await fs.readFile(filepath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }

      throw error;
    }
  },
  async delete(key) {
    const filepath = path.join(artifactsDir, key);

    try {
      await fs.unlink(filepath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  },
  async presign(key) {
    return `/artifacts/${key}`;
  },
};
