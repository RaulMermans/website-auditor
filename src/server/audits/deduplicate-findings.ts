import type { CreateFindingInput } from "@/db/analysis";

function titleFingerprint(title: string): string {
  return title
    .toLowerCase()
    .replace(/^homepage-only audit:\s*/i, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 80);
}

/**
 * Collapses findings that share (category, normalized-title) across multiple pages
 * into one finding. Subsequent occurrences have their pageUrl merged into a
 * pageUrls array on the first occurrence's evidenceRef.
 */
export function deduplicateFindings(
  findings: CreateFindingInput[]
): CreateFindingInput[] {
  const seen = new Map<string, CreateFindingInput>();

  for (const finding of findings) {
    const key = `${finding.category}::${titleFingerprint(finding.title)}`;
    const existing = seen.get(key);

    if (!existing) {
      seen.set(key, {
        ...finding,
        evidenceRef: { ...finding.evidenceRef },
      });
    } else {
      const existingRef = existing.evidenceRef as Record<string, unknown>;
      const newRef = finding.evidenceRef as Record<string, unknown>;
      const newUrl = newRef.pageUrl as string | undefined;

      if (newUrl) {
        const existingUrls: string[] = Array.isArray(existingRef.pageUrls)
          ? (existingRef.pageUrls as string[])
          : existingRef.pageUrl
            ? [existingRef.pageUrl as string]
            : [];

        if (!existingUrls.includes(newUrl)) {
          existingRef.pageUrls = [...existingUrls, newUrl];
          existingRef.pageCount = existingUrls.length + 1;
          delete existingRef.pageUrl;
        }
      }
    }
  }

  return Array.from(seen.values());
}
