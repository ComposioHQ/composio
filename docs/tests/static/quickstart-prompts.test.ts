/**
 * Quickstart PromptBanner static validation.
 *
 * Validates prompt content quality directly from the MDX source:
 * - All 6 integration variants have prompts
 * - Each prompt has the required sections (concepts, rules, deprecated, verify)
 * - Prompts contain code examples (deprecated patterns)
 * - No markdown headings leak into TOC
 * - PromptBanner is stripped from LLM .md output
 */
import { describe, test, expect } from "bun:test";
import { readFile } from "fs/promises";
import { join } from "path";
import { mdxToCleanMarkdown } from "../../lib/source";

const QUICKSTART_PATH = join(
  import.meta.dir,
  "../../content/docs/quickstart.mdx"
);

let rawContent: string;
let blocks: string[];

describe("Quickstart PromptBanner", () => {
  test("quickstart.mdx has 6 PromptBanner blocks (one per integration variant)", async () => {
    rawContent = await readFile(QUICKSTART_PATH, "utf-8");
    blocks =
      rawContent.match(/<PromptBanner>([\s\S]*?)<\/PromptBanner>/g) ?? [];
    expect(blocks.length).toBe(6);
  });

  test("each prompt has required sections", () => {
    const required = [
      "**Key concepts**",
      "**Rules**",
      "ALWAYS:",
      "NEVER:",
      "**Deprecated",
      "**Verify before responding**",
    ];
    const errors: string[] = [];

    for (let i = 0; i < blocks.length; i++) {
      for (const section of required) {
        if (!blocks[i].includes(section)) {
          errors.push(`Prompt #${i + 1}: missing "${section}"`);
        }
      }
    }

    expect(errors).toEqual([]);
  });

  test("each prompt has code in deprecated section", () => {
    const errors: string[] = [];

    for (let i = 0; i < blocks.length; i++) {
      const afterDeprecated = blocks[i].split("**Deprecated")[1] ?? "";
      const hasCodeFence = afterDeprecated.includes("```");
      if (!hasCodeFence) {
        errors.push(`Prompt #${i + 1}: deprecated section has no code examples`);
      }
    }

    expect(errors).toEqual([]);
  });

  test("each prompt mentions session-based pattern", () => {
    const errors: string[] = [];

    for (let i = 0; i < blocks.length; i++) {
      if (!blocks[i].includes("session") && !blocks[i].includes("Session")) {
        errors.push(`Prompt #${i + 1}: doesn't mention sessions`);
      }
    }

    expect(errors).toEqual([]);
  });

  test("each prompt warns against deprecated composio.tools.get()", () => {
    const errors: string[] = [];

    for (let i = 0; i < blocks.length; i++) {
      if (!blocks[i].includes("composio.tools.get()")) {
        errors.push(`Prompt #${i + 1}: missing composio.tools.get() deprecation warning`);
      }
    }

    expect(errors).toEqual([]);
  });

  test("no markdown headings inside prompts (would pollute TOC)", () => {
    const errors: string[] = [];

    for (let i = 0; i < blocks.length; i++) {
      const withoutCode = blocks[i].replace(/```[\s\S]*?```/g, "");
      const heading = withoutCode.match(/^#{1,6}\s+/m);
      if (heading) {
        errors.push(
          `Prompt #${i + 1}: contains heading "${heading[0].trim()}" — use **bold** instead`
        );
      }
    }

    expect(errors).toEqual([]);
  });

  test("mdxToCleanMarkdown strips all PromptBanner blocks from .md output", () => {
    const cleaned = mdxToCleanMarkdown(rawContent);
    expect(cleaned).not.toContain("<PromptBanner>");
    expect(cleaned).not.toContain("</PromptBanner>");
    expect(cleaned).not.toContain("ALWAYS:");
    expect(cleaned).not.toContain("Deprecated (DO NOT use)");
  });
});
