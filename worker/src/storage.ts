import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const artifactsDir = path.join(process.cwd(), "..", ".storage");

export async function putArtifact(
  prefix: string,
  extension: string,
  data: Buffer | string
): Promise<string> {
  const hash = crypto.randomBytes(8).toString("hex");
  const key = `${prefix}_${hash}.${extension}`;
  const filepath = path.join(artifactsDir, key);

  await fs.mkdir(artifactsDir, { recursive: true });
  await fs.writeFile(filepath, data);

  return key;
}
