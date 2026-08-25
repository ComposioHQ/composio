## NetSuite OAuth token exchange failures can be caused by generic OAuth endpoints

For NetSuite OAuth2 callback/token-exchange failures, verify whether the OAuth flow is using the customer's account-specific NetSuite authorize/token endpoint. NetSuite expects OAuth endpoints to be keyed to the NetSuite account subdomain; using a generic endpoint can produce a token-exchange failure that looks like a permissions or role problem. Check the decoded token-exchange response before advising the customer to change NetSuite roles.
