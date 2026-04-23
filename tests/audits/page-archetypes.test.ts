import { describe, expect, it } from "vitest";
import {
  buildCapturePlan,
  classifyPageArchetype,
} from "@/server/audits/page-archetypes";

describe("page archetypes", () => {
  it("classifies the expanded archetypes deterministically", () => {
    expect(classifyPageArchetype("https://example.com/pricing", "Pricing")).toBe("pricing");
    expect(classifyPageArchetype("https://example.com/platform", "Platform")).toBe("product");
    expect(classifyPageArchetype("https://example.com/services", "Services")).toBe("services");
    expect(classifyPageArchetype("https://example.com/contact", "Contact")).toBe("contact");
    expect(classifyPageArchetype("https://example.com/book-demo", "Book Demo")).toBe("form");
    expect(classifyPageArchetype("https://example.com/blog/how-to-audit", "Blog")).toBe("content");
    expect(classifyPageArchetype("https://example.com/privacy", "Privacy")).toBe("legal");
  });

  it("builds a deterministic capture plan ordered by archetype priority", () => {
    const plan = buildCapturePlan("https://example.com", [
      {
        href: "https://example.com/blog/how-to-audit",
        origin: "https://example.com",
        pathname: "/blog/how-to-audit",
        text: "Blog",
      },
      {
        href: "https://example.com/contact",
        origin: "https://example.com",
        pathname: "/contact",
        text: "Contact",
      },
      {
        href: "https://example.com/pricing",
        origin: "https://example.com",
        pathname: "/pricing",
        text: "Pricing",
      },
      {
        href: "https://example.com/platform",
        origin: "https://example.com",
        pathname: "/platform",
        text: "Platform",
      },
    ]);

    expect(plan.map((page) => page.pageType)).toEqual([
      "homepage",
      "pricing",
      "product",
      "contact",
      "content",
    ]);
  });
});
