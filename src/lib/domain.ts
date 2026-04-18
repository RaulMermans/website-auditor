import { z } from "zod";

const DOMAIN_PATTERN =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

export function normalizeDomain(input: string) {
  const trimmed = input.trim();

  if (!trimmed) {
    throw new Error("Enter a domain like example.com.");
  }

  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let url: URL;

  try {
    url = new URL(candidate);
  } catch {
    throw new Error("Enter a valid domain like example.com.");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Enter a valid http or https domain.");
  }

  if (url.pathname && url.pathname !== "/") {
    throw new Error("Enter a domain only. Paths and query strings are not supported yet.");
  }

  if (url.search || url.hash) {
    throw new Error("Enter a domain only. Paths and query strings are not supported yet.");
  }

  if (url.username || url.password || url.port) {
    throw new Error("Enter a bare domain only, without credentials or ports.");
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");

  if (!DOMAIN_PATTERN.test(hostname)) {
    throw new Error("Enter a valid domain like example.com.");
  }

  return hostname;
}

export const DomainInputSchema = z.string().transform((value, context) => {
  try {
    return normalizeDomain(value);
  } catch (error) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        error instanceof Error ? error.message : "Enter a valid domain like example.com.",
    });

    return z.NEVER;
  }
});
