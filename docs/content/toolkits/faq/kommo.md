## What should I know about Kommo regional amoCRM domains?

The current Kommo auth flow is tied to the `kommo.com` domain and does not provide a dashboard or API override for the OAuth authorization endpoint. Regional amoCRM domains such as `.amocrm.ru` are not supported today. Treat regional endpoint support as a toolkit feature request, not a user-side configuration issue.

## The Kommo Subdomain field

The Kommo Subdomain field takes only the part before `.kommo.com` in the account URL. For `https://your-company.kommo.com`, enter `your-company`, not an email domain and not a value with `.com` or dots. If a failed connection already exists, delete it, reconnect, and enter the corrected subdomain.
