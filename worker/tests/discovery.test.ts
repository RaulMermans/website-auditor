import { describe, expect, it } from "vitest";
import { classifyPageTarget } from "../src/discovery.js";

describe("classifyPageTarget", () => {
  it("classifies hompage paths correctly", () => {
    expect(classifyPageTarget("https://example.com/", "Home")).toBe("homepage");
    expect(classifyPageTarget("https://example.com/home", "Home")).toBe("homepage");
  });

  it("classifies about pages", () => {
    expect(classifyPageTarget("https://example.com/about-us", "Who we are")).toBe("about");
    expect(classifyPageTarget("https://example.com/about", "About Example")).toBe("about");
    expect(classifyPageTarget("https://example.com/company", "Learn More")).toBe("about");
    expect(classifyPageTarget("https://example.com/our-story", "Our story")).toBe("about");
  });

  it("classifies services/products", () => {
    expect(classifyPageTarget("https://example.com/software", "Our Products")).toBe("services");
    expect(classifyPageTarget("https://example.com/consulting", "Services")).toBe("services");
    expect(classifyPageTarget("https://example.com/solutions/cloud", "Solution")).toBe("services");
    expect(classifyPageTarget("https://example.com/services", "What we do")).toBe("services");
  });

  it("classifies contact pages", () => {
    expect(classifyPageTarget("https://example.com/contact-us", "Contact")).toBe("contact");
    expect(classifyPageTarget("https://example.com/reach-out", "Contact Us")).toBe("contact");
    expect(classifyPageTarget("https://example.com/book-demo", "Book a Demo")).toBe("contact");
  });

  it("classifies content pages", () => {
    expect(classifyPageTarget("https://example.com/blog", "Read our Blog")).toBe("content");
    expect(classifyPageTarget("https://example.com/post-123", "Blog")).toBe("content");
    expect(classifyPageTarget("https://example.com/article/tech", "Tech News")).toBe("content");
    expect(classifyPageTarget("https://example.com/resources/whitepaper", "Download")).toBe("content");
  });

  it("classifies unknown pages as other", () => {
    expect(classifyPageTarget("https://example.com/pricing", "Pricing")).toBe("other");
    expect(classifyPageTarget("https://example.com/login", "Sign In")).toBe("other");
    expect(classifyPageTarget("https://example.com/legal/privacy", "Privacy Policy")).toBe("other");
  });
});
