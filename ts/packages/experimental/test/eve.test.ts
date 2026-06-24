import type { ExecuteToolFn, Tool, ToolExecuteResponse } from "@composio/core";
import { describe, expect, it, vi } from "vitest";
import { EveProvider, denyEveToolCall } from "../src/eve";

const tool = (slug: string): Tool =>
  ({
    slug,
    name: slug,
    description: `desc ${slug}`,
    inputParameters: { type: "object", properties: { q: { type: "string" } } },
  }) as unknown as Tool;

const ok = (data: Record<string, unknown> = {}): ToolExecuteResponse => ({
  data,
  error: null,
  successful: true,
});

describe("EveProvider", () => {
  it("identifies as the eve provider", () => {
    expect(new EveProvider().name).toBe("eve");
  });

  it("wraps tools by slug with description and schema", () => {
    const execute: ExecuteToolFn = vi.fn(async () => ok());
    const wrapped = new EveProvider().wrapTools([tool("GITHUB_CREATE_ISSUE")], execute);
    const eveTool = wrapped.GITHUB_CREATE_ISSUE;
    expect(eveTool).toBeDefined();
    expect(eveTool.description).toBe("desc GITHUB_CREATE_ISSUE");
    expect(eveTool.inputSchema).toEqual({ type: "object", properties: { q: { type: "string" } } });
  });

  it("executes through Composio's executeTool", async () => {
    const execute: ExecuteToolFn = vi.fn(async () => ok({ url: "x" }));
    const wrapped = new EveProvider().wrapTools([tool("GMAIL_SEND_EMAIL")], execute);
    const result = await wrapped.GMAIL_SEND_EMAIL.execute({ q: "hi" }, {} as never);
    expect(execute).toHaveBeenCalledWith("GMAIL_SEND_EMAIL", { q: "hi" });
    expect(result).toEqual(ok({ url: "x" }));
  });

  it("lets an execute hook deny a call", async () => {
    const execute: ExecuteToolFn = vi.fn(async () => ok());
    const provider = new EveProvider({
      hooks: { execute: (ctx) => ctx.deny("blocked") },
    });
    const wrapped = provider.wrapTools([tool("COMPOSIO_MULTI_EXECUTE_TOOL")], execute);
    const result = await wrapped.COMPOSIO_MULTI_EXECUTE_TOOL.execute({ q: "x" }, {} as never);
    expect(execute).not.toHaveBeenCalled();
    expect(result).toEqual(denyEveToolCall("blocked"));
  });
});
