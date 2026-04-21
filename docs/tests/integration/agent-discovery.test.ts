import { describe, test, expect } from "bun:test";
import { fetchNoRedirect, fetchPage } from "./helpers";

describe("Agent discovery headers", () => {
  test("homepage redirect exposes Link headers", async () => {
    const res = await fetchNoRedirect("/");
    expect(res.status).toBe(307);

    const link = res.headers.get("link") || "";
    expect(link).toContain('rel="api-catalog"');
    expect(link).toContain('rel="service-desc"');
    expect(link).toContain('rel="service-doc"');
  });

  test("docs home exposes Link headers", async () => {
    const res = await fetchPage("/docs");
    expect(res.status).toBe(200);

    const link = res.headers.get("link") || "";
    expect(link).toContain("/.well-known/api-catalog");
    expect(link).toContain("/.well-known/mcp/server-card.json");
  });
});

describe("Agent discovery endpoints", () => {
  test("api catalog returns application/linkset+json", async () => {
    const res = await fetchPage("/.well-known/api-catalog");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/linkset+json");

    const data = await res.json();
    expect(Array.isArray(data.linkset)).toBe(true);
    expect(data.linkset.length).toBeGreaterThan(0);
  });

  test("openid configuration exposes issuer and endpoints", async () => {
    const res = await fetchPage("/.well-known/openid-configuration");
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toHaveProperty("issuer");
    expect(data).toHaveProperty("authorization_endpoint");
    expect(data).toHaveProperty("token_endpoint");
    expect(data).toHaveProperty("jwks_uri");
  });

  test("oauth protected resource metadata exposes auth servers", async () => {
    const res = await fetchPage("/.well-known/oauth-protected-resource");
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(Array.isArray(data.authorization_servers)).toBe(true);
    expect(data.authorization_servers.length).toBeGreaterThan(0);
  });

  test("mcp server card publishes nested metadata", async () => {
    const res = await fetchPage("/.well-known/mcp/server-card.json");
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toHaveProperty("serverInfo.name");
    expect(data).toHaveProperty("serverInfo.version");
    expect(data).toHaveProperty("transport.type");
    expect(data).toHaveProperty("capabilities.tools");
  });

  test("agent skills index publishes digests", async () => {
    const res = await fetchPage("/.well-known/agent-skills/index.json");
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.$schema).toContain("agentskills.io");
    expect(Array.isArray(data.skills)).toBe(true);
    expect(data.skills.length).toBeGreaterThan(0);
    expect(data.skills[0].digest).toContain("sha256:");
  });
});
