import { beforeAll, describe, expect, it } from "@jest/globals";
import { getTestConfig } from "../../config/getTestConfig";
import { CloudflareToolSet } from "./cloudflare";

describe("Apps class tests", () => {
  let cloudflareToolSet: CloudflareToolSet;
  beforeAll(() => {
    cloudflareToolSet = new CloudflareToolSet({
      apiKey: getTestConfig().COMPOSIO_API_KEY,
      baseUrl: getTestConfig().BACKEND_HERMES_URL,
    });
  });

  it("check if tools are coming", async () => {
    const tools = await cloudflareToolSet.getTools({
      actions: ["GITHUB_GITHUB_API_ROOT"],
    });

    expect(tools.length).toBe(1);
  });

  it("check if apps are coming", async () => {
    const tools = await cloudflareToolSet.getTools({
      actions: ["CODEINTERPRETER_GET_FILE_CMD"],
    });

    expect(tools.length).toBe(1);
  });

  it("check if send email is coming", async () => {
    const tools = await cloudflareToolSet.getTools({
      actions: ["GMAIL_SEND_EMAIL"],
    });

    expect(tools.length).toBe(1);
  });
});
