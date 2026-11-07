import { isDeprecationNotice } from '@composio/client/effect';
import { Logger } from 'effect';

/**
 * Drops the API client's deprecation notices, which CLI users cannot act on,
 * and passes every other record to `logger`.
 */
export const withoutClientNotices = <Message, Output>(
  logger: Logger.Logger<Message, Output>
): Logger.Logger<Message, Output | undefined> =>
  Logger.make(options => (isDeprecationNotice(options) ? undefined : logger.log(options)));
