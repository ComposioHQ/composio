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
