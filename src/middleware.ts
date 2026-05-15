import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, verifySessionToken } from "@/lib/access-session";

// /api/worker/process is exempt: its own requireWorkerSecret() is the auth layer.
const WORKER_PROCESS_PATH = "/api/worker/process";

function isPublicPath(pathname: string): boolean {
  if (pathname === "/" || pathname === "/internal-login" || pathname === "/internal-logout") {
    return true;
  }
  if (pathname === "/favicon.ico" || pathname === "/robots.txt" || pathname === "/sitemap.xml") {
    return true;
  }
  if (pathname.startsWith("/_next/") || pathname.startsWith("/__nextjs_")) {
    return true;
  }
  return false;
}

function isProtectedApiPath(pathname: string): boolean {
  if (pathname === WORKER_PROCESS_PATH) return false;
  return (
    pathname.startsWith("/api/audits/") ||
    pathname.startsWith("/api/reports/") ||
    pathname.startsWith("/api/worker/")
  );
}

function isProtectedPagePath(pathname: string): boolean {
  return (
    pathname.startsWith("/intake") ||
    pathname.startsWith("/audits") ||
    pathname.startsWith("/report/")
  );
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;

  if (isPublicPath(pathname)) return NextResponse.next();

  const protectedPage = isProtectedPagePath(pathname);
  const protectedApi = isProtectedApiPath(pathname);

  if (!protectedPage && !protectedApi) return NextResponse.next();

  const secret = process.env.INTERNAL_ACCESS_COOKIE_SECRET;
  if (!secret) {
    // Allow through in dev/test so local dev stays convenient.
    if (process.env.NODE_ENV !== "production") return NextResponse.next();
    if (protectedApi) {
      return NextResponse.json({ error: "Access gate not configured" }, { status: 500 });
    }
    return NextResponse.redirect(new URL("/internal-login", req.url));
  }

  const token = req.cookies.get(COOKIE_NAME)?.value;
  const authenticated = token ? await verifySessionToken(token, secret) : false;

  if (!authenticated) {
    if (protectedApi) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/internal-login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/|favicon\\.ico|robots\\.txt|sitemap\\.xml).*)"],
};
