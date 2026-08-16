import { ComposioBlockedInternalUrlError } from '../errors/SsrfErrors';

/**
 * Edge runtimes do not expose the DNS resolution APIs needed to prove that a
 * hostname is publicly routable before connecting. Fail closed instead of
 * falling back to an unguarded fetch.
 */
export const ssrfSafeFetch = async (rawUrl: string): Promise<Response> => {
  throw new ComposioBlockedInternalUrlError(
    'URL file uploads are not supported in edge runtimes because the destination cannot be safely validated',
    {
      url: rawUrl,
      possibleFixes: [
        'Fetch the public URL yourself and pass a File or ArrayBuffer instead',
        'Run the URL upload in a Node.js or Bun runtime',
      ],
    }
  );
};

/**
 * Unguarded `fetch`, for the call sites that must keep working here.
 *
 * Failing closed is the right default for a URL the caller chose to upload, but
 * applying it to Tool Router session file transfers would take a working
 * feature away from Workers instead of closing a hole reachable there. The
 * guard exists to stop a URL from reaching private address space the SDK's host
 * can see; an edge worker has no such vantage point — it cannot resolve DNS to
 * check, and its `fetch` does not originate inside the caller's network. The
 * Node build applies the full guard.
 */
export const ssrfSafeFetchWhereSupported = async (
  rawUrl: string,
  init: RequestInit = {}
): Promise<Response> => fetch(rawUrl, init);
