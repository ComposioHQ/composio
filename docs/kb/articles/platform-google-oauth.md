## An unapproved Google OAuth scope can block consent

Google can block sign-in when an OAuth app requests a sensitive or restricted
scope that is not approved for that app. Use the scopes already available on
the selected Composio auth config, or create a customer-owned Google OAuth app
and complete Google's required verification before requesting additional
scopes. After changing scopes, create a fresh connection so the user grants the
new scope set.

Google's current verification requirements are documented in its
[OAuth 2.0 policies](https://developers.google.com/identity/protocols/oauth2/policies)
and [sensitive-scope verification guide](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification).

## A customer-owned OAuth app controls the provider consent-screen brand

Use a customer-owned Google OAuth app when the Google consent screen should
show the customer's app name and branding. A callback forwarder on the
customer's domain still redirects the browser to Composio; it does not hide
Composio's domain. The forwarding endpoint receives the authorization code and
state, so its query string must not be logged. See
[callback-domain limits](/docs/authentication/white-labeling-authentication#routing-the-callback-through-your-domain).

The OAuth app's authorized redirect URI must still match the callback URI
shown by Composio. Provider consent-screen branding and the URL to which the
customer's application sends a user after authentication are separate settings.
