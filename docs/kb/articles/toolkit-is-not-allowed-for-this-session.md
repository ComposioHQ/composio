A non-empty `toolkits.enabled` list on a session blocks every toolkit that is not on it. A `toolkits.disabled` list does the inverse — the listed toolkits are blocked and the rest stay eligible.

This check runs before auth configs and connected accounts are looked up at all.

## Fix the session first

When Tool Router reports `[Session Restriction] Toolkit '<name>' is not allowed`, update or recreate the session's toolkit configuration. Only after that should you investigate whether the toolkit has an auth config and a working connection — until the allowlist admits the toolkit, a healthy connection makes no difference to the result.
