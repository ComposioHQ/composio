import type { AgentToolResult } from '@earendil-works/pi-coding-agent';

import type { PiDeniedResult, PiHookControls, PiToolDetails, PiToolResultFormatter } from './types';

export const denyPiToolCall = (error: string): PiDeniedResult => ({
  successful: false,
  error,
  data: null,
  denied: true,
});

export const hookControls: PiHookControls = {
  deny: denyPiToolCall,
};

export const defaultFormatResult: PiToolResultFormatter = result => JSON.stringify(result, null, 2);

export const stringifyError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const isPiDeniedResult = (value: unknown): value is PiDeniedResult =>
  !!value &&
  typeof value === 'object' &&
  (value as Partial<PiDeniedResult>).denied === true &&
  (value as Partial<PiDeniedResult>).successful === false;

export const toPiResult = (
  value: unknown,
  formatter: PiToolResultFormatter,
  details: PiToolDetails = {}
): AgentToolResult<PiToolDetails> => ({
  content: [{ type: 'text' as const, text: formatter(value) }],
  details: {
    ...details,
    denied: details.denied ?? (isPiDeniedResult(value) ? true : undefined),
    result: value,
  },
});

export const toPiErrorResult = (
  error: unknown,
  formatter: PiToolResultFormatter,
  details: PiToolDetails = {}
): AgentToolResult<PiToolDetails> => {
  const message = stringifyError(error);
  const value = {
    successful: false,
    error: message,
    data: null,
  };
  return {
    content: [{ type: 'text' as const, text: formatter(value) }],
    details: {
      ...details,
      error: message,
      result: value,
    },
  };
};
