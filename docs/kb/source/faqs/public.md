---
type: "reference"
title: "Current Support FAQs"
description: "Public answers for recurring Composio support issues."
category: "authentication"
visibility: "public"
timestamp: "2026-07-14T12:55:03Z"
tags:
  - "faq"
  - "faqs"
---
# Current Support FAQs

## Route toolkit requests and toolkit partnership applications

The same public request board covers all three request types:

- a new toolkit or integration;
- a missing tool or action in an existing toolkit;
- a missing trigger or event in an existing toolkit.

Direct all three to https://request.composio.dev/boards/tool-requests. Ask them to include the provider or toolkit, the exact tool/action/API endpoint or trigger/event, and their use case. Do not send one of these request types somewhere else, and do not promise an ETA. If the request type is unclear, ask one focused clarification so they can file it with the right details.

When a company wants its own product added to Composio, direct a representative
with a company work email and product details to
https://composio.dev/partnerships#apply instead. The public partnership form asks
for company, product, and proposed-journey context. Do not treat unrelated sales,
SEO, recruiting, or sponsorship pitches as toolkit-partnership requests.

## Security, privacy, data-retention, and compliance information

Direct general security, privacy, data-retention, audit, and compliance questions to https://trust.composio.dev/. Do not infer or restate policy details that are not present in approved public material. If the Trust Center does not answer the customer's question, offer human follow-up. Use the documented Dashboard self-service path for ordinary organization deletion. Substantive vulnerability details, legal data-erasure requests beyond that flow, legal requests, and customer-specific access questions still require specialist review.

## Security reporting

If you believe you have found a potential security vulnerability in Composio,
please report it privately through the channels in our
[security policy](https://github.com/ComposioHQ/composio/security/policy). A
private GitHub Security Advisory is the preferred route, with
`security@composio.dev` available as an email alternative.

Include enough detail to help the team reproduce and assess the finding, but do
not include customer data, credentials, or other secrets.

## Google `access_not_configured` requires a Workspace for Education administrator

Google documents `400 access_not_configured` as a Workspace for Education app
access-policy error. The institution's Workspace administrator must configure
access for the app; changing Composio scopes or repeatedly reconnecting does not
resolve that policy decision.

If the organization allows users to request access, the user can submit the
request from Google's error page. An administrator with the required Security
settings privilege can review pending requests or configure the exact OAuth
client under **Security → Access and data control → API controls → Manage
App Access**. The administrator should use the access level and organizational
unit appropriate for the institution. Google says policy changes can take up to
24 hours, though they usually apply sooner.

Do not generalize this code to every Google Workspace account. Distinguish it
from `admin_policy_enforced`, `access_denied`, and unverified-app errors before
giving instructions.

## Plaid bank linking and Item access tokens

### Which authentication type does Plaid use?

The Plaid toolkit uses `API_KEY` authentication with your Plaid `client_id`, an
environment-specific `secret`, and an optional Item `access_token`. Plaid Link
is the bank-consent flow that produces the token you need for bank-data tools.
It is not a Composio-managed OAuth connection.

### Why can I connect but not read bank accounts or transactions?

Client credentials let you use supported institution and Link setup tools.
Account, balance, and transaction tools also need the Item `access_token` for
the linked bank. A successful connection alone does not verify access to bank
data.

Run [Plaid Link](https://plaid.com/docs/link/) in your application, exchange its
`public_token` on your backend with
[`/item/public_token/exchange`](https://plaid.com/docs/api/items/#itempublic_tokenexchange),
and securely store the resulting `access_token` on the corresponding Composio
connected account. Do not put an Item token on a shared auth config.

### Can I use Hosted Link instead of embedding Plaid Link?

You can create a Hosted Link through `PLAID_CREATE_LINK_TOKEN`. Your backend
still needs to handle completion, obtain the exchangeable `public_token`,
exchange it, and store the resulting Item token.
Creating a link does not complete that flow for you. See
[Plaid Hosted Link](https://plaid.com/docs/link/hosted-link/) for completion
handling.

### Can one connected account represent multiple linked banks?

Use a separate connected account for each Plaid Item. Keep each Item token
associated with the correct application user and connected account. Never
overwrite one user's token with another user's token.

### Which environment should I select?

The toolkit defaults to `sandbox`. Use credentials and Item tokens from the
selected environment. For live bank data, select `production` and use the
required Plaid production access and product permissions. Sandbox success does
not verify a production workflow.

### Where should I put secrets?

Keep the Plaid secret, Item `access_token`, and token exchange on your backend.
Do not put them in frontend code, prompts, screenshots, Slack messages, or logs.
The toolkit does not return Item access tokens or public tokens in action
outputs.
