import dns from "node:dns/promises";
import net from "node:net";

// IPv4 CIDRs that must never be fetched or navigated to by the audit runtime.
// Covers: loopback, private, link-local, shared-address-space, special-use.
interface Cidr {
  start: number;
  end: number;
}

function ipv4ToNum(ip: string): number {
  return ip.split(".").reduce((acc, octet) => ((acc << 8) | parseInt(octet, 10)) >>> 0, 0) >>> 0;
}

const BLOCKED_CIDRS_V4: Cidr[] = [
  ["0.0.0.0", "0.255.255.255"],
  ["10.0.0.0", "10.255.255.255"],
  ["100.64.0.0", "100.127.255.255"], // shared address space (RFC 6598)
  ["127.0.0.0", "127.255.255.255"], // loopback
  ["169.254.0.0", "169.254.255.255"], // link-local
  ["172.16.0.0", "172.31.255.255"],
  ["192.168.0.0", "192.168.255.255"],
  ["198.18.0.0", "198.19.255.255"], // benchmark testing
  ["198.51.100.0", "198.51.100.255"], // documentation
  ["203.0.113.0", "203.0.113.255"], // documentation
  ["224.0.0.0", "255.255.255.255"], // multicast + broadcast + reserved
].map(([start, end]) => ({ start: ipv4ToNum(start), end: ipv4ToNum(end) }));

export function isBlockedIPv4(ip: string): boolean {
  if (!net.isIPv4(ip)) return false;
  const num = ipv4ToNum(ip);
  return BLOCKED_CIDRS_V4.some(({ start, end }) => num >= start && num <= end);
}

export function isBlockedIPv6(ip: string): boolean {
  if (!net.isIPv6(ip)) return false;
  const lower = ip.toLowerCase();
  // Loopback ::1
  if (lower === "::1" || lower === "0:0:0:0:0:0:0:1") return true;
  // Unspecified ::
  if (lower === "::" || lower === "0:0:0:0:0:0:0:0") return true;
  // Private fc00::/7 — covers fc00:: and fd00::
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  // Link-local fe80::/10
  if (/^fe[89ab]/i.test(lower)) return true;
  // IPv4-mapped ::ffff:0:0/96
  if (lower.startsWith("::ffff:")) {
    const v4 = lower.slice(7);
    if (net.isIPv4(v4)) return isBlockedIPv4(v4);
  }
  return false;
}

export function isBlockedIP(ip: string): boolean {
  return isBlockedIPv4(ip) || isBlockedIPv6(ip);
}

export class SSRFError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SSRFError";
  }
}

/**
 * Resolves all DNS A/AAAA records for hostname and throws SSRFError if any
 * resolves to a private, loopback, or reserved address.
 */
export async function assertPublicHostname(hostname: string): Promise<void> {
  if (net.isIP(hostname)) {
    // Bare IP literal — no DNS needed, check directly.
    if (isBlockedIP(hostname)) {
      throw new SSRFError(
        `Direct IP access to ${hostname} is not allowed (private/reserved address).`
      );
    }
    return;
  }

  let addresses: string[];
  try {
    const records = await dns.lookup(hostname, { all: true });
    addresses = records.map((r) => r.address);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new SSRFError(`DNS resolution failed for ${hostname}: ${msg}`);
  }

  if (addresses.length === 0) {
    throw new SSRFError(`No DNS records found for ${hostname}.`);
  }

  for (const address of addresses) {
    if (isBlockedIP(address)) {
      throw new SSRFError(
        `${hostname} resolves to ${address} which is a private or reserved address. ` +
          `Auditing internal hosts is not allowed.`
      );
    }
  }
}

/**
 * Validates a full URL before any fetch or browser navigation.
 * Throws SSRFError for non-public targets.
 */
export async function assertPublicUrl(urlString: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    throw new SSRFError(`Invalid URL: ${urlString}`);
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new SSRFError(`Only http and https URLs are allowed (got ${url.protocol}).`);
  }

  await assertPublicHostname(url.hostname);
}
