/**
 * Deprecated API-reference operation tests.
 *
 * `operation.deprecated === true` in the committed specs is the single source
 * of truth for hiding operations from the reference and redirecting their old
 * URLs. These assertions are spec-driven (they iterate whatever ops are
 * deprecated today rather than hard-coding one operationId), plus a targeted
 * regression for the current `getFilesList` case.
 *
 * Covers:
 *  - U1 / R2: deprecated ops absent from the generated per-tag overview tables.
 *  - U2 / R1: derived hidden-URL set + page-tree filtering.
 *  - U3 / R3: derived tag-index redirects (308 permanent).
 */
import { describe, test, expect } from "bun:test";
import { readdir, readFile } from "fs/promises";
import { join } from "path";
import {
  slugify,
  deprecatedUrlsFromSpec,
  deprecatedRedirectsFromSpec,
  getDeprecatedReferenceUrls,
  getDeprecatedReferenceRedirects,
} from "../../lib/deprecated-ops.mjs";
import { prepareTree } from "../../lib/filter-api-version";

const DOCS_ROOT = join(import.meta.dir, "../..");
const REFERENCE_DIR = join(DOCS_ROOT, "content/reference");

/** The two committed specs and the URL base each mounts under. */
const SPECS = [
  { file: "public/openapi.json", baseDir: "api-reference" },
  { file: "public/openapi-v3.json", baseDir: "v3/api-reference" },
];

async function loadSpec(file: string): Promise<any> {
  return JSON.parse(await readFile(join(DOCS_ROOT, file), "utf-8"));
}

/** Deprecated reference URLs across both committed specs. */
async function allDeprecatedUrls(): Promise<string[]> {
  const urls: string[] = [];
  for (const { file, baseDir } of SPECS) {
    urls.push(...deprecatedUrlsFromSpec(await loadSpec(file), baseDir));
  }
  return urls;
}

/** Recursively find every index.mdx under content/reference. */
async function findIndexMdx(dir: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) results.push(...(await findIndexMdx(full)));
    else if (entry.name === "index.mdx") results.push(full);
  }
  return results;
}

/** Collect every page URL reachable from a page-tree node. */
function collectUrls(node: any): string[] {
  const urls: string[] = [];
  const visit = (n: any) => {
    if (n?.url) urls.push(n.url);
    if (n?.index) visit(n.index);
    for (const child of n?.children ?? []) visit(child);
  };
  visit(node);
  return urls;
}

describe("Deprecated ops — overview table (U1, R2/R4)", () => {
  test("no deprecated op URL appears in any generated index.mdx", async () => {
    const urls = await allDeprecatedUrls();
    const indexFiles = await findIndexMdx(REFERENCE_DIR);
    const contents = await Promise.all(indexFiles.map((f) => readFile(f, "utf-8")));
    const offending = urls.filter((url) => contents.some((c) => c.includes(url)));
    expect(offending).toEqual([]);
  });

  test("files index (v3.1 + v3.0) drops getFilesList and its (DEPRECATED) summary", async () => {
    const files = [
      "content/reference/api-reference/files/index.mdx",
      "content/reference/v3/api-reference/files/index.mdx",
    ];
    const contents = await Promise.all(
      files.map((f) => readFile(join(DOCS_ROOT, f), "utf-8")),
    );
    expect(contents.some((c) => c.includes("getFilesList"))).toBe(false);
    expect(contents.some((c) => c.includes("(DEPRECATED)"))).toBe(false);
    // The tag survives (it still has non-deprecated ops), so its index remains.
    expect(contents.every((c) => c.includes("postFilesUploadRequest"))).toBe(true);
  });
});

