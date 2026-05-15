"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { COOKIE_NAME, COOKIE_MAX_AGE, createSessionToken } from "@/lib/access-session";

export async function loginAction(formData: FormData): Promise<never> {
  const password = formData.get("password");
  const expected = process.env.INTERNAL_ACCESS_PASSWORD;
  const secret = process.env.INTERNAL_ACCESS_COOKIE_SECRET;

  if (
    !expected ||
    !secret ||
    typeof password !== "string" ||
    password.length === 0 ||
    password !== expected
  ) {
    redirect("/internal-login?error=1");
  }

  const token = await createSessionToken(secret);
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });

  redirect("/intake");
}
