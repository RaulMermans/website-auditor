export const COOKIE_NAME = "ia_session";
export const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

function uint8ArrayToBase64Url(arr: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < arr.length; i++) {
    binary += String.fromCharCode(arr[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlToUint8Array(str: string): Uint8Array<ArrayBuffer> {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const remainder = base64.length % 4;
  const padded = remainder ? base64 + "=".repeat(4 - remainder) : base64;
  const binary = atob(padded);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    arr[i] = binary.charCodeAt(i);
  }
  return arr;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function createSessionToken(secret: string): Promise<string> {
  const exp = Date.now() + COOKIE_MAX_AGE * 1000;
  const payloadB64 = uint8ArrayToBase64Url(new TextEncoder().encode(JSON.stringify({ exp })));
  const key = await importHmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64));
  return `${payloadB64}.${uint8ArrayToBase64Url(new Uint8Array(sig))}`;
}

export async function verifySessionToken(token: string, secret: string): Promise<boolean> {
  const lastDot = token.lastIndexOf(".");
  if (lastDot < 1) return false;
  const payloadB64 = token.slice(0, lastDot);
  const sigB64 = token.slice(lastDot + 1);
  try {
    const key = await importHmacKey(secret);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlToUint8Array(sigB64),
      new TextEncoder().encode(payloadB64)
    );
    if (!valid) return false;
    const json = new TextDecoder().decode(base64UrlToUint8Array(payloadB64));
    const data = JSON.parse(json) as { exp?: unknown };
    return typeof data.exp === "number" && data.exp > Date.now();
  } catch {
    return false;
  }
}
