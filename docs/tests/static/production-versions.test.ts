/**
 * Production-version guard for the published toolkit catalog.
 *
 * Companion to production-urls.test.ts. That guard catches staging *hostnames*
 * leaking into the committed docs data; this one catches staging *versions*.
 *
 * The "Docs - Update Data" workflow snapshots `public/data/toolkits.json` from the
 * backend every ~5h and auto-commits it. When it is (mis)pointed at STAGING, the
 * `version` field leaks: staging bumps the ENTIRE catalog to a single internal
 * version per day (e.g. `20260703_00`), so ~all toolkits report the same version.
 * Production releases per-toolkit, so its versions are diverse and no single value
 * dominates the catalog.
 *
 * This surfaced in a customer report (2026-07-08): every toolkit page showed
 * "Latest version: 20260703_00", an internal version that does not exist on
 * production (Gmail's real latest was 20260702_01). The hostname guard did not
 * catch it because a version string is not a URL.
 *
 * Independent oracle: the thresholds are stated directly here and are NOT derived
 * from the data, so a staging-sourced regeneration fails CI instead of silently
 * republishing. Empirically, production's most common version covers ~0.73 of the
 * versioned catalog across ~25 distinct versions; a whole-catalog staging snapshot
 * is ~0.95 across a handful. Note `00000000_00` is a legitimate production value
 * for a few unreleased toolkits, so it is NOT treated as a staging signal.
 */
import { describe, test, expect } from "bun:test";
import { readFile } from "fs/promises";
import { join } from "path";

const DATA_DIR = join(import.meta.dir, "../../public/data");

/** Released toolkit versions are date-stamped: `YYYYMMDD_NN` (incl. `00000000_00`). */
const VERSION_RE = /^\d{8}_\d{2}$/;

/**
 * Max fraction of versioned toolkits that may share one version. Production sits
 * near 0.73; a whole-catalog staging bump sits near 0.95. 0.90 separates them with
 * headroom on both sides. A legitimate breach is a canary worth investigating, not
 * a value to quietly raise.
 */
const MAX_SINGLE_VERSION_SHARE = 0.9;

/**
 * Min distinct versions across the catalog. Production carries ~25; a staging
 * snapshot carries a handful (the leak that prompted this guard had 7). 10 catches
 * the staging signature with room to spare.
 */
const MIN_DISTINCT_VERSIONS = 10;

interface Toolkit {
  slug: string;
  version: string | null;
}

async function loadToolkits(): Promise<Toolkit[]> {
  const raw = await readFile(join(DATA_DIR, "toolkits.json"), "utf-8");
  return JSON.parse(raw) as Toolkit[];
}

describe("Toolkit versions - no staging leak", () => {
  test("every non-null version is a valid date-stamped version", async () => {
    const toolkits = await loadToolkits();
    const offenders = toolkits
      .filter((t) => t.version != null && !VERSION_RE.test(t.version))
      .map((t) => `${t.slug}: ${t.version}`);
    expect(offenders).toEqual([]);
  });

  test("versions are diverse and no single one dominates the catalog", async () => {
    const toolkits = await loadToolkits();
    const versioned = toolkits
      .map((t) => t.version)
      .filter((v): v is string => v != null);

    // Guard needs a meaningful sample; the catalog is ~1k toolkits.
    expect(versioned.length).toBeGreaterThan(100);

    const counts = new Map<string, number>();
    for (const v of versioned) counts.set(v, (counts.get(v) ?? 0) + 1);

    const topCount = Math.max(...counts.values());
    const share = topCount / versioned.length;

    // A staging whole-catalog bump collapses both metrics at once: one version
    // covers ~all toolkits, and the distinct count drops to a handful.
    expect(counts.size).toBeGreaterThanOrEqual(MIN_DISTINCT_VERSIONS);
    expect(share).toBeLessThan(MAX_SINGLE_VERSION_SHARE);
  });
});
