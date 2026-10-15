import { Logger } from 'effect';

const isClientNotice = (message: unknown): boolean =>
  Array.isArray(message) && typeof message[0] === 'string' && message[0].startsWith('Composio: ');

/**
 * Drops the deprecation notices `@composio/client/effect` logs (`Composio: ...`),
 * which CLI users cannot act on, and passes every other record to `logger`.
 */
export const withoutClientNotices = <Message, Output>(
  logger: Logger.Logger<Message, Output>
): Logger.Logger<Message, Output | undefined> =>
  Logger.make(options => (isClientNotice(options.message) ? undefined : logger.log(options)));
