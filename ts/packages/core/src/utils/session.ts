import type { BaseComposioProvider } from '../provider/BaseProvider';
// Resolve against the installed package, including slim's copy of the core build.
import manifest from '#client_identity' with { type: 'json' };
import type { ClientIdentity } from '@composio/client';

/**
 * Extended globalThis interface for runtime detection
 */
interface ExtendedGlobalThis {
  Bun?: unknown;
  Deno?: unknown;
  caches?: unknown;
  WebSocketPair?: unknown;
  EdgeRuntime?: unknown;
  ServiceWorkerGlobalScope?: new () => unknown;
  WorkerGlobalScope?: new () => unknown;
  importScripts?: (url: string) => void;
}

/**
 * Detect the JavaScript runtime environment without importing any external modules.
 * Uses only built-in globals to avoid breaking in different environments.
 */
function detectRuntime(): string {
  const global = globalThis as ExtendedGlobalThis;

  // Check for Bun
  if ('Bun' in global && typeof global.Bun !== 'undefined') {
    return 'BUN';
  }

  // Check for Deno
  if ('Deno' in global && typeof global.Deno !== 'undefined') {
    return 'DENO';
  }

  // Check for Node.js
  if (typeof process !== 'undefined' && process.versions && process.versions.node) {
    return 'NODEJS';
  }

  // Check for Cloudflare Workers
  if (
    'caches' in global &&
    typeof global.caches !== 'undefined' &&
    'WebSocketPair' in global &&
    typeof global.WebSocketPair !== 'undefined'
  ) {
    return 'CLOUDFLARE_WORKERS';
  }

  // Check for Vercel Edge Runtime
  if ('EdgeRuntime' in global && typeof global.EdgeRuntime !== 'undefined') {
    return 'VERCEL_EDGE';
  }

  // Check for Service Worker
  if (
    'ServiceWorkerGlobalScope' in global &&
    typeof global.ServiceWorkerGlobalScope !== 'undefined'
  ) {
    const ServiceWorkerScope = global.ServiceWorkerGlobalScope;
    if (ServiceWorkerScope && global instanceof ServiceWorkerScope) {
      return 'SERVICE_WORKER';
    }
  }

  // Check for Web Worker
  if (
    'WorkerGlobalScope' in global &&
    typeof global.WorkerGlobalScope !== 'undefined' &&
    'importScripts' in global &&
    typeof global.importScripts === 'function'
  ) {
    return 'WEB_WORKER';
  }

  // Check for React Native
  if (typeof navigator !== 'undefined' && navigator.product === 'ReactNative') {
    return 'REACT_NATIVE';
  }

  // Check for Browser
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    return 'BROWSER';
  }

  // Fallback
  return 'UNKNOWN';
}

// Detect once at module initialization
const RUNTIME_ENV = detectRuntime();

/**
 * An identity value is sent as a header, so the client accepts only non-empty
 * printable ASCII with no leading or trailing whitespace.
 */
const HEADER_SAFE = /^[\x21-\x7e](?:[\x20-\x7e]*[\x21-\x7e])?$/;

/**
 * The identity the API client reports for this SDK: its product headers
 * (`x-client-provenance`, `x-client-version`, `x-sdk-version`) and the legacy
 * `x-source`, `x-framework` and `x-runtime` labels. The client adds the
 * library headers and detects the runtime and its version itself.
 *
 * A custom provider whose name cannot be sent as a header value is reported
 * as `unknown` rather than making the SDK fail to construct.
 */
export function getClientIdentity(
  provider: BaseComposioProvider<unknown, unknown, unknown> | undefined
): ClientIdentity {
  const framework = provider?.name;
  return {
    product: manifest.name,
    version: manifest.version,
    source: 'TYPESCRIPT_SDK',
    framework: framework && HEADER_SAFE.test(framework) ? framework : 'unknown',
    runtime: RUNTIME_ENV,
  };
}
