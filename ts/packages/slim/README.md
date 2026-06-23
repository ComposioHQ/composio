# `@composio/slim`

Slim build of the Composio TypeScript core SDK.

`@composio/core` intentionally publishes SDK docs and TypeScript source for users who want an inspectable/debuggable package. `@composio/slim` publishes the same built runtime/type artifacts without the packaged `docs/` or `src/` trees.

```bash
pnpm add @composio/slim
```

```ts
import { Composio } from '@composio/slim';

const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
```

The API mirrors `@composio/core` for consumers that prefer a smaller installed package.
