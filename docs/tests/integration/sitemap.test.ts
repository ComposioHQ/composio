/**
 * Sitemap coverage of the legacy reference tree.
 *
 * The v3.0 pages stay in the sitemap deliberately. `llms.txt`, `llms-full.txt`,
 * and the Context7 ingest are read by machines that generate code, and those
 * are the channels steered toward v3.1. The sitemap is read by search engines
 * serving humans — including the existing v3 customers this work explicitly
 * does not ask to migrate.
 *
 * This test is the lock on that decision: dropping those pages has to be a
 * deliberate edit here, gated on measured traffic, rather than a silent side
 * effect of an agent-channel change.
 */
import { describe, test, expect } from "bun:test";
import { fetchPage } from "./helpers";

describe("sitemap", () => {
  test("/sitemap.xml serves XML and still lists the legacy reference tree", async () => {
    const res = await fetchPage("/sitemap.xml");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type") || "").toContain("xml");

    const body = await res.text();
    expect(body).toContain("https://docs.composio.dev/reference/v3/");
  });
});
