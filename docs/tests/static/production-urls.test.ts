/**
 * Production-URL guard for published docs artifacts.
 *
 * The "Docs - Update Data" workflow fetches the OpenAPI specs and toolkit data
 * from STAGING every ~5h and auto-commits the regenerated files. Staging hosts
 * have leaked into the committed docs before (the API-reference curl base URL
 * pointed at `http://staging-apollo.composio.dev`), so this test fails CI on any
 * regeneration PR that ships a non-production host.
 *
 * This is an independent oracle: the expected production URL and the banned
 * staging hosts are stated here directly and are intentionally NOT imported from
 * scripts/production-api.mjs. A wrong edit to that generator constant must make
 * this test fail, not move the expectation with it.
 */
import { describe, test, expect } from "bun:test";
import { readFile, readdir } from "fs/promises";
import { join } from "path";

const PUBLIC_DIR = join(import.meta.dir, "../../public");
const DATA_DIR = join(PUBLIC_DIR, "data");

const EXPECTED_SERVER = {
  url: "https://backend.composio.dev",
  description: "PRODUCTION API",
};

// Any non-production Composio host must never appear in published data.
const STAGING_HOST_RE = /staging-[a-z0-9-]*\.composio\.dev/gi;

const OPENAPI_SPECS = ["openapi.json", "openapi-v3.json"];

/** Read a file and return the distinct staging hosts it mentions, if any. */
async function findStagingHosts(absPath: string): Promise<string[]> {
  const contents = await readFile(absPath, "utf-8");
  const matches = contents.match(STAGING_HOST_RE) ?? [];
  const distinctHosts = [...new Set(matches)];
  return distinctHosts;
}

describe("OpenAPI specs - production server", () => {
  test.each(OPENAPI_SPECS)("%s servers[0] is the production API", async (spec) => {
    const raw = await readFile(join(PUBLIC_DIR, spec), "utf-8");
    const { servers } = JSON.parse(raw);
    expect(servers).toEqual([EXPECTED_SERVER]);
  });
});

describe("Published docs data - no staging hosts", () => {
  test.each(OPENAPI_SPECS)("%s has no staging host", async (spec) => {
    const stagingHosts = await findStagingHosts(join(PUBLIC_DIR, spec));
    expect(stagingHosts).toEqual([]);
  });

  test("every public/data/*.json has no staging host", async () => {
    const jsonFiles = (await readdir(DATA_DIR)).filter((file) => file.endsWith(".json"));

    const offenders: string[] = [];
    for (const file of jsonFiles) {
      const stagingHosts = await findStagingHosts(join(DATA_DIR, file));
      if (stagingHosts.length > 0) {
        offenders.push(`${file}: ${stagingHosts.join(", ")}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
