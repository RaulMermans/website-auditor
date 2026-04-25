import path from "node:path";
import { describe, expect, it } from "vitest";
import { getMigrationPaths } from "../../scripts/migration-helpers.mjs";

describe("migration helpers", () => {
  it("loads up migrations in filename order", async () => {
    const files = (await getMigrationPaths("up")).map((file) => path.basename(file));

    expect(files[0]).toBe("0001_shot_2_domain_intake.up.sql");
    expect(files.at(-1)).toBe("0010_shot_18_capture_provenance.up.sql");
    expect(files).toEqual([...files].sort());
  });

  it("loads down migrations in reverse filename order", async () => {
    const files = (await getMigrationPaths("down")).map((file) => path.basename(file));

    expect(files[0]).toBe("0010_shot_18_capture_provenance.down.sql");
    expect(files.at(-1)).toBe("0001_shot_2_domain_intake.down.sql");
    expect(files).toEqual([...files].sort().reverse());
  });
});
