## What should I know about Kommo regional amoCRM domains?

- Candidate evidence sources: 4

Candidate-only evidence indicates the current Kommo auth flow is tied to the kommo.com domain and does not provide a dashboard or API workaround for overriding the OAuth authorization endpoint to regional amoCRM domains such as .amocrm.ru. Treat regional endpoint support as a toolkit feature request or product fix rather than a user-side configuration issue.

## How should I handle kommo Subdomain should be only the account subdomain, not an email domain?

- Candidate evidence sources: 1

Candidate-only evidence indicates the Kommo Subdomain field should contain only the part before .kommo.com from the user's Kommo account URL. For example, for https://contatoandresetti.kommo.com, enter contatoandresetti, not an email domain and not a value with .com or dots. If a failed connection already exists, delete it, reconnect, and enter the corrected subdomain.
