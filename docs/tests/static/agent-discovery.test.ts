import { describe, test, expect } from "bun:test";
import { access, readFile } from "fs/promises";
import { constants } from "fs";
import { join } from "path";

const PUBLIC_DIR = join(import.meta.dir, "../../public");

describe("Agent discovery static assets", () => {
  test("robots.txt declares Content-Signal preferences", async () => {
    const robots = await readFile(join(PUBLIC_DIR, "robots.txt"), "utf-8");
    expect(robots).toContain("Content-Signal: ai-train=no, search=yes, ai-input=yes");
  });

  test("agent skill markdown artifacts exist", async () => {
    const skillNames = [
      "api-discovery",
      "oauth-authentication",
      "mcp-setup",
      "docs-navigation",
    ];

    for (const name of skillNames) {
      const filePath = join(PUBLIC_DIR, ".well-known", "agent-skills", name, "SKILL.md");
      await expect(access(filePath, constants.R_OK)).resolves.toBeNull();
    }
  });
});
