export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Serve static llms.txt
    if (url.pathname === '/llms.txt') {
      return env.ASSETS.fetch(request);
    }

    // Everything else — proxy to origin that docs.composio.dev points to
    return fetch(request);
  }
}