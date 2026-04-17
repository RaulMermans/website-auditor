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

// TODO: replace with real implementation before artifact persistence work
export const storageClient: StorageClient = {
  async put(key) {
    console.warn("[storage] stub put — no real storage wired:", key);
    return key;
  },
  async get(key) {
    console.warn("[storage] stub get — no real storage wired:", key);
    return null;
  },
  async delete(key) {
    console.warn("[storage] stub delete — no real storage wired:", key);
  },
  async presign(key) {
    console.warn("[storage] stub presign — no real storage wired:", key);
    return `/artifacts/${key}`;
  },
};
