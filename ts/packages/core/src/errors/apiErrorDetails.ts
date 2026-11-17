/**
 * @fileoverview Helpers for lifting the Composio API error envelope onto SDK errors.
 *
 * Not exported from the error barrel: these are implementation details shared by
 * the tool error classes and the models that wrap API failures.
 *
 * @module errors/apiErrorDetails
 */
import type { APIError } from '@composio/client';

// CSI, OSC, and other ESC sequences a terminal would act on.
const ANSI_ESCAPE = /\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007\u001b]*(?:\u0007|\u001b\\)|[@-_])/g;
// C0/C1 controls, DEL, and the Unicode line separators that can forge output lines.
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;

/** Make a server-controlled string safe to print in a terminal or a single log line. */
export const sanitizeApiErrorText = (value: string): string =>
  value.replace(ANSI_ESCAPE, ' ').replace(CONTROL_CHARACTERS, ' ').replace(/\s+/g, ' ').trim();

/**
 * Prefix a message with the API's own message, when the response carried one.
 * `fallback` is the underlying error's message for failures without an HTTP
 * response, such as a timeout or a connection error.
 */
export const withApiErrorMessage = (
  message: string,
  details: APIError['details'],
  fallback?: string
): string => {
  const reason = details?.message ?? fallback;
  const safeReason = reason ? sanitizeApiErrorText(reason) : '';
  return safeReason ? `${message}: ${safeReason}` : message;
};

/** The API's `suggested_fix` as a one-item list, or nothing so the caller's default applies. */
export const apiErrorSuggestedFixes = (details: APIError['details']): string[] | undefined => {
  const fix = details?.suggested_fix;
  const safeFix = fix ? sanitizeApiErrorText(fix) : '';
  return safeFix ? [safeFix] : undefined;
};
