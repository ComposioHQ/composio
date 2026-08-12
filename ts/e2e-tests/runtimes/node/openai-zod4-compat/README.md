# OpenAI v7 + Zod v4 Compatibility Test

Verifies that packed `@composio/core` and `@composio/openai` packages work with
`openai@7` and `zod@4`.

## Background

Issue [#2336](https://github.com/ComposioHQ/composio/issues/2336) reported peer dependency conflicts for users with `zod@4`.

## What It Tests

| Test                | Description                                               |
| ------------------- | --------------------------------------------------------- |
| npm install         | Installs packed Composio packages with OpenAI 7 and Zod 4 |
| TypeScript          | Checks exported provider types against OpenAI 7           |
| Package integration | Verifies all packages work together without conflicts     |
| wrapTool            | Confirms both OpenAI provider surfaces wrap tools         |

## Fixture

```
fixtures/
├── index.mjs      # Offline runtime assertions
├── index.ts       # Exported-type compatibility checks
├── package.json   # Explicit OpenAI 7 and Zod 4 dependencies
└── tsconfig.json  # Strict consumer compiler settings
```

The setup phase packs the Composio packages, installs them with explicit
OpenAI 7 and Zod 4 versions, and typechecks without `skipLibCheck`.

`@composio/json-schema-to-zod` is packed alongside `@composio/core` and
`@composio/openai` even though the fixture never imports it directly. `pnpm
pack` rewrites `@composio/core`'s `workspace:*` dependency on it to the exact
workspace version, so installing the core tarball alone makes npm fetch that
version from the registry. On a release branch the workspace version is the
one about to be published and does not exist yet, which fails the install.
Packing it locally keeps the fixture resolvable before publication.

## Setup

The runtime phase constructs clients with fake keys and never makes a network
request.

## Isolation Tool

**Docker** with Node.js versions: 22.22.3, 24.17.0, 25.9.0.

## Running

```bash
pnpm test:e2e
```
