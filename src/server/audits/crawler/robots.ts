import { assertPublicUrl, SSRFError } from "@/lib/ssrf";
import {
  CRAWLER_USER_AGENT,
  type CrawlerFetch,
  type RobotsDirective,
  type RobotsPolicy,
  type RobotsRule,
} from "@/server/audits/crawler/types";

type RobotsGroup = {
  userAgents: string[];
  rules: RobotsRule[];
};

function normalizeRobotsPath(path: string) {
  return path.trim() || "/";
}

function stripComment(line: string) {
  const hashIndex = line.indexOf("#");
  return (hashIndex >= 0 ? line.slice(0, hashIndex) : line).trim();
}

function parseDirective(line: string) {
  const match = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
  if (!match) return null;
  return {
    key: match[1]!.toLowerCase(),
    value: match[2]!.trim(),
  };
}

export function parseRobotsTxt(
  body: string,
  robotsUrl: string,
  userAgent = CRAWLER_USER_AGENT
): RobotsPolicy {
  const groups: RobotsGroup[] = [];
  const sitemapUrls: string[] = [];
  let current: RobotsGroup | null = null;

  for (const rawLine of body.split(/\r?\n/)) {
    const line = stripComment(rawLine);
    if (!line) continue;

    const directive = parseDirective(line);
    if (!directive) continue;

    if (directive.key === "sitemap") {
      if (directive.value) sitemapUrls.push(directive.value);
      continue;
    }

    if (directive.key === "user-agent") {
      if (!current || current.rules.length > 0) {
        current = { userAgents: [], rules: [] };
        groups.push(current);
      }
      current.userAgents.push(directive.value.toLowerCase());
      continue;
    }

    if (directive.key !== "allow" && directive.key !== "disallow") {
      continue;
    }

    if (!current || current.userAgents.length === 0) {
      continue;
    }

    const robotsDirective = directive.key as RobotsDirective;
    for (const agent of current.userAgents) {
      current.rules.push({
        userAgent: agent,
        directive: robotsDirective,
        path: normalizeRobotsPath(directive.value),
      });
    }
  }

  return {
    fetched: true,
    url: robotsUrl,
    userAgent,
    sitemapUrls: [...new Set(sitemapUrls)],
    rules: groups.flatMap((group) => group.rules),
  };
}

function getApplicableRules(policy: RobotsPolicy) {
  const requestedAgent = policy.userAgent.toLowerCase();
  const exactRules = policy.rules.filter((rule) => rule.userAgent === requestedAgent);

  if (exactRules.length > 0) {
    return exactRules;
  }

  return policy.rules.filter((rule) => rule.userAgent === "*");
}

function robotsPatternMatches(pattern: string, pathnameWithSearch: string) {
  if (pattern === "") return false;
  if (pattern === "/") return true;

  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\\\$/g, "$");
  const source = pattern.endsWith("$") ? `^${escaped}` : `^${escaped}`;
  return new RegExp(source).test(pathnameWithSearch);
}

export function isUrlAllowedByRobots(candidateUrl: string, policy: RobotsPolicy): boolean {
  if (!policy.fetched || policy.rules.length === 0) {
    return true;
  }

  let parsed: URL;
  try {
    parsed = new URL(candidateUrl);
  } catch {
    return false;
  }

  const target = `${parsed.pathname}${parsed.search}`;
  const matches = getApplicableRules(policy).filter((rule) =>
    robotsPatternMatches(rule.path, target)
  );

  if (matches.length === 0) {
    return true;
  }

  matches.sort((left, right) => {
    const specificityDelta = right.path.length - left.path.length;
    if (specificityDelta !== 0) return specificityDelta;
    if (left.directive === right.directive) return 0;
    return left.directive === "allow" ? -1 : 1;
  });

  return matches[0]!.directive === "allow";
}

export async function fetchRobotsPolicy(options: {
  baseUrl: string;
  fetcher: CrawlerFetch;
  userAgent?: string;
}): Promise<RobotsPolicy> {
  const base = new URL(options.baseUrl);
  const robotsUrl = `${base.origin}/robots.txt`;
  const userAgent = options.userAgent ?? CRAWLER_USER_AGENT;

  try {
    await assertPublicUrl(robotsUrl);
    const response = await options.fetcher(robotsUrl);
    if (response.statusCode === 404) {
      return {
        fetched: false,
        url: robotsUrl,
        userAgent,
        sitemapUrls: [],
        rules: [],
        error: "robots.txt not found",
      };
    }

    if (!response.ok) {
      return {
        fetched: false,
        url: robotsUrl,
        userAgent,
        sitemapUrls: [],
        rules: [],
        error: `robots.txt fetch failed with status ${response.statusCode}`,
      };
    }

    return parseRobotsTxt(response.html, robotsUrl, userAgent);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      fetched: false,
      url: robotsUrl,
      userAgent,
      sitemapUrls: [],
      rules: [],
      error: error instanceof SSRFError ? `robots.txt rejected: ${message}` : message,
    };
  }
}
