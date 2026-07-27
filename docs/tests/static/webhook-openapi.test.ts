import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  validateWebhooksSpec,
  writeWebhooksSpecIfValid,
} from "../../scripts/fetch-openapi.mjs";

const fixtureDirectories: string[] = [];

function createWebhookSpec() {
  return {
    openapi: "3.1.0",
    tags: [{ name: "Webhook Events" }],
    webhooks: {
      "composio.test.event": {
        post: {
          operationId: "composio_test_event",
          tags: ["Webhook Events"],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { id: { type: "string" } },
                },
              },
            },
          },
        },
      },
    },
  };
}

afterEach(async () => {
  await Promise.all(
    fixtureDirectories.splice(0).map(path => rm(path, { recursive: true })),
  );
});

describe("webhook OpenAPI snapshot validation", () => {
  test("accepts the generated webhook contract", () => {
    expect(validateWebhooksSpec(createWebhookSpec())).toEqual({
      valid: true,
      eventCount: 1,
    });
  });

  test("keeps the last-good snapshot when a webhook entry is incomplete", async () => {
    const fixtureDir = await mkdtemp(join(tmpdir(), "composio-webhook-openapi-"));
    fixtureDirectories.push(fixtureDir);
    const outputPath = join(fixtureDir, "openapi-webhooks.json");
    const lastGoodSnapshot = JSON.stringify(createWebhookSpec(), null, 2);
    await writeFile(outputPath, lastGoodSnapshot);

    const written = writeWebhooksSpecIfValid(
      {
        openapi: "3.1.0",
        tags: [{ name: "Webhook Events" }],
        webhooks: { "composio.test.event": {} },
      },
      outputPath,
      "https://example.com/openapi-webhooks.json",
    );

    expect(written).toBe(false);
    expect(await readFile(outputPath, "utf-8")).toBe(lastGoodSnapshot);
  });
});
