import { describe, expect, it } from "vitest";
import * as logoutRoute from "@/app/internal-logout/route";

describe("/internal-logout route", () => {
  it("only exposes a POST handler", () => {
    // Logout must not be reachable via GET: Next.js <Link> prefetching issues
    // GET requests for visible links, which would silently clear the session
    // cookie before the user interacts with the page.
    expect(typeof logoutRoute.POST).toBe("function");
    expect((logoutRoute as Record<string, unknown>).GET).toBeUndefined();
  });
});
