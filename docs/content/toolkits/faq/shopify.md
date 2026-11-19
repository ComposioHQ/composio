## How do I set up custom OAuth credentials for Shopify?

Use your own app from the Shopify Dev Dashboard when you want to choose the scopes and the app name merchants see, or when the default app isn't available.

### Create the Shopify app

1. Sign in to your Shopify admin. If you don't have a store, start one at [shopify.com](https://www.shopify.com/).
2. Search for **App Development** in the admin search bar and open it, then click **Build apps in Dev Dashboard**.

3. Click **Create App**, enter an app name, and click **Create**. Shopify opens the app's version configuration.

   ![Shopify Dev Dashboard Create an app page with the app name and Create button](/images/toolkits/shopify/create-app.webp)

4. Set **App URL** to your application's URL.

   ![Shopify Create a version page with the App URL field](/images/toolkits/shopify/app-url.webp)

5. Select the access scopes your tools need, such as `read_products`, `write_products`, `read_orders`, `write_orders`, `read_customers`, and `read_inventory`.

   ![Shopify Select scopes dialog listing Admin API scopes](/images/toolkits/shopify/select-scopes.webp)

6. Set the redirect URL to `https://backend.composio.dev/api/v1/auth-apps/add`. It must exactly match the auth config's `oauth_redirect_uri` field.

   ![Shopify app version Access section with scopes filled in and the Composio redirect URL](/images/toolkits/shopify/scopes-redirect-url.webp)

7. Click **Release**, optionally add a version name and message, and click **Release** again.

   ![Shopify Release this new version dialog with optional version name and message](/images/toolkits/shopify/release-version.webp)

8. Open **Settings** in the left sidebar and copy the **Client ID** and **Client Secret**.

   ![Shopify Dev Dashboard Settings page with the Client ID and Secret under Credentials](/images/toolkits/shopify/client-credentials.webp)

### Create the auth config in Composio

1. In the [Composio dashboard](https://dashboard.composio.dev/~/project/auth-configs?utm_source=docs&utm_medium=content&utm_campaign=toolkits-shopify), go to **Auth Configs** → **Create** and select **Shopify**.
2. Choose **OAuth2** and your own credentials, then paste the Client ID and Client Secret. Keep the redirect URI as the value you registered in Shopify. Click **Create Auth Config**.

   ![Composio Shopify auth config Client id, Client secret and Composio redirect URI fields](/images/toolkits/shopify/own-credentials.webp)

3. Click **Connect Account** and enter the store subdomain: the permanent `myshopify.com` name, not a custom domain. For `https://acme.myshopify.com`, enter `acme`. You can find it under **Settings** → **Domains** in the Shopify admin.

4. Install the app on the store and grant the permissions. Confirm the account shows **Active** on the auth config's **Connected Accounts** tab.

See [custom auth configs](/docs/auth-configuration/custom-auth-configs) for the general flow.

### Scopes

The default auth config requests read and write access to products, orders, customers, inventory, fulfillments, content, themes, discounts, draft orders, metaobjects, webhooks, and more. Select the same scopes on the Shopify app, and remove the ones you don't need from both.

## Why am I seeing "App not found" when connecting Shopify?

The default Shopify OAuth app may be under review or expired. Use your own OAuth app or API authentication method until the default is restored.

## Shopify order update 403s can be caused by missing `read_all_orders` scope

Check the scopes on the Shopify connection. If order reads or updates require access beyond the default order scope set, reconnect with the needed order scopes such as `read_all_orders` before retrying.
