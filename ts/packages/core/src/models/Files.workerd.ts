/**
 * @fileoverview Files class stub for Cloudflare Workers / Edge runtimes.
 * File upload and download operations are not supported in these environments.
 *
 * @author Composio Team
 * @module Files
 */
import ComposioClient from '@composio/client';

const UNSUPPORTED_MESSAGE =
  'File operations (upload/download) are not supported in Cloudflare Workers or Edge runtimes. ' +
  'These operations require Node.js-specific APIs (Buffer, crypto, file system) that are not available ' +
  'in this environment. Please use a Node.js runtime for file operations.';

/**
 * Creates a Proxy that throws a user-friendly error when any method is accessed.
 * This ensures that users get a clear error message when attempting to use
 * file operations in unsupported environments.
 */
const createUnsupportedFilesProxy = (): Files => {
  const handler: ProxyHandler<object> = {
    get(_target, prop) {
      // Allow access to constructor name for debugging
      if (prop === Symbol.toStringTag) {
        return 'Files';
      }
      if (prop === 'constructor') {
        return Files;
      }
      // For any method access, return a function that throws
      return () => {
        throw new Error(UNSUPPORTED_MESSAGE);
      };
    },
  };

  return new Proxy({}, handler) as Files;
};

/**
 * Files class for Cloudflare Workers / Edge runtimes.
 * All methods throw an error indicating that file operations are not supported.
 */
export class Files {
  constructor(_client: ComposioClient) {
    // Return a Proxy instead of the actual instance
    return createUnsupportedFilesProxy();
  }
}
