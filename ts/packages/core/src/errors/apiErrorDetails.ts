/**
 * @fileoverview Helpers for lifting the Composio API error envelope onto SDK errors.
 *
 * Not exported from the error barrel: these are implementation details shared by
 * the tool error classes and the models that wrap API failures.
 *
 * @module errors/apiErrorDetails
 */
import type { APIError } from '@composio/client';

/** Prefix a message with the API's own message, when the response carried one. */
export const withApiErrorMessage = (message: string, details: APIError['details']): string =>
  details?.message ? `${message}: ${details.message}` : message;

/** The API's `suggested_fix` as a one-item list, or nothing so the caller's default applies. */
export const apiErrorSuggestedFixes = (details: APIError['details']): string[] | undefined =>
  details?.suggested_fix ? [details.suggested_fix] : undefined;
