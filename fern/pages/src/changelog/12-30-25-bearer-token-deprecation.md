## Deprecating `BEARER_TOKEN` auth scheme for 20 toolkits

We’ve **deprecated** the `BEARER_TOKEN` auth scheme for the following **20 toolkits**:

- `airtable`
- `baserow`
- `discord`
- `discordbot`
- `formsite`
- `gmail`
- `googlecalendar`
- `googledocs`
- `googledrive`
- `googleslides`
- `googlesuper`
- `hubspot`
- `microsoft_clarity`
- `onepage`
- `pipedrive`
- `prisma`
- `sentry`
- `slack`
- `slackbot`
- `trello`

### Recommendation

For these toolkits, we recommend using **alternative auth schemes** (for example, `OAUTH2`, `API_KEY`, or other toolkit-supported schemes) instead of `BEARER_TOKEN`.

### Backward compatibility (explicit)

This change is **fully backward compatible**:

- **Existing** auth configs and connected accounts created with `BEARER_TOKEN` **will continue to function**.
- **Creating new** auth configs and connected accounts with `BEARER_TOKEN` **will continue to work** (e.g., via API/SDK).
- To discourage new usage, `BEARER_TOKEN` auth configs / connected accounts **will not be displayed in the UI** for these toolkits.