describe("Deprecated ops — hidden URLs + tree filter (U2, R1/R4/R5)", () => {
  test("getDeprecatedReferenceUrls returns exactly the two getFilesList URLs", () => {
    expect([...getDeprecatedReferenceUrls()].sort()).toEqual([
      "/reference/api-reference/files/getFilesList",
      "/reference/v3/api-reference/files/getFilesList",
    ]);
  });

  test("deprecated set contains deprecated URLs and excludes a normal op URL", () => {
    const set = getDeprecatedReferenceUrls();
    expect(set.has("/reference/api-reference/files/getFilesList")).toBe(true);
    expect(set.has("/reference/api-reference/files/postFilesUploadRequest")).toBe(false);
  });

  test("prepareTree drops the deprecated page, keeps its sibling (v3.1)", () => {
    const tree = {
      children: [
        {
          type: "folder",
          name: "files",
          children: [
            { type: "page", name: "getFilesList", url: "/reference/api-reference/files/getFilesList" },
            { type: "page", name: "upload", url: "/reference/api-reference/files/postFilesUploadRequest" },
          ],
        },
      ],
    };
    const urls = collectUrls(prepareTree(tree as never, "3.1"));
    expect(urls).toContain("/reference/api-reference/files/postFilesUploadRequest");
    expect(urls).not.toContain("/reference/api-reference/files/getFilesList");
  });

  test("prepareTree drops the deprecated page, keeps its sibling (v3.0)", () => {
    const tree = {
      children: [
        {
          type: "folder",
          name: "v3",
          children: [
            {
              type: "folder",
              name: "files",
              children: [
                { type: "page", name: "getFilesList", url: "/reference/v3/api-reference/files/getFilesList" },
                { type: "page", name: "upload", url: "/reference/v3/api-reference/files/postFilesUploadRequest" },
              ],
            },
          ],
        },
      ],
    };
    const urls = collectUrls(prepareTree(tree as never, "3.0"));
    expect(urls).toContain("/reference/v3/api-reference/files/postFilesUploadRequest");
    expect(urls).not.toContain("/reference/v3/api-reference/files/getFilesList");
  });

  test("edge: a spec with no deprecated ops yields no hidden URLs", () => {
    const spec = { paths: { "/x": { get: { operationId: "getX", tags: ["Files"] } } } };
    expect(deprecatedUrlsFromSpec(spec, "api-reference")).toEqual([]);
  });

  test("edge: tree with no deprecated nodes is left intact", () => {
    const tree = {
      children: [
        { type: "page", name: "upload", url: "/reference/api-reference/files/postFilesUploadRequest" },
      ],
    };
    const urls = collectUrls(prepareTree(tree as never, "3.1"));
    expect(urls).toContain("/reference/api-reference/files/postFilesUploadRequest");
  });
});

describe("Deprecated ops — redirects (U3, R3/R4/R5)", () => {
  test("every deprecated op URL has exactly one 308 redirect to its tag index", async () => {
    const redirects = getDeprecatedReferenceRedirects();
    const urls = await allDeprecatedUrls();
    for (const url of urls) {
      const matches = redirects.filter((r) => r.source === url);
      expect(matches.length).toBe(1);
      const tagIndex = url.split("/").slice(0, -1).join("/");
      // tag index when the tag has surviving ops, else the /reference fallback
      expect([tagIndex, "/reference"]).toContain(matches[0].destination);
      expect(matches[0].permanent).toBe(true);
    }
  });

  test("regression: getFilesList redirects to the files tag index in both versions", () => {
    const redirects = getDeprecatedReferenceRedirects();
    expect(redirects).toContainEqual({
      source: "/reference/api-reference/files/getFilesList",
      destination: "/reference/api-reference/files",
      permanent: true,
    });
    expect(redirects).toContainEqual({
      source: "/reference/v3/api-reference/files/getFilesList",
      destination: "/reference/v3/api-reference/files",
      permanent: true,
    });
  });

  test("edge: an all-deprecated tag falls back to /reference", () => {
    const spec = {
      paths: { "/x": { get: { deprecated: true, operationId: "getX", tags: ["Ghost"] } } },
    };
    expect(deprecatedRedirectsFromSpec(spec, "api-reference")).toEqual([
      { source: "/reference/api-reference/ghost/getX", destination: "/reference", permanent: true },
    ]);
  });
});

describe("Deprecated ops — slugify parity", () => {
  test("slugify lowercases and hyphenates tag names", () => {
    expect(slugify("Files")).toBe("files");
    expect(slugify("Invite Codes")).toBe("invite-codes");
  });
});
