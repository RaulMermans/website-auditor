import { NextResponse } from "next/server";
import { env } from "@/lib/env";

/**
 * Returns a 401 Response if AUDIT_API_KEY is configured and the request does
 * not present the correct key. Returns null when auth passes or is disabled.
 *
 * Accepted formats:
 *   Authorization: Bearer <key>
 *   x-api-key: <key>
 */
export function requireAuditApiKey(req: Request): Response | null {
  const apiKey = env.AUDIT_API_KEY;
  if (!apiKey) {
    if (env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Server auth is not configured" }, { status: 500 });
    }
    return null;
  }

  const provided =
    req.headers.get("x-api-key") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (!provided || provided !== apiKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
