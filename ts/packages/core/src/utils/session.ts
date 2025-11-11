import { BaseComposioProvider } from '../provider/BaseProvider';
import { version } from '../../package.json';
import { ComposioRequestHeaders } from '../types/composio.types';

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

export function getSessionHeaders(
  provider: BaseComposioProvider<unknown, unknown, unknown> | undefined
) {
  return {
    'x-framework': provider?.name || 'unknown',
    'x-source': 'TYPESCRIPT_SDK',
    'x-runtime': RUNTIME_ENV,
    'x-sdk-version': version,
  };
}

export const getDefaultHeaders = (
  headers: ComposioRequestHeaders | undefined,
  provider: BaseComposioProvider<unknown, unknown, unknown> | undefined
) => {
  const sessionHeaders = getSessionHeaders(provider);
  return {
    ...(headers || {}),
    ...sessionHeaders,
  };
};
