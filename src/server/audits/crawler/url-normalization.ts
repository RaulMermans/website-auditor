import net from "node:net";
import { isBlockedIP } from "@/lib/ssrf";
import type { NormalizedUrl } from "@/server/audits/crawler/types";

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
  "msclkid",
  "mc_cid",
  "mc_eid",
  "igshid",
  "ref",
]);

const REJECTED_PROTOCOLS = new Set(["mailto:", "tel:", "javascript:", "data:", "blob:"]);
const REJECTED_FILE_PATTERN =
  /\.(?:pdf|jpe?g|png|gif|webp|svg|ico|mp4|mov|avi|zip|rar|css|js|woff2?)$/i;

function reject(originalUrl: string, reason: string): NormalizedUrl {
  return {
    originalUrl,
    normalizedUrl: "",
    hostname: "",
    pathname: "",
    rejected: true,
    rejectionReason: reason,
  };
}

function sameSiteAllowed(candidate: URL, base: URL) {
  if (candidate.hostname === base.hostname) return true;

  const baseHost = base.hostname.replace(/^www\./i, "").toLowerCase();
  const candidateHost = candidate.hostname.replace(/^www\./i, "").toLowerCase();
  return candidateHost === baseHost;
}

function stripDefaultPort(url: URL) {
  if (
    (url.protocol === "https:" && url.port === "443") ||
    (url.protocol === "http:" && url.port === "80")
  ) {
    url.port = "";
  }
}

function normalizePathname(url: URL) {
  url.pathname = url.pathname.replace(/\/{2,}/g, "/");

  if (url.pathname !== "/" && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }

  if (!url.pathname) {
    url.pathname = "/";
  }
}

function normalizeQuery(url: URL) {
  const entries = [...url.searchParams.entries()]
    .filter(([key]) => !TRACKING_PARAMS.has(key.toLowerCase()))
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
      const keyDelta = leftKey.localeCompare(rightKey);
      return keyDelta === 0 ? leftValue.localeCompare(rightValue) : keyDelta;
    });

  url.search = "";
  for (const [key, value] of entries) {
    url.searchParams.append(key, value);
  }
}

export function normalizeAuditUrl(rawUrl: string, baseUrl: string): NormalizedUrl {
  if (!rawUrl || REJECTED_PROTOCOLS.has(rawUrl.trim().split(":")[0]?.toLowerCase() + ":")) {
    return reject(rawUrl, "unsupported_protocol");
  }

  let base: URL;
  let parsed: URL;
  try {
    base = new URL(baseUrl);
    parsed = new URL(rawUrl, base);
  } catch {
    return reject(rawUrl, "invalid_url");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return reject(rawUrl, "unsupported_protocol");
  }

  parsed.hostname = parsed.hostname.toLowerCase();
  stripDefaultPort(parsed);
  parsed.hash = "";
  normalizePathname(parsed);
  normalizeQuery(parsed);

  if (!sameSiteAllowed(parsed, base)) {
    return reject(rawUrl, "external_domain");
  }

  if (net.isIP(parsed.hostname) && isBlockedIP(parsed.hostname)) {
    return reject(rawUrl, "private_or_internal_ip");
  }

  if (REJECTED_FILE_PATTERN.test(parsed.pathname)) {
    return reject(rawUrl, "file_or_media_url");
  }

  return {
    originalUrl: rawUrl,
    normalizedUrl: parsed.href,
    hostname: parsed.hostname,
    pathname: parsed.pathname,
    rejected: false,
  };
}

export function dedupeNormalizedUrls(urls: NormalizedUrl[]) {
  const seen = new Set<string>();
  const deduped: NormalizedUrl[] = [];

  for (const url of urls) {
    if (url.rejected || seen.has(url.normalizedUrl)) {
      continue;
    }
    seen.add(url.normalizedUrl);
    deduped.push(url);
  }

  return deduped;
}
