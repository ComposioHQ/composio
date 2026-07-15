/**
 * Toolkit search + category-grouping tests.
 *
 * Guards the /toolkits landing behavior (issue #3441): every raw category
 * resolves to a curated super-group, the mapping actually covers the catalog
 * (not everything silently falling to "Other"), and the Fuse.js config finds
 * toolkits for typo'd / partial queries.
 */
import { describe, test, expect } from "bun:test";
import { readFile } from "fs/promises";
import { join } from "path";
import Fuse from "fuse.js";
import {
  CATEGORY_GROUPS,
  TOOLKIT_FUSE_OPTIONS,
  groupForCategory,
} from "../../lib/toolkit-search";

const DATA_DIR = join(import.meta.dir, "../../public/data");

interface ToolkitListItem {
  slug: string;
  name: string;
  logo: string | null;
  category: string | null;
  toolCount: number;
  triggerCount: number;
}

async function loadToolkits(): Promise<ToolkitListItem[]> {
  const raw = await readFile(join(DATA_DIR, "toolkits-list.json"), "utf-8");
  return JSON.parse(raw);
}

describe("groupForCategory", () => {
  test("null category maps to Other", () => {
    expect(groupForCategory(null)).toBe("Other");
  });

  test("unknown category maps to Other", () => {
    expect(groupForCategory("totally-made-up-category")).toBe("Other");
  });

  test("is case- and whitespace-insensitive", () => {
    expect(groupForCategory("  Developer Tools  ")).toBe("Developer");
    expect(groupForCategory("CRM")).toBe("Sales & Marketing");
  });

  test("every mapped result is a declared group", () => {
    const known = new Set(CATEGORY_GROUPS);
    for (const category of ["developer tools", "crm", "analytics", null, "x"]) {
      expect(known.has(groupForCategory(category))).toBe(true);
    }
  });
});

describe("category grouping over the real catalog", () => {
  test("no category value throws and all resolve to a declared group", async () => {
    const toolkits = await loadToolkits();
    const known = new Set(CATEGORY_GROUPS);
    for (const t of toolkits) {
      expect(known.has(groupForCategory(t.category))).toBe(true);
    }
  });

  test("mapping covers the catalog — <20% falls through to Other", async () => {
    const toolkits = await loadToolkits();
    const other = toolkits.filter((t) => groupForCategory(t.category) === "Other");
    // If the data's category vocabulary drifts and everything falls to Other,
    // this fails loudly instead of shipping a useless filter.
    expect(other.length / toolkits.length).toBeLessThan(0.2);
  });

  test("each curated group (except Other) has at least one toolkit", async () => {
    const toolkits = await loadToolkits();
    const present = new Set(toolkits.map((t) => groupForCategory(t.category)));
    const missing = CATEGORY_GROUPS.filter(
      (g) => g !== "Other" && !present.has(g),
    );
    expect(missing).toEqual([]);
  });
});

describe("Fuse toolkit search", () => {
  test("finds toolkits for exact, partial, and typo'd queries", async () => {
    const toolkits = await loadToolkits();
    const fuse = new Fuse(toolkits, TOOLKIT_FUSE_OPTIONS);

    const topSlugs = (query: string, n = 5) =>
      fuse
        .search(query)
        .slice(0, n)
        .map((r) => r.item.slug);

    // Exact match ranks first.
    expect(topSlugs("slack")[0]).toBe("slack");
    // Partial / prefix.
    expect(topSlugs("git")).toContain("github");
    // Typo tolerance (missing char).
    expect(topSlugs("githb")).toContain("github");
    // Multi-word / spaced query against a compact slug.
    expect(topSlugs("google sheet")).toContain("googlesheets");
  });

  test("returns no matches for gibberish", async () => {
    const toolkits = await loadToolkits();
    const fuse = new Fuse(toolkits, TOOLKIT_FUSE_OPTIONS);
    expect(fuse.search("zzzxqvwk").length).toBe(0);
  });
});
