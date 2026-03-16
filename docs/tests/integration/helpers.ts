/** Shared helpers for integration tests that hit the running dev/prod server. */

export const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";

/** Fetch a URL from the docs server with a timeout */
export async function fetchPage(
  path: string,
  options?: RequestInit & { timeout?: number }
): Promise<Response> {
  const { timeout = 10_000, ...fetchOpts } = options || {};
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    return await fetch(`${BASE_URL}${path}`, {
      ...fetchOpts,
      signal: controller.signal,
      redirect: "follow",
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch without following redirects to inspect redirect behavior */
export async function fetchNoRedirect(
  path: string,
  options?: RequestInit & { timeout?: number }
): Promise<Response> {
  const { timeout = 10_000, ...fetchOpts } = options || {};
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    return await fetch(`${BASE_URL}${path}`, {
      ...fetchOpts,
      signal: controller.signal,
      redirect: "manual",
    });
  } finally {
    clearTimeout(timer);
  }
}
