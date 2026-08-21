## Request a toolkit, tool, trigger, or partnership

The same public request board covers all three request types:

- a new toolkit or integration;
- a missing tool or action in an existing toolkit;
- a missing trigger or event in an existing toolkit.

Submit any of these requests at https://request.composio.dev/boards/tool-requests. Include the provider or toolkit, the exact tool/action/API endpoint or trigger/event, and your use case. The request board is the source of truth for status; an ETA is not guaranteed.

If your company wants its own product added to Composio, apply with a company
work email and product details at https://composio.dev/partnerships#apply. The
public partnership form asks for company, product, and proposed-journey context.

## Security, privacy, data-retention, and compliance information

Use https://trust.composio.dev/ for general security, privacy, data-retention, audit, and compliance information. If the Trust Center does not answer your question, contact Composio support. Use the documented Dashboard self-service path for ordinary organization deletion. Report potential vulnerabilities privately through the security-reporting channels below; direct legal requests, data-erasure requests beyond the self-service flow, and account-specific access questions to Composio support.

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
