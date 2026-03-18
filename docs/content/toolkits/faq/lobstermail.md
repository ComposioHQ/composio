## What is LobsterMail?

LobsterMail is email infrastructure built for AI agents. It lets agents self-provision inboxes, send and receive email, register custom domains, and configure webhooks — all through a REST API. No human verification is required to start; agents can create accounts and inboxes programmatically.

## How do I authenticate with LobsterMail?

Pass a Bearer token in the `Authorization` header. Tokens use the prefix `lm_sk_test_` (sandbox) or `lm_sk_live_` (production). You can create a new account and get a token instantly via `POST https://api.lobstermail.ai/v1/signup`.

## What can I do with LobsterMail through Composio?

Core actions include: creating email inboxes, sending emails, listing and reading received emails, searching across inboxes, viewing conversation threads, and registering webhooks for real-time notifications on email events (received, bounced, delivered).

## Are there usage limits?

Yes. LobsterMail uses a tier system. The free anonymous tier (Tier 0) allows 5 inboxes and 100 emails/month but cannot send. After verification (Tier 1+), sending is enabled with increasing limits up to 10,000 sends/day on the Scale tier. See the [pricing page](https://lobstermail.ai) for details.

## Why am I getting a 403 INSUFFICIENT_TIER error?

Some actions (like sending email) require a verified account (Tier 1 or above). Verify your account via X (Twitter) verification or by adding a payment method through the billing endpoint.

## Why am I getting 429 rate limit errors?

All endpoints are rate-limited. The response includes a `Retry-After` header indicating when you can retry. If you consistently hit limits, consider upgrading to a higher tier for increased quotas.

## Can I use a custom domain?

Yes, Tier 2+ accounts can register custom email domains via `POST /v1/domains`. You'll need to add the provided DNS records (MX, SPF, DKIM, DMARC) and verify them.

---
