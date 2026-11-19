## How do I connect Daytona with an API key?

Use an API key when you want to connect with your own Daytona credentials. Daytona's OAuth runs through Auth0 without self-serve client credentials, so you can't bring your own OAuth app; the alternative is Composio-managed OAuth.

### Create the Daytona API key

1. Sign in and open the [Daytona API keys page](https://app.daytona.io/dashboard/keys).
2. Create a new key. Give it a name and set permissions or an expiry if the form offers them.
3. Copy the key and store it somewhere safe. Daytona usually shows it only once.

### Create the auth config in Composio

1. In the Composio dashboard, go to **Auth Configs**, click **Create Auth Config**, and select **Daytona**.
2. Choose the **API Key** authentication type and create the auth config.
3. Click **Connect Account** and paste your API key. If the key has access to more than one Daytona organization, also enter the organization ID, found on the [Daytona settings page](https://app.daytona.io/dashboard/settings).
4. Confirm the account shows as **Active**.

See [Custom auth configs](/docs/auth-configuration/custom-auth-configs) for the general flow.
