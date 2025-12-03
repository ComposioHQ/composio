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

    // Serve static llms.txt for both /llm.txt and /llms.txt
    if (url.pathname === '/llms.txt' || url.pathname === '/llm.txt') {
      // Always fetch the llms.txt file, regardless of which path was requested
      const llmsRequest = new Request(new URL('/llms.txt', request.url).toString(), request);
      return env.ASSETS.fetch(llmsRequest);
    }

    // Serve robots-only/tools.json
    if (url.pathname === '/robots-only/tools.json') {
      return env.ASSETS.fetch(request);
    }

    // Everything else — proxy to origin that docs.composio.dev points to
    return fetch(request);
  },
};
