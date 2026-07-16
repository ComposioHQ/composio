import { parse as parseJsonWithComments } from 'comment-json';
import JSON5 from 'json5';

export const parseJsonIsh = (raw: string): unknown => {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    try {
      return parseJsonWithComments(raw, undefined, true) as unknown;
    } catch {
      // JSON5 covers the documented "JSON or JS-style object literal" contract
      // (unquoted keys, single quotes, trailing commas, comments) without
      // evaluating the input. If this fails too, let the error propagate.
      return JSON5.parse(raw) as unknown;
    }
  }
};
