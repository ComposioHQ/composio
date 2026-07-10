# `@composio/slim`

Slim build of the Composio TypeScript core SDK.

`@composio/core` intentionally ships its TypeScript source and SDK docs inside the npm package so coding agents (and humans) can inspect and debug the SDK straight from `node_modules`. That inspectability costs install size. `@composio/slim` publishes the same built runtime and type artifacts without the packaged `src/` and `docs/` trees, so it installs smaller while behaving identically.

```bash
pnpm add @composio/slim
```

```ts
import { Composio } from '@composio/slim';

const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
```

The API mirrors `@composio/core` for consumers that prefer a smaller installed package. See the [`@composio/core` README](https://github.com/ComposioHQ/composio/tree/next/ts/packages/core) for usage.
