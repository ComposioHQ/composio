import { eveChannel } from 'eve/channels/eve';
import { none } from 'eve/channels/auth';

/**
 * HTTP channel for the docs assistant.
 *
 * The docs are public and any visitor can open the chat, so the session routes
 * are unauthenticated (`none()`). This intentionally exposes the agent endpoint
 * publicly; before production we should add rate limiting and abuse protection
 * (or gate it behind the site's own auth).
 */
export default eveChannel({ auth: [none()] });
