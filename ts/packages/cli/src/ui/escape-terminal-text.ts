/**
 * Display encoding for text that did not come from the CLI itself (event fields, API messages,
 * tool and proxy responses) and is about to reach a terminal or a captured transcript.
 *
 * Every C0 control (U+0000–U+001F), DEL (U+007F) and C1 control (U+0080–U+009F) becomes a
 * visible JSON-style `\uXXXX` escape, so the text can neither change terminal state nor split
 * one record into several lines. Printable Unicode and backslashes are left as they are. Apply
 * it to decoded text before styling, so the CLI's own colors still render.
 *
 * The code points involved are all in the Basic Multilingual Plane and outside the surrogate
 * range, so walking UTF-16 code units never splits an astral character.
 */
const isEscaped = (code: number, keepLineBreaks: boolean): boolean => {
  if (keepLineBreaks && (code === 0x0a || code === 0x09)) return false;
  return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
};

const escapeControls = (text: string, keepLineBreaks: boolean): string => {
  let escaped = '';
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (isEscaped(code, keepLineBreaks)) {
      escaped += `${text.slice(start, index)}\\u${code.toString(16).padStart(4, '0')}`;
      start = index + 1;
    }
  }
  return start === 0 ? text : escaped + text.slice(start);
};

/** For one-line display fields and records: every control, line breaks and tabs included. */
export const escapeTerminalText = (text: string): string => escapeControls(text, false);

/**
 * For intentionally multiline display (notes, pretty-printed JSON): CRLF becomes LF, LF and TAB
 * stay, and every other control, a lone CR included, is escaped.
 */
export const escapeTerminalLines = (text: string): string =>
  escapeControls(text.replaceAll('\r\n', '\n'), true);
