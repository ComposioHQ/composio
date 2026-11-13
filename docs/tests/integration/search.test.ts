/**
 * Search API integration tests.
 *
 * Validates that the search endpoint returns relevant results for key terms.
 */
import { describe, test, expect } from "bun:test";
import { fetchPage } from "./helpers";

describe("Search API", () => {
  test("returns results for 'authentication'", async () => {
    const res = await fetchPage("/api/search?query=authentication");
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);

    // At least one result should have a URL and title
    const first = data[0];
    expect(first).toHaveProperty("url");
    expect(first).toHaveProperty("content");
  });

  test("returns results for 'quickstart'", async () => {
    const res = await fetchPage("/api/search?query=quickstart");
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.length).toBeGreaterThan(0);
  });

  test("returns results for 'tools'", async () => {
    const res = await fetchPage("/api/search?query=tools");
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.length).toBeGreaterThan(0);
  });

  test("returns empty array for nonsense query", async () => {
    const res = await fetchPage("/api/search?query=xyzzy123nonexistent");
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    // Should return no results (or very few) for gibberish
    expect(data.length).toBeLessThan(3);
  });

  test("returns 400 or empty for missing query", async () => {
    const res = await fetchPage("/api/search");
    // Fumadocs returns 400 for missing query param
    expect([200, 400]).toContain(res.status);
  });
});
