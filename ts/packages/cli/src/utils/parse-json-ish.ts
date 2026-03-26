import { parse as parseJsonWithComments } from 'comment-json';

export const parseJsonIsh = (raw: string): unknown => {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    try {
      return parseJsonWithComments(raw, undefined, true) as unknown;
    } catch {
      return Function(`"use strict"; return (${raw});`)() as unknown;
    }
  }
};
