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
