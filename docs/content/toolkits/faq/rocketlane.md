## How do I connect Rocketlane with an API key?

Rocketlane connects with an API key. There's no OAuth option.

### Create the Rocketlane API key

1. Sign in to [Rocketlane](https://www.rocketlane.com/login). The key is tied to your user, so use the account whose data Composio should reach.
2. Click your profile icon in the bottom-left corner, then **Settings**.
3. Scroll to the **Advanced** section, where you manage API keys, and click **Create API Key**.

   ![Rocketlane Settings API page with the Create API key button](/images/toolkits/rocketlane/api-settings.webp)

4. Name the key, click **Add**, and copy it.

   ![Rocketlane Create API key dialog with the key name and Add button](/images/toolkits/rocketlane/create-api-key.webp)

Rocketlane API keys have no scopes. A key can reach whatever the issuing user can access under Rocketlane's role-based permissions, so create it from a user with only the access you want to grant.

### Create the auth config in Composio

1. In the [Composio dashboard](https://dashboard.composio.dev/), go to **Auth Configs** → **Create**, select **Rocketlane**, and click **Create Auth Config**.
2. Click **Connect Account**, enter a user ID, and paste the API key.
3. Confirm the account shows **Active** on the auth config's **Connected Accounts** tab.

See [custom auth configs](/docs/auth-configuration/custom-auth-configs) for the general flow.

To restrict which Composio tools can run, list them under **Tools Available for Execution** in the auth config's settings.
