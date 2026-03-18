# LobsterMail Toolkit Example

Register [LobsterMail](https://lobstermail.ai) as a set of custom tools in Composio so any AI agent can self-provision email inboxes, send and receive email, search messages, and configure webhooks.

## Prerequisites

1. A Composio API key (`COMPOSIO_API_KEY`).
2. A LobsterMail API key (`LOBSTERMAIL_API_KEY`). Get one instantly via `POST https://api.lobstermail.ai/v1/signup`.

Copy `.env.example` to `.env` and fill in both keys.

## Quick start

```bash
pnpm install
pnpm start
```

## Tools registered

| Slug | Description |
|------|-------------|
| `LOBSTERMAIL_CREATE_INBOX` | Create a new email inbox |
| `LOBSTERMAIL_LIST_INBOXES` | List all inboxes on the account |
| `LOBSTERMAIL_SEND_EMAIL` | Send an email from a verified inbox |
| `LOBSTERMAIL_LIST_EMAILS` | List emails in an inbox |
| `LOBSTERMAIL_GET_EMAIL` | Get a single email with full body |
| `LOBSTERMAIL_SEARCH_EMAILS` | Search emails with filters |
| `LOBSTERMAIL_LIST_THREADS` | List conversation threads |
| `LOBSTERMAIL_CREATE_WEBHOOK` | Register a webhook for email events |
| `LOBSTERMAIL_GET_ACCOUNT` | Get account details and usage |

## Learn more

- [LobsterMail docs](https://lobstermail.ai/docs)
- [OpenAPI spec](https://api.lobstermail.ai/v1/docs/openapi)
- [Composio custom tools](https://docs.composio.dev/docs/tools-direct/custom-tools)
