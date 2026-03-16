/**
 * Toolkit data integrity tests.
 *
 * Validates that toolkits.json and toolkits-list.json exist, are valid JSON,
 * and contain the expected structure.
 */
import { describe, test, expect } from "bun:test";
import { readFile } from "fs/promises";
import { join } from "path";

const DATA_DIR = join(import.meta.dir, "../../public/data");

interface ToolkitListItem {
  slug: string;
  name: string;
  logo: string;
  category: string;
  toolCount: number;
  triggerCount: number;
}

interface ToolkitFull extends ToolkitListItem {
  description: string;
  authSchemes: string[];
  tools: Array<{ slug: string; name: string; description: string }>;
}

describe("Toolkit data - toolkits.json", () => {
  let data: ToolkitFull[];

  test("file exists and is valid JSON", async () => {
    const raw = await readFile(join(DATA_DIR, "toolkits.json"), "utf-8");
    data = JSON.parse(raw);
    expect(Array.isArray(data)).toBe(true);
  });

  test("has a reasonable number of toolkits (> 50)", () => {
    expect(data.length).toBeGreaterThan(50);
  });

  test("each toolkit has required fields", () => {
    const invalid: string[] = [];

    for (const toolkit of data) {
      if (!toolkit.slug || typeof toolkit.slug !== "string") {
        invalid.push(`missing slug: ${JSON.stringify(toolkit).slice(0, 80)}`);
        continue;
      }
      if (!toolkit.name || typeof toolkit.name !== "string") {
        invalid.push(`${toolkit.slug}: missing name`);
      }
      if (typeof toolkit.toolCount !== "number") {
        invalid.push(`${toolkit.slug}: missing toolCount`);
      }
      if (!Array.isArray(toolkit.authSchemes)) {
        invalid.push(`${toolkit.slug}: missing authSchemes array`);
      }
    }

    expect(invalid).toEqual([]);
  });

  test("no duplicate slugs", () => {
    const slugs = data.map((t) => t.slug);
    const duplicates = slugs.filter((s, i) => slugs.indexOf(s) !== i);
    expect(duplicates).toEqual([]);
  });

  test("well-known toolkits exist", () => {
    const slugs = new Set(data.map((t) => t.slug));
    const expected = ["github", "gmail", "slack", "notion"];
    const missing = expected.filter((s) => !slugs.has(s));
    expect(missing).toEqual([]);
  });
});

describe("Toolkit data - toolkits-list.json", () => {
  let data: ToolkitListItem[];

  test("file exists and is valid JSON", async () => {
    const raw = await readFile(join(DATA_DIR, "toolkits-list.json"), "utf-8");
    data = JSON.parse(raw);
    expect(Array.isArray(data)).toBe(true);
  });

  test("list count matches full data count", async () => {
    const fullRaw = await readFile(join(DATA_DIR, "toolkits.json"), "utf-8");
    const full = JSON.parse(fullRaw);
    expect(data.length).toBe(full.length);
  });

  test("each entry has required list fields", () => {
    const invalid: string[] = [];

    for (const item of data) {
      if (!item.slug) invalid.push("missing slug");
      if (!item.name) invalid.push(`${item.slug}: missing name`);
      if (typeof item.toolCount !== "number")
        invalid.push(`${item.slug}: missing toolCount`);
    }

    expect(invalid).toEqual([]);
  });
});
