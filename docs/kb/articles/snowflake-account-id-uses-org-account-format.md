For Composio's current Snowflake OAuth connection-initiation field, enter the Account ID as the hostname label `org-account`, for example `myorg-myaccount`.

## Format the connection value

Use the organization and account names joined with a hyphen. Do not include `https://` or the `.snowflakecomputing.com` suffix. Store the auth-config ID with the customer so each tenant connects through that customer's Snowflake OAuth configuration.

This hyphenated value is specific to the current Composio connection field. Do not assume every Snowflake API or SQL surface uses the same format; some provider surfaces use `org.account`. If the connection field changes, treat the current toolkit metadata as the final authority.

Use [Composio authentication](/docs/authentication) for the connection workflow and Snowflake's [account identifier documentation](https://docs.snowflake.com/en/user-guide/admin-account-identifier) for provider identifier formats.
