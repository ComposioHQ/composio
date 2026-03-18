# LobsterMail — Toolkit Integration Request

**Website:** https://lobstermail.ai
**API base URL:** https://api.lobstermail.ai
**OpenAPI spec:** https://api.lobstermail.ai/v1/docs/openapi (also included as `openapi.yaml`)

## What is LobsterMail?

Email infrastructure purpose-built for AI agents. LobsterMail lets agents self-provision
email inboxes, send and receive email, register custom domains, and configure webhooks
through a simple REST API.

## Why add it as a native Composio toolkit?

AI agents frequently need email capabilities — receiving confirmation emails, sending
outreach, monitoring inboxes for replies. LobsterMail is designed specifically for this
use case (agent-first, API-only, instant provisioning, no human verification required
to start).

Adding it as a native toolkit would let any Composio-connected agent gain email
capabilities with zero setup beyond authentication.

## Authentication

Bearer token in `Authorization` header. Tokens are prefixed `lm_sk_test_` (sandbox) or
`lm_sk_live_` (production). Agents can self-provision accounts via `POST /v1/signup`
(no auth required).

## Key actions for the toolkit

| Action | Method | Path | Description |
|--------|--------|------|-------------|
| Create inbox | POST | /v1/inboxes | Provision a new email inbox |
| List inboxes | GET | /v1/inboxes | List all inboxes |
| Send email | POST | /v1/emails/send | Send email from a verified inbox |
| List emails | GET | /v1/inboxes/:id/emails | Poll inbox for messages |
| Get email | GET | /v1/inboxes/:id/emails/:emailId | Get full email content |
| Search emails | GET | /v1/emails/search | Full-text search with filters |
| List threads | GET | /v1/inboxes/:id/threads | Conversation threading |
| Create webhook | POST | /v1/webhooks | Subscribe to email events |
| Get account | GET | /v1/account | Account details and usage |

## Files in this directory

- `openapi.yaml` — Full OpenAPI 3.1.0 specification (production-ready)
- This README

## Example

See `ts/examples/lobstermail-toolkit/` for a working Composio custom tools integration.
