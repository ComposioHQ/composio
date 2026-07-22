import { afterEach, describe, expect, mock, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("next/navigation", () => ({
  usePathname: () => "/reference/api-reference/tasks",
}));

const { ApiEndpointsTable } = await import("../../components/api-endpoints-table");
const { ApiPageTitle } = await import("../../components/api-page-title");
const { isApiPageDeprecated } = await import("../../lib/api-deprecation");

const DOCS_DIR = join(import.meta.dir, "../..");
const GENERATOR_PATH = join(DOCS_DIR, "scripts/generate-api-index.ts");
const fixtureDirectories: string[] = [];

interface SerializedEndpoint {
  method: string;
  pathV31: string;
  pathV3: string;
  summary: string;
  href: string;
  legacy?: boolean;
}

function createSpec(version: "v3.1" | "v3") {
  return {
    tags: [{ name: "Tasks", description: "Task endpoints" }],
    paths: {
      [`/${version}/tasks/deprecated`]: {
        get: {
          tags: ["Tasks"],
          summary: "Deprecated task endpoint",
          operationId: "getDeprecatedTask",
          deprecated: true,
        },
      },
      [`/${version}/tasks/active`]: {
        post: {
          tags: ["Tasks"],
          summary: "Active task endpoint",
          operationId: "createTask",
        },
      },
    },
  };
}

function parseEndpoints(content: string): SerializedEndpoint[] {
  const prefix = "<ApiEndpointsTable endpoints={";
  const start = content.indexOf(prefix);
  const end = content.indexOf("} />", start);

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);

  return JSON.parse(content.slice(start + prefix.length, end));
}

function expectedEndpoints(hrefPrefix: string): SerializedEndpoint[] {
  return [
    {
      method: "GET",
      pathV31: "/v3.1/tasks/deprecated",
      pathV3: "/v3/tasks/deprecated",
      summary: "Deprecated task endpoint",
      href: `${hrefPrefix}/tasks/getDeprecatedTask`,
      legacy: true,
    },
    {
      method: "POST",
      pathV31: "/v3.1/tasks/active",
      pathV3: "/v3/tasks/active",
      summary: "Active task endpoint",
      href: `${hrefPrefix}/tasks/createTask`,
    },
  ];
}

async function generateFixture(): Promise<string> {
  const fixtureDir = await mkdtemp(join(tmpdir(), "composio-api-index-"));
  fixtureDirectories.push(fixtureDir);

  await mkdir(join(fixtureDir, "public"), { recursive: true });
  await writeFile(
    join(fixtureDir, "public/openapi.json"),
    JSON.stringify(createSpec("v3.1")),
  );
  await writeFile(
    join(fixtureDir, "public/openapi-v3.json"),
    JSON.stringify(createSpec("v3")),
  );

  const process = Bun.spawn([Bun.argv[0], GENERATOR_PATH], {
    cwd: fixtureDir,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stderr] = await Promise.all([
    process.exited,
    new Response(process.stderr).text(),
  ]);

  if (exitCode !== 0) {
    throw new Error(`API index generator failed with exit code ${exitCode}: ${stderr}`);
  }

  return fixtureDir;
}

afterEach(async () => {
  await Promise.all(
    fixtureDirectories.splice(0).map(path => rm(path, { recursive: true })),
  );
});

describe("deprecated API endpoints", () => {
  test("renders Legacy on a deprecated API endpoint detail title", () => {
    const operation = {
      method: "get",
      path: "/v3.1/tasks/deprecated",
    };
    const pageData = {
      getSchema: () => ({
        dereferenced: {
          paths: {
            [operation.path]: {
              [operation.method]: { deprecated: true },
            },
          },
        },
      }),
    };

    const deprecated = isApiPageDeprecated(pageData, [operation]);
    const html = renderToStaticMarkup(
      <ApiPageTitle
        title="Deprecated task endpoint"
        version="3.1"
        deprecated={deprecated}
      />,
    );

    expect(deprecated).toBe(true);
    expect(html.match(/>Legacy<\/span>/g)).toHaveLength(1);
    expect(html).toContain(
      'title="Deprecated API endpoint; kept for existing integrations and may be removed in a future release"',
    );
  });

  test("omits Legacy from an active API endpoint detail title", () => {
    const operation = {
      method: "post",
      path: "/v3.1/tasks/active",
    };
    const pageData = {
      getSchema: () => ({
        dereferenced: {
          paths: {
            [operation.path]: {
              [operation.method]: {},
            },
          },
        },
      }),
    };

    const deprecated = isApiPageDeprecated(pageData, [operation]);
    const html = renderToStaticMarkup(
      <ApiPageTitle
        title="Active task endpoint"
        version="3.1"
        deprecated={deprecated}
      />,
    );

    expect(deprecated).toBe(false);
    expect(html).not.toContain(">Legacy</span>");
  });

  test("serializes legacy only for deprecated v3.1 and v3 operations", async () => {
    const fixtureDir = await generateFixture();
    const v31Content = await readFile(
      join(fixtureDir, "content/reference/api-reference/tasks/index.mdx"),
      "utf-8",
    );
    const v3Content = await readFile(
      join(fixtureDir, "content/reference/v3/api-reference/tasks/index.mdx"),
      "utf-8",
    );

    const v31Endpoints = parseEndpoints(v31Content);
    const v3Endpoints = parseEndpoints(v3Content);

    expect(v31Endpoints).toEqual(expectedEndpoints("/reference/api-reference"));
    expect(v3Endpoints).toEqual(expectedEndpoints("/reference/v3/api-reference"));

    for (const endpoints of [v31Endpoints, v3Endpoints]) {
      expect(
        endpoints.find(endpoint => endpoint.summary === "Active task endpoint"),
      ).not.toHaveProperty("legacy");
    }
  });

  test("renders one Legacy badge for a deprecated endpoint and none for an active endpoint", () => {
    const html = renderToStaticMarkup(
      <ApiEndpointsTable
        endpoints={[
          {
            method: "GET",
            pathV31: "/v3.1/tasks/deprecated",
            pathV3: "/v3/tasks/deprecated",
            summary: "Deprecated task endpoint",
            href: "/reference/api-reference/tasks/getDeprecatedTask",
            legacy: true,
          },
          {
            method: "POST",
            pathV31: "/v3.1/tasks/active",
            pathV3: "/v3/tasks/active",
            summary: "Active task endpoint",
            href: "/reference/api-reference/tasks/createTask",
          },
        ]}
      />,
    );

    expect(
      html.match(
        /title="Deprecated API endpoint; kept for existing integrations and may be removed in a future release"/g,
      ),
    ).toHaveLength(1);
    expect(html.match(/>Legacy<\/span>/g)).toHaveLength(1);
  });
});
