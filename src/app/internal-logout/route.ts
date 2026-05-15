import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME } from "@/lib/access-session";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
  return NextResponse.redirect(new URL("/", request.url));
}
