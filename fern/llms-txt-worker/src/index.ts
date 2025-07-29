interface Env {
  ASSETS: {
    fetch: (request: Request) => Promise<Response>;
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Serve static llms.txt
    if (url.pathname === '/llms.txt') {
      return env.ASSETS.fetch(request);
    }

    // Serve robots-only/tools.json
    if (url.pathname === '/robots-only/tools.json') {
      return env.ASSETS.fetch(request);
    }

    // Everything else — proxy to origin that docs.composio.dev points to
    return fetch(request);
  },
};
