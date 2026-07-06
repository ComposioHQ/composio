## Why can't I configure individual scopes for Calendly?

Calendly does not let end users selectively approve individual scopes during the OAuth connection flow. The scopes configured in your Calendly OAuth app are the scopes that will be requested during authorization, and the resulting access token will include that configured permission set.

To change Calendly permissions, update the scopes in your OAuth app/auth config and reconnect the account so a new token is issued with the updated scopes.
